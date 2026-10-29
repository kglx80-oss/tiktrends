import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque V5 · fondation des DOSSIERS · sécurité et comportement, au
 * RÉSULTAT, sur une VRAIE base (pglite + migrations du dépôt, 0058 comprise).
 *
 * Le défaut que ces gardes empêchent · une action serveur reste appelable
 * directement ; cacher l'écran ne protège rien. Chaque action de
 * `app/actions/bibliotheque-dossiers.ts` applique `refusEcritureBibliotheque`
 * (rôle ET offre) AVANT toute écriture. On lit le RÉSULTAT · le refus rendu,
 * l'empreinte des tables (library_folders, assets) avant/après, et l'état réel
 * des lignes quand l'accès est ouvert.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));

import { db, schema, sql } from '@tiktrends/db';
import { and, eq } from 'drizzle-orm';
import { session, semer } from './studios-semis';
import * as actionsDossiers from '../app/actions/bibliotheque-dossiers';
import {
  creerDossierAction, supprimerDossierAction,
  restaurerDossierAction, affecterAssetDossierAction, definirDroitsAssetAction, definirTagDossierAction,
} from '../app/actions/bibliotheque-dossiers';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const A = { image: '', b: '' };

/** Empreinte de ce qu'un refus pourrait écrire · dossiers et assets, lignes ET contenu. */
async function empreinte(): Promise<string> {
  const out: string[] = [];
  for (const t of ['library_folders', 'assets']) {
    const r = await db!.execute(sql.raw(`select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), ',' order by md5(x::text)), '')) as h from public."${t}" x`));
    const [l] = ((r as unknown as { rows: Array<{ n: number; h: string }> }).rows);
    out.push(`${t}|${l!.n}|${l!.h}`);
  }
  return out.join('\n');
}

beforeAll(async () => {
  await semer(db, schema, ids);
  const [img] = await db!.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'flacon', kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png' }).returning();
  const [b] = await db!.insert(schema.assets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, name: 'secret B', kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png' }).returning();
  A.image = img!.id; A.b = b!.id;
});

/** Chaque action, appelée comme l'écran l'appellera · le nom sert au message d'échec. */
const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['creerDossierAction', () => creerDossierAction({ nom: 'Dossier' })],
  ['supprimerDossierAction', () => supprimerDossierAction({ id: 'x' })],
  ['restaurerDossierAction', () => restaurerDossierAction({ id: 'x' })],
  ['affecterAssetDossierAction', () => affecterAssetDossierAction({ assetId: A.image, folderId: null })],
  ['definirDroitsAssetAction', () => definirDroitsAssetAction({ assetId: A.image, droit: 'photo_marque' })],
  ['definirTagDossierAction', () => definirTagDossierAction({ id: 'x', tag: 'vert' })],
];

/** [qui, session, raison du refus d'écriture] · tous refusés, rien écrit. */
const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
  ['client_viewer (Core)', () => session(ids, 'uv'), 'role'],
  ['member en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
];

describe('bibliotheque-dossiers.ts · aucun export sans garde', () => {
  const nommees = new Set(ACTIONS.map(([n]) => n));
  it('chaque export est une action gardée (ACTIONS)', () => {
    const exports = Object.keys(actionsDossiers).filter((k) => typeof (actionsDossiers as Record<string, unknown>)[k] === 'function');
    expect(exports.length).toBeGreaterThan(0);
    const oublies = exports.filter((k) => !nommees.has(k));
    expect(oublies, `export(s) sans garde éprouvée · ajouter à ACTIONS : ${oublies.join(', ')}`).toEqual([]);
    const fantomes = [...nommees].filter((k) => !exports.includes(k));
    expect(fantomes, 'ACTIONS nomme un export qui n’existe plus').toEqual([]);
  });
  it('chaque export refuse un member Starter AVANT de lire ses arguments', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const avant = await empreinte();
    for (const [k, f] of Object.entries(actionsDossiers)) {
      if (typeof f !== 'function') continue;
      const r = await (f as (x: unknown) => Promise<{ error?: string }>)({}).catch((e: Error) => ({ error: `exception · ${e.message}` }));
      expect(r?.error, `${k} · appelée sans arguments par un member Starter · la garde ne passe pas en premier`).toBe(TEXTE_REFUS_BIBLIOTHEQUE.plan);
    }
    expect(await empreinte()).toBe(avant);
  });
});

describe('Dossiers · refus AVANT toute écriture', () => {
  for (const [qui, faire, raison] of REFUSES) {
    describe(qui, () => {
      for (const [nom, appeler] of ACTIONS) {
        it(`${nom} · refusé, rien d'écrit`, async () => {
          etat.session = faire();
          const avant = await empreinte();
          const r = await appeler() as { error?: string; ok?: boolean };
          expect(r?.error, `${nom} · ${qui} · la garde ne refuse pas`).toBe(TEXTE_REFUS_BIBLIOTHEQUE[raison]);
          expect(r?.ok, `${nom} · ${qui} · succès malgré le refus`).toBeUndefined();
          expect(await empreinte(), `${nom} · ${qui} · une écriture a eu lieu malgré le refus`).toBe(avant);
        });
      }
    });
  }
});

