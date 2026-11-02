import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · RENOMMER UN FICHIER et DÉPLACER PLUSIEURS DOSSIERS · sur une
 * VRAIE base (pglite, migrations du dépôt), avec les VRAIES actions
 * (`renommerAssetAction`, `deplacerDossiersAction`, `uploadImageAssetsAction`)
 * et la VRAIE page Spatial `/assets`. On relit les lignes après le geste,
 * l'empreinte des tables quand il est refusé, et le HTML de la page · jamais
 * la présence d'un appel.
 *
 * Renommer · le nom relu (rogné, extension conservée), seul `name` change ; un
 * nom vide, trop long ou à caractère invisible refusé ; un fichier d'un autre
 * espace, en corbeille, une sortie Studios ou un inconnu refusés ; un nom
 * importé (coupé à 160) se réenregistre tel quel. Déplacer en groupe · les
 * parents relus, puis la page ; un cycle croisé, une sélection imbriquée, un
 * dossier étranger ou système, au-delà de la borne · refusés, RIEN d'écrit
 * (pas même pour les dossiers valides de la sélection). Même garde d'écriture
 * (lecteur client, Starter) pour les deux.
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
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));

import { db, schema, sql } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { REFUS_DOSSIER, REFUS_FICHIER, LONGUEUR_MAX_NOM_FICHIER, TAG_SELECTION_MAX, refusDeplacementTropLarge } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { renommerAssetAction, uploadImageAssetsAction, mettreAssetsCorbeilleAction } from '../app/actions/assets';
import { creerDossierAction, deplacerDossiersAction, supprimerDossierAction } from '../app/actions/bibliotheque-dossiers';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const INCONNU = '00000000-0000-4000-8000-000000000000';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/** Fichiers · « IMG_0042.jpg » (A), « Jeté.png » (A, corbeille), « secret B.jpg » (B), une sortie Studios (A). */
const A = { img: '', jete: '', b: '', studio: '' };
/** Dossiers de A · Shooting › Hiver › Rushs ; Archives ; Système (verrouillé) ; Jeté (corbeille) · B · Secret de B. */
const D = { shooting: '', hiver: '', rushs: '', archives: '', systeme: '', jete: '', autre: '' };

const asset = async (id: string) => (await db!.select().from(schema.assets).where(eq(schema.assets.id, id)))[0]!;
const dossier = async (id: string) => (await db!.select().from(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)))[0]!;
/** Empreinte de ce qu'un refus pourrait écrire · lignes ET contenu. */
async function empreinte(): Promise<string> {
  const out: string[] = [];
  for (const t of ['assets', 'library_folders', 'studio_assets']) {
    const r = await db!.execute(sql.raw(`select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), ',' order by md5(x::text)), '')) as h from public."${t}" x`));
    const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
    out.push(`${t}|${l!.n}|${l!.h}`);
  }
  return out.join('\n');
}

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async () => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement}</FournisseurSpatial>,
);
/** Les cartes de dossier rendues à la racine · nom et sous-titre. */
const cartes = (html: string) => Object.fromEntries([...html.matchAll(/<button type="button" class="fopen">[\s\S]*?<strong>([^<]*)<\/strong><small>([^<]*)<\/small>/g)].map((m) => [m[1], m[2]]));
/** Les noms des cartes de fichier rendues (leur bouton d'aperçu). */
const fichiers = (html: string) => [...html.matchAll(/aria-label="Aperçu de ([^"]*)"/g)].map((m) => m[1]);

