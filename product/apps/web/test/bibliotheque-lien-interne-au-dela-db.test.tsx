import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · le LIEN INTERNE d'un fichier AU-DELÀ des 400 médias que
 * l'écran charge · sur une VRAIE base (pglite, migrations du dépôt) et la VRAIE
 * page Spatial `/assets`, la VRAIE marque active (cookie posé sur A1). On lit
 * le HTML rendu et les requêtes réellement envoyées à la base · jamais la
 * présence d'un appel.
 *
 * 401 fichiers vivants dans la portée · le plus ancien n'est pas dans la liste
 * (400), son lien l'ouvre quand même (aperçu, dans son dossier) par UNE lecture
 * ciblée de ce seul fichier. Un fichier ancien d'un autre espace, d'une marque
 * hors portée, à la corbeille (au-delà des 400 de la corbeille), dans un
 * dossier jeté ou sous un ancêtre jeté · la page est rendue EXACTEMENT comme
 * sans paramètre. Un fichier déjà chargé · aucune lecture de plus.
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
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k === 'tt_brand' ? { value: etat.ids.brandA1 } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { LIMITE_BIBLIOTHEQUE } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { listAssets } from '../app/actions/assets';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const F = { ancien: '', autreEspace: '', horsMarque: '', jete: '', parentJete: '', ancetreJete: '', recent: '' };
const D = { lot: '', archives: '', jete: '', vieux: '', sous: '' };

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };

/** Les requêtes SQL réellement envoyées à la base pendant un rendu de la page. */
let requetes: string[] = [];
// drizzle 0.33 · le client pglite est porté par la session du client drizzle.
const client = (db as unknown as { session: { client: { query: (...a: unknown[]) => Promise<unknown> } } }).session.client;
const query = client.query.bind(client);
client.query = (...a: unknown[]) => { requetes.push(String(a[0])); return query(...a); };
/** Les lectures de la table `assets` · la liste, la corbeille, le rangement, et la lecture ciblée éventuelle. */
const lecturesAssets = () => requetes.filter((q) => /from "assets"/i.test(q));
const cibles = () => lecturesAssets().filter((q) => /"assets"\."id" = \$\d+/.test(q));

const page = async (sp: Record<string, string> = {}) => {
  requetes = [];
  return renderToStaticMarkup(<FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve(sp) })) as ReactElement}</FournisseurSpatial>);
};
const apercu = (html: string) => html.match(/<aside class="tile dprev" aria-label="Aperçu"><div class="sech"[^>]*><strong[^>]*>([^<]*)<\/strong>/)?.[1] ?? null;
const fil = (html: string) => [...(html.match(/<nav class="crumb" aria-label="Emplacement">([\s\S]*?)<\/nav>/)?.[1] ?? '').matchAll(/>([^<>]+)</g)].map((m) => m[1]!.trim()).filter((x) => x && x !== '/' && x !== '›');

const T = (minutesAvant: number) => new Date(Date.parse('2026-10-30T12:00:00.000Z') - minutesAvant * 60_000);
const ligne = (workspaceId: string, name: string, createdAt: Date, extra: Partial<typeof schema.assets.$inferInsert> = {}): typeof schema.assets.$inferInsert => ({
  workspaceId, brandId: workspaceId === ids.wsA ? ids.brandA1 : ids.brandB1, name, kind: 'image', source: 'upload',
  url: `https://stockage.invalid/assets/${workspaceId}/${name.replace(/\W/g, '')}.png`, mimeType: 'image/png', createdAt, ...extra,
});
const inserer = async (l: typeof schema.assets.$inferInsert) => (await db!.insert(schema.assets).values(l).returning({ id: schema.assets.id }))[0]!.id;
const dossier = async (workspaceId: string, name: string, extra: Partial<typeof schema.libraryFolders.$inferInsert> = {}) =>
  (await db!.insert(schema.libraryFolders).values({ workspaceId, name, ...extra }).returning({ id: schema.libraryFolders.id }))[0]!.id;

beforeAll(async () => {
  await semer(db, schema, ids);
  D.lot = await dossier(ids.wsA, 'Lot récent');
  D.archives = await dossier(ids.wsA, 'Archives 2023');
  D.jete = await dossier(ids.wsA, 'Ancien shooting', { deletedAt: new Date() });
  D.vieux = await dossier(ids.wsA, 'Vieux classeur', { deletedAt: new Date() });
  D.sous = await dossier(ids.wsA, 'Sous-classeur vivant', { parentId: D.vieux });
  // 400 fichiers vivants récents (rangés à part · la racine reste légère), et 400 fichiers récents à la corbeille.
  await db!.insert(schema.assets).values(Array.from({ length: LIMITE_BIBLIOTHEQUE }, (_, i) => ligne(ids.wsA, `recent-${String(i).padStart(3, '0')}.png`, T(i), { folderId: D.lot })));
  await db!.insert(schema.assets).values(Array.from({ length: LIMITE_BIBLIOTHEQUE }, (_, i) => ligne(ids.wsA, `jete-recent-${String(i).padStart(3, '0')}.png`, T(i), { deletedAt: new Date() })));
  F.recent = (await db!.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.name, 'recent-000.png')))[0]!.id;
  // Tous plus anciens que les 400 · aucun n'est dans la liste.
  F.ancien = await inserer(ligne(ids.wsA, 'carton ancien 2023.png', T(10_000), { folderId: D.archives }));
  F.parentJete = await inserer(ligne(ids.wsA, 'parent jete.png', T(10_001), { folderId: D.jete }));
  F.ancetreJete = await inserer(ligne(ids.wsA, 'ancetre jete.png', T(10_002), { folderId: D.sous }));
  F.horsMarque = await inserer(ligne(ids.wsA, 'pot marque A2.png', T(10_003), { brandId: ids.brandA2 }));
  F.jete = await inserer(ligne(ids.wsA, 'tube jete ancien.png', T(10_004), { deletedAt: new Date() }));
  F.autreEspace = await inserer(ligne(ids.wsB, 'secret de B.png', T(10_005)));
});

beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('le 401e fichier, le plus ancien · son lien l’ouvre, par une lecture ciblée de ce seul fichier', () => {
  it('précondition · la liste rend 400 fichiers et le plus ancien n’y est pas', async () => {
    const l = await listAssets();
    expect(l.length).toBe(LIMITE_BIBLIOTHEQUE);
    expect(l.some((a) => a.id === F.ancien)).toBe(false);
  });

  it('`?fichier=` du 401e · son aperçu ouvert, dans son dossier', async () => {
    const sans = await page();
    expect(apercu(sans)).toBeNull();
    expect(sans).not.toContain('carton ancien 2023.png');
    const html = await page({ fichier: F.ancien });
    expect(apercu(html)).toBe('carton ancien 2023.png');
    expect(fil(html).at(-1)).toBe('Archives 2023');
  });

  it('une seule lecture ciblée de plus (pas de N+1) · le rangement relu dans la même requête que les autres', async () => {
    await page();
    const base = lecturesAssets().length;
    expect(cibles(), 'sans paramètre · aucune lecture ciblée').toEqual([]);
    await page({ fichier: F.ancien });
    expect(cibles().length, 'une seule lecture ciblée').toBe(1);
    expect(cibles()[0]).toMatch(/limit \$\d+/i);
    expect(lecturesAssets().length, 'exactement une lecture de plus sur `assets`').toBe(base + 1);
  });

  it('un fichier DÉJÀ chargé · aucune lecture de plus', async () => {
    await page();
    const base = lecturesAssets().length;
    const html = await page({ fichier: F.recent });
    expect(apercu(html)).toBe('recent-000.png');
    expect([cibles().length, lecturesAssets().length]).toEqual([0, base]);
  });

  it('lecture ciblée directe · même portée que la liste, un identifiant forgé ne lit rien', async () => {
    expect((await listAssets({ id: F.ancien })).map((a) => a.id)).toEqual([F.ancien]);
    expect((await listAssets({ id: F.ancien.toUpperCase() })).map((a) => a.id)).toEqual([F.ancien]);
    for (const id of [F.autreEspace, F.horsMarque, F.jete]) expect(await listAssets({ id }), id).toEqual([]);
    requetes = [];
    expect(await listAssets({ id: `${F.ancien}' or 1=1` })).toEqual([]);
    expect(lecturesAssets(), 'un identifiant forgé n’atteint pas la base').toEqual([]);
  });
});

describe('hors portée · la page est rendue EXACTEMENT comme sans paramètre (aucune fuite d’existence)', () => {
  const CAS: Array<[string, () => string, string]> = [
    ['un fichier ancien d’un autre espace', () => F.autreEspace, 'secret de B.png'],
    ['un fichier ancien d’une marque hors portée (A2, marque active A1)', () => F.horsMarque, 'pot marque A2.png'],
    ['un fichier ancien à la corbeille (au-delà des 400 de la corbeille)', () => F.jete, 'tube jete ancien.png'],
    ['un fichier ancien dont le dossier parent est à la corbeille', () => F.parentJete, 'parent jete.png'],
    ['un fichier ancien sous un ancêtre à la corbeille', () => F.ancetreJete, 'ancetre jete.png'],
  ];
  for (const [quoi, id, nom] of CAS) {
    it(quoi, async () => {
      const sans = await page();
      const avec = await page({ fichier: id() });
      expect(cibles().length, 'la lecture ciblée a bien eu lieu (une seule)').toBe(1);
      expect(apercu(avec)).toBeNull();
      expect(avec === sans, 'le rendu diffère de celui sans paramètre').toBe(true);
      expect(avec).not.toContain(nom);
    });
  }

  it('un membre de B · le lien du 401e fichier de A ne s’ouvre pas, même rendu que sans paramètre', async () => {
    etat.session = session(ids, 'ub');
    const sans = await page();
    const avec = await page({ fichier: F.ancien });
    expect([apercu(avec), avec === sans, avec.includes('carton ancien 2023.png')]).toEqual([null, true, false]);
  });

  it('un lecteur client · renvoyé à l’accueil avant toute lecture ciblée', async () => {
    etat.session = session(ids, 'uv');
    await expect(page({ fichier: F.ancien })).rejects.toThrow('REDIRECT /dashboard');
    expect(cibles()).toEqual([]);
  });
});