describe('Dossiers · member en Core · chaque geste marche, scope espace tenu', () => {
  const foldersWs = async (ws: string) => db!.select().from(schema.libraryFolders).where(eq(schema.libraryFolders.workspaceId, ws));
  const asset = async (id: string) => (await db!.select().from(schema.assets).where(eq(schema.assets.id, id)))[0]!;
  let racine = '';
  let enfant = '';

  it('creerDossierAction · le dossier apparaît en base', async () => {
    etat.session = session(ids, 'ua');
    const r = await creerDossierAction({ nom: '  Photos produit  ', brandId: ids.brandA1 });
    expect(r.ok).toBe(true);
    racine = r.id!;
    const row = (await foldersWs(ids.wsA)).find((f) => f.id === racine)!;
    expect(row.name).toBe('Photos produit');       // rogné par la règle noyau
    expect(row.brandId).toBe(ids.brandA1);
    expect(row.parentId).toBeNull();
    expect(row.deletedAt).toBeNull();
  });
  it('creerDossierAction · nom vide refusé par la règle noyau', async () => {
    expect((await creerDossierAction({ nom: '   ' })).ok).toBeUndefined();
  });
  it('creerDossierAction · sous un parent · hérite de la marque du parent', async () => {
    const r = await creerDossierAction({ nom: 'Hiver', parentId: racine });
    expect(r.ok).toBe(true);
    enfant = r.id!;
    expect((await foldersWs(ids.wsA)).find((f) => f.id === enfant)!.brandId).toBe(ids.brandA1);
  });
  it('affecterAssetDossierAction · pose folderId, puis l’enlève', async () => {
    expect(await affecterAssetDossierAction({ assetId: A.image, folderId: racine })).toEqual({ ok: true });
    expect((await asset(A.image)).folderId).toBe(racine);
    expect(await affecterAssetDossierAction({ assetId: A.image, folderId: null })).toEqual({ ok: true });
    expect((await asset(A.image)).folderId).toBeNull();
  });
  it('affecterAssetDossierAction · dossier d’un AUTRE espace refusé (introuvable)', async () => {
    const bDossier = await creerDossierAction({ nom: 'B' });
    etat.session = session(ids, 'ub');
    const idB = (await creerDossierAction({ nom: 'Dossier B' })).id!;
    etat.session = session(ids, 'ua');
    expect((await affecterAssetDossierAction({ assetId: A.image, folderId: idB })).ok).toBeUndefined();
    expect(bDossier.ok).toBe(true);
  });
  it('definirDroitsAssetAction · pose un droit valide, refuse un droit inconnu, efface avec null', async () => {
    expect(await definirDroitsAssetAction({ assetId: A.image, droit: 'ugc_accord' })).toEqual({ ok: true });
    expect((await asset(A.image)).rights).toBe('ugc_accord');
    expect((await definirDroitsAssetAction({ assetId: A.image, droit: 'faux' as never })).ok).toBeUndefined();
    expect((await asset(A.image)).rights).toBe('ugc_accord'); // inchangé
    expect(await definirDroitsAssetAction({ assetId: A.image, droit: null })).toEqual({ ok: true });
    expect((await asset(A.image)).rights).toBeNull();
  });
  it('supprimerDossierAction · corbeille (deleted_at posé), puis restauration', async () => {
    expect(await supprimerDossierAction({ id: racine })).toEqual({ ok: true });
    expect((await foldersWs(ids.wsA)).find((f) => f.id === racine)!.deletedAt).not.toBeNull();
    expect(await restaurerDossierAction({ id: racine })).toEqual({ ok: true });
    expect((await foldersWs(ids.wsA)).find((f) => f.id === racine)!.deletedAt).toBeNull();
  });
  it('dossier SYSTÈME (verrouillé) · suppression refusée · l’arbre ne bouge pas', async () => {
    etat.session = session(ids, 'ua');
    const [sys] = await db!.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, name: 'Système', locked: true }).returning();
    expect((await supprimerDossierAction({ id: sys!.id })).ok).toBeUndefined();
    const row = (await foldersWs(ids.wsA)).find((f) => f.id === sys!.id)!;
    expect(row.name).toBe('Système');
    expect(row.parentId).toBeNull();
    expect(row.deletedAt).toBeNull();
  });
  it('un dossier d’un AUTRE espace reste hors d’atteinte (suppression)', async () => {
    etat.session = session(ids, 'ub');
    const [fb] = await db!.insert(schema.libraryFolders).values({ workspaceId: ids.wsB, name: 'Privé B' }).returning();
    etat.session = session(ids, 'ua');
    expect((await supprimerDossierAction({ id: fb!.id })).ok).toBeUndefined();
    const row = (await db!.select().from(schema.libraryFolders).where(and(eq(schema.libraryFolders.id, fb!.id))))[0]!;
    expect(row.name).toBe('Privé B');
    expect(row.deletedAt).toBeNull();
  });
});