beforeAll(async () => {
  await semer(db, schema, ids);
  const ins = async (ws: string, brandId: string, name: string, o: Record<string, unknown> = {}) =>
    (await db!.insert(schema.assets).values({ workspaceId: ws, brandId, name, kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png', ...o }).returning())[0]!.id;
  A.img = await ins(ids.wsA, ids.brandA1, 'IMG_0042.jpg', { mimeType: 'image/jpeg', rights: 'photo_marque' });
  A.jete = await ins(ids.wsA, ids.brandA1, 'Jeté.png');
  A.b = await ins(ids.wsB, ids.brandB1, 'secret B.jpg');
  const [st] = await db!.insert(schema.studioAssets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: 'k/sortie.png', mime: 'image/png', bytes: 10, sha256: 'a'.repeat(64), origin: 'generated' }).returning();
  A.studio = st!.id;
  etat.session = session(ids, 'ua');
  expect((await mettreAssetsCorbeilleAction({ ids: [A.jete] })).ok).toBe(true);
  const c = async (nom: string, parentId: string | null = null) => { const r = await creerDossierAction({ nom, parentId }); if (!r.ok) throw new Error(r.error); return r.id!; };
  D.shooting = await c('Shooting');
  D.hiver = await c('Hiver', D.shooting);
  D.rushs = await c('Rushs', D.hiver);
  D.archives = await c('Archives');
  D.systeme = await c('Photos système');
  await db!.update(schema.libraryFolders).set({ locked: true }).where(eq(schema.libraryFolders.id, D.systeme));
  D.jete = await c('Jeté');
  expect((await supprimerDossierAction({ id: D.jete })).ok).toBe(true);
  etat.session = session(ids, 'ub');
  D.autre = await c('Secret de B');
});

describe('renommer un fichier · le nom relu en base', () => {
  it('un nom rogné sans extension · la ligne porte le nouveau nom AVEC l’extension, rien d’autre ne change', async () => {
    etat.session = session(ids, 'ua');
    const avant = await asset(A.img);
    expect(await renommerAssetAction({ id: A.img, nom: '  Flacon face  ' })).toEqual({ ok: true, nom: 'Flacon face.jpg' });
    const apres = await asset(A.img);
    expect(apres.name).toBe('Flacon face.jpg');
    expect({ ...apres, name: avant.name }).toEqual(avant);
  });

  it('la page montre le nouveau nom · plus l’ancien', async () => {
    etat.session = session(ids, 'ua');
    const html = await page();
    expect(fichiers(html)).toContain('Flacon face.jpg');
    expect(fichiers(html)).not.toContain('IMG_0042.jpg');
  });

  it('UUID en capitales accepté · la même extension saisie est gardée telle quelle', async () => {
    etat.session = session(ids, 'ua');
    expect(await renommerAssetAction({ id: A.img.toUpperCase(), nom: 'Flacon.JPG' })).toEqual({ ok: true, nom: 'Flacon.JPG' });
    expect((await asset(A.img)).name).toBe('Flacon.JPG');
  });

  it('un nom vide, extension seule, trop long, invisible ou illisible · refusé avec la phrase de la fenêtre, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    const CAS: Array<[unknown, string]> = [
      ['   ', REFUS_FICHIER.vide],
      ['.jpg', REFUS_FICHIER.vide],
      ['n'.repeat(LONGUEUR_MAX_NOM_FICHIER - 3), `Nom trop long (max ${LONGUEUR_MAX_NOM_FICHIER} caractères, extension .JPG comprise).`],
      ['Ligne\nsuivante', REFUS_FICHIER.interdit],
      ['photo\u202egpj.exe', REFUS_FICHIER.interdit],
      [42, REFUS_FICHIER.invalide],
    ];
    for (const [nom, raison] of CAS) expect([nom, await renommerAssetAction({ id: A.img, nom: nom as string })]).toEqual([nom, { error: raison }]);
    expect(await empreinte()).toBe(avant);
  });

  it('un fichier d’un autre espace, en corbeille, une sortie Studios, un inconnu ou illisible · refusé comme un inconnu, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    for (const id of [A.b, A.jete, A.studio, INCONNU, 'r:assets', '']) {
      expect([id, await renommerAssetAction({ id, nom: 'Pirate' })]).toEqual([id, { error: REFUS_FICHIER.introuvable }]);
    }
    expect(await empreinte()).toBe(avant);
    expect([(await asset(A.b)).name, (await asset(A.jete)).name]).toEqual(['secret B.jpg', 'Jeté.png']);
  });

  it(`un nom importé (coupé à ${LONGUEUR_MAX_NOM_FICHIER} par l’import) se réenregistre tel quel · un caractère de plus est refusé`, async () => {
    etat.session = session(ids, 'ua');
    expect(await uploadImageAssetsAction({ items: [{ name: 'L'.repeat(200), dataUri: PNG }] })).toEqual({ ok: true, count: 1 });
    const [importe] = await db!.select().from(schema.assets).where(eq(schema.assets.name, 'L'.repeat(LONGUEUR_MAX_NOM_FICHIER)));
    expect(importe, 'l’import ne coupe plus le nom à la borne du renommage').toBeTruthy();
    expect(await renommerAssetAction({ id: importe!.id, nom: importe!.name })).toEqual({ ok: true, nom: importe!.name });
    expect(await renommerAssetAction({ id: importe!.id, nom: `${importe!.name}L` })).toEqual({ error: `Nom trop long (max ${LONGUEUR_MAX_NOM_FICHIER} caractères).` });
  });
});

describe('déplacer plusieurs dossiers · les parents relus en base', () => {
  it('« Rushs » et « Archives » sous « Shooting » · UNE action, les deux lignes changent de parent, la page le montre', async () => {
    etat.session = session(ids, 'ua');
    expect(await deplacerDossiersAction({ ids: [D.rushs, D.archives], parentId: D.shooting })).toEqual({ ok: true, n: 2 });
    expect([(await dossier(D.rushs)).parentId, (await dossier(D.archives)).parentId, (await dossier(D.hiver)).parentId]).toEqual([D.shooting, D.shooting, D.shooting]);
    const html = await page();
    expect(cartes(html)['Shooting']).toBe('0 élément · 3 sous-dossiers');
    expect(Object.keys(cartes(html))).not.toContain('Archives');
  });

  it('retour · « Archives » à la racine et « Rushs » sous « Hiver » (UUID en capitales accepté)', async () => {
    etat.session = session(ids, 'ua');
    expect(await deplacerDossiersAction({ ids: [D.archives.toUpperCase()], parentId: null })).toEqual({ ok: true, n: 1 });
    expect(await deplacerDossiersAction({ ids: [D.rushs], parentId: D.hiver.toUpperCase() })).toEqual({ ok: true, n: 1 });
    expect([(await dossier(D.archives)).parentId, (await dossier(D.rushs)).parentId]).toEqual([null, D.hiver]);
  });

  const REFUS: Array<[string, () => { ids: string[]; parentId: string | null }, string]> = [
    ['la destination fait partie de la sélection (cycle croisé)', () => ({ ids: [D.archives, D.shooting], parentId: D.archives }), REFUS_DOSSIER.destinationSelectionnee],
    ['vers le descendant d’un des dossiers', () => ({ ids: [D.archives, D.shooting], parentId: D.rushs }), `« Shooting » · ${REFUS_DOSSIER.descendant}`],
    ['un dossier et son sous-dossier', () => ({ ids: [D.shooting, D.hiver], parentId: D.archives }), REFUS_DOSSIER.imbriques],
    ['un dossier d’un AUTRE espace dans la sélection', () => ({ ids: [D.archives, D.autre], parentId: D.shooting }), REFUS_DOSSIER.selectionIntrouvable],
    ['un dossier EN CORBEILLE dans la sélection', () => ({ ids: [D.archives, D.jete], parentId: D.shooting }), REFUS_DOSSIER.selectionIntrouvable],
    ['un dossier système dans la sélection', () => ({ ids: [D.archives, D.systeme], parentId: D.shooting }), `« Photos système » · ${REFUS_DOSSIER.systemeDeplacer}`],
    ['vers un dossier d’un AUTRE espace', () => ({ ids: [D.archives], parentId: D.autre }), REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier virtuel', () => ({ ids: [D.archives], parentId: 'r:assets' }), REFUS_DOSSIER.destinationIntrouvable],
    ['un identifiant illisible', () => ({ ids: [D.archives, 'p:projet'], parentId: null }), REFUS_DOSSIER.selectionIllisible],
    [`au-delà de ${TAG_SELECTION_MAX} dossiers`, () => ({ ids: [...Array.from({ length: TAG_SELECTION_MAX }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`), D.archives], parentId: null }), refusDeplacementTropLarge(TAG_SELECTION_MAX + 1)],
  ];
  for (const [quoi, entree, raison] of REFUS) {
    it(`${quoi} · refusé avec sa phrase, RIEN d’écrit`, async () => {
      etat.session = session(ids, 'ua');
      const avant = await empreinte();
      expect(await deplacerDossiersAction(entree())).toEqual({ error: raison });
      expect(await empreinte(), `${quoi} · une écriture a eu lieu malgré le refus`).toBe(avant);
      expect((await dossier(D.archives)).parentId, `${quoi} · le dossier valide de la sélection a bougé`).toBeNull();
    });
  }
});

describe('garde d’écriture · rôle ou offre sans écriture, rien d’écrit', () => {
  const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
    ['lecteur client (client_viewer)', () => session(ids, 'uv'), 'role'],
    ['membre en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
  ];
  for (const [qui, faire, raison] of REFUSES) {
    it(`${qui} · renommer un fichier et déplacer des dossiers refusés`, async () => {
      etat.session = faire();
      const avant = await empreinte();
      expect(await renommerAssetAction({ id: A.img, nom: 'Pirate' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await deplacerDossiersAction({ ids: [D.archives], parentId: D.shooting })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await empreinte()).toBe(avant);
      expect([(await asset(A.img)).name, (await dossier(D.archives)).parentId]).toEqual(['Flacon.JPG', null]);
    });
  }
});
