import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · AU-DELÀ de la fenêtre que la page charge · sur une VRAIE base
 * (pglite, migrations du dépôt), la VRAIE page Spatial `/assets` et la VRAIE
 * action `pageBibliothequeAction`, marque active A1. On lit les données que
 * la page rend, le HTML et ce que l'action renvoie · jamais la présence d'un
 * appel.
 *
 * 1 200+ fichiers vivants dans la portée (700 dans un dossier, dont 300 créés
 * dans la MÊME milliseconde), 450 à la corbeille · chaque fichier d'un dossier
 * est atteint, une fois, en suivant le curseur ; les comptes sont exacts ; une
 * recherche trouve un fichier ancien (nom ou tag, sans accent) et rien hors de
 * l'espace, de la marque, de la corbeille ou d'un dossier jeté ; un fichier
 * ajouté entre deux pages ne fait ni doublon ni trou ; la garde de lecture
 * refuse un lecteur client.
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

import { sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  FENETRE_BIBLIOTHEQUE, FILTRES_TYPE_DRIVE, PAGE_BIBLIOTHEQUE, passeFiltreType, typeFichier, vueDrive, ETAT_DRIVE_INITIAL,
  type CurseurBibliotheque, type DonneesDrive, type FenetresBibliotheque, type FiltreTypeDrive, type PageBibliotheque, type PorteePageBibliotheque,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { pageBibliothequeAction } from '../app/actions/assets';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import { lireMediaCible } from '../lib/bibliotheque-pages';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const D = { gros: '', petit: '', jete: '', hors: '' };
const N = { gros: 700, racine: 500, hors: 3, corbeille: 450 };
/** Les fichiers de PETIT, avec leur type (le filtre en SQL doit les compter comme le noyau). */
const PETIT: Array<{ name: string; kind: 'image' | 'video' | 'audio' | 'other'; mimeType: string | null }> = [
  ...Array.from({ length: 3 }, (_, i) => ({ name: `logo-${i}.svg`, kind: 'image' as const, mimeType: 'image/svg+xml' })),
  // Un SVG importé comme « autre » fichier · le noyau le range dans les images.
  { name: 'logo-importe.svg', kind: 'other', mimeType: 'image/svg+xml' },
  ...Array.from({ length: 2 }, (_, i) => ({ name: `fiche-${i}.pdf`, kind: 'other' as const, mimeType: 'application/pdf' })),
  ...Array.from({ length: 4 }, (_, i) => ({ name: `rush-${i}.mp4`, kind: 'video' as const, mimeType: 'video/mp4' })),
  { name: 'voix.mp3', kind: 'audio', mimeType: 'audio/mpeg' },
  ...Array.from({ length: 2 }, (_, i) => ({ name: `brut-${i}.bin`, kind: 'other' as const, mimeType: null })),
  // Un PDF déclaré « image » reste un PDF · un fichier vidéo sans format reste une vidéo.
  { name: 'scan.pdf', kind: 'image', mimeType: 'application/pdf' },
  { name: 'sans-format', kind: 'video', mimeType: null },
];
const F = { ancien: '', creme: '', pourcent: '' };

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };

/** Les requêtes SQL réellement envoyées. */
let requetes: string[] = [];
const client = (db as unknown as { session: { client: { query: (...a: unknown[]) => Promise<unknown> } } }).session.client;
const query = client.query.bind(client);
client.query = (...a: unknown[]) => { requetes.push(String(a[0])); return query(...a); };

const T = (minutesAvant: number) => new Date(Date.parse('2026-10-30T12:00:00.000Z') - minutesAvant * 60_000);
const ligne = (name: string, createdAt: Date, extra: Partial<typeof schema.assets.$inferInsert> = {}): typeof schema.assets.$inferInsert => ({
  workspaceId: ids.wsA, brandId: ids.brandA1, name, kind: 'image', source: 'upload', mimeType: 'image/png', sizeBytes: 1000,
  url: `https://stockage.invalid/assets/${name.replace(/\W/g, '')}.png`, createdAt, ...extra,
});
const inserer = async (lignes: Array<typeof schema.assets.$inferInsert>) => {
  const out: string[] = [];
  for (let i = 0; i < lignes.length; i += 300) out.push(...(await db!.insert(schema.assets).values(lignes.slice(i, i + 300)).returning({ id: schema.assets.id })).map((r) => r.id));
  return out;
};
const dossier = async (name: string, extra: Partial<typeof schema.libraryFolders.$inferInsert> = {}) =>
  (await db!.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name, ...extra }).returning({ id: schema.libraryFolders.id }))[0]!.id;

/** La vraie page · l'élément `Bibliotheque` qu'elle rend (ses données et sa pagination). */
const pageRendue = async () => {
  const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement<{ donnees: DonneesDrive; pagination: FenetresBibliotheque }>;
  return { donnees: el.props.donnees, pagination: el.props.pagination, html: renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>) };
};
const lire = async (portee: PorteePageBibliotheque, curseur: CurseurBibliotheque | null, filtre: FiltreTypeDrive = 'tous') => {
  const r = await pageBibliothequeAction({ portee, filtre, curseur });
  if ('error' in r) throw new Error(r.error);
  return r;
};
/** Toutes les pages d'une liste depuis `depart` · les identifiants dans l'ordre reçu. */
const tout = async (portee: PorteePageBibliotheque, depart: CurseurBibliotheque | null, filtre: FiltreTypeDrive = 'tous') => {
  const vus: string[] = [];
  let c = depart;
  for (let i = 0; i < 50; i++) {
    const p: PageBibliotheque = await lire(portee, c, filtre);
    vus.push(...p.medias.map((m) => m.id));
    expect(p.medias.length).toBeLessThanOrEqual(PAGE_BIBLIOTHEQUE);
    if (!p.suivant) return vus;
    c = p.suivant;
  }
  throw new Error('liste sans fin');
};
const idsDe = async (cond: ReturnType<typeof sql>) => ((await db!.execute(sql`select id from assets where ${cond}`)) as unknown as { rows: Array<{ id: string }> }).rows.map((r) => r.id);

beforeAll(async () => {
  await semer(db, schema, ids);
  D.gros = await dossier('Gros dossier');
  D.petit = await dossier('Petit dossier', { brandId: null });
  D.jete = await dossier('Dossier jeté', { deletedAt: new Date() });
  D.hors = await dossier('Dossier A2', { brandId: ids.brandA2 });
  // Racine et gros dossier entrelacés dans le temps · la fenêtre des 400 en prend aux deux.
  await inserer(Array.from({ length: N.racine }, (_, i) => ligne(`racine-${String(i).padStart(4, '0')}.png`, T(2 * i))));
  const gros = await inserer(Array.from({ length: N.gros }, (_, i) => ligne(`gros-${String(i).padStart(4, '0')}.png`, T(2 * i + 1), { folderId: D.gros })));
  // 300 fichiers du gros dossier créés dans la MÊME milliseconde · un curseur à la milliseconde y sauterait des fichiers.
  await db!.execute(sql`update assets set created_at = '2026-10-29T00:00:00.000Z'::timestamptz + make_interval(secs => (row_number_offset.n)::float8 / 1000000)
    from (select id, row_number() over (order by name) as n from assets where id in (${sql.join(gros.slice(400).map((x) => sql`${x}::uuid`), sql`, `)})) as row_number_offset
    where assets.id = row_number_offset.id`);
  // Rangés dans un dossier d'une autre marque (hors portée) · l'écran les montre à la racine.
  await inserer(Array.from({ length: N.hors }, (_, i) => ligne(`hors-${i}.png`, T(5000 + i), { folderId: D.hors })));
  await inserer(PETIT.map((x, i) => ligne(x.name, T(6000 + i), { folderId: D.petit, kind: x.kind, mimeType: x.mimeType })));
  await inserer(Array.from({ length: N.corbeille }, (_, i) => ligne(`jete-${String(i).padStart(4, '0')}.png`, T(i), { deletedAt: new Date() })));
  // Les fichiers anciens que la recherche doit trouver · et ceux qu'elle ne doit jamais rendre.
  F.ancien = (await inserer([ligne('Étiquette d’hiver 2019.png', T(900_000), { folderId: D.petit, tags: ['Packaging carton'] })]))[0]!;
  F.creme = (await inserer([ligne('cre\u0301me solaire.png', T(900_001))]))[0]!;
  F.pourcent = (await inserer([ligne('100%_promo.png', T(900_002))]))[0]!;
  await inserer([
    ligne('1000 promo.png', T(900_003)),
    ligne('modele.png', T(900_004), { tags: ['__template__'] }),
    ligne('etiquette jetee.png', T(900_005), { folderId: D.jete }),
    ligne('etiquette corbeille.png', T(900_006), { deletedAt: new Date() }),
    ligne('etiquette A2.png', T(900_007), { brandId: ids.brandA2 }),
    ligne('etiquette secrete B.png', T(900_008), { workspaceId: ids.wsB, brandId: ids.brandB1 }),
  ]);
}, 120_000);

beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('la page · une fenêtre bornée, des comptes EXACTS', () => {
  it('précondition · plus de 1 000 fichiers vivants dans la portée, la page n’en charge que 400 (et 400 de la corbeille)', async () => {
    const vivants = await idsDe(sql`workspace_id = ${ids.wsA} and deleted_at is null and (brand_id = ${ids.brandA1} or brand_id is null)`);
    expect(vivants.length).toBeGreaterThan(1000);
    const { donnees, pagination } = await pageRendue();
    expect(donnees.fichiers.filter((f) => !f.supprime).length).toBe(FENETRE_BIBLIOTHEQUE);
    expect(donnees.fichiers.filter((f) => f.supprime).length).toBe(FENETRE_BIBLIOTHEQUE);
    expect(pagination.vivants?.t).toMatch(/\.\d{6}Z$/);
  });

  it('chaque nombre est exact · onglet, arbre, carte, corbeille, au-delà des 400 chargés', async () => {
    const { donnees, html } = await pageRendue();
    const v = vueDrive(donnees, ETAT_DRIVE_INITIAL);
    const racine = N.racine + N.hors + 4; // + crème, 100 %, 1000, modèle (à la racine)
    expect(v.arbre.find((n) => n.nom === 'Gros dossier')!.compte).toBe(N.gros);
    expect(v.arbre.find((n) => n.nom === 'Petit dossier')!.compte).toBe(PETIT.length + 1);
    expect(v.onglets.find((o) => o.id === 'r:assets')!.compte).toBe(racine + N.gros + PETIT.length + 1);
    expect(html).toContain(`<b>${racine + N.gros + PETIT.length + 1}</b>`);
    // La corbeille · ses 451 fichiers (dont « etiquette corbeille ») et le dossier jeté.
    expect(html).toMatch(new RegExp(`Corbeille</span><span class="faint">${N.corbeille + 1 + 1}</span>`));
  });

  it('la liste ouverte (racine) le dit · affichés sur total, et « Charger plus »', async () => {
    const { html, donnees } = await pageRendue();
    const affiches = donnees.fichiers.filter((f) => !f.supprime && f.parent === 'r:assets').length;
    expect(affiches).toBeLessThan(N.racine);
    expect(html).toContain(`${affiches} fichiers affichés sur ${N.racine + N.hors + 4} · les plus récents sont chargés d’abord`);
    expect(html).toMatch(/data-geste="charger-plus"[^>]*>.*Charger plus<\/button>/);
  });
});

describe('le curseur · chaque fichier d’un dossier atteint UNE fois', () => {
  it('le gros dossier · fenêtre + pages = ses 700 fichiers, sans doublon (300 créés dans la même milliseconde)', async () => {
    const { donnees, pagination } = await pageRendue();
    const fenetre = donnees.fichiers.filter((f) => !f.supprime && f.parent === D.gros).map((f) => f.id);
    const pages = await tout({ type: 'dossier', dossier: D.gros }, pagination.vivants);
    expect(new Set(pages).size, 'doublon entre deux pages').toBe(pages.length);
    expect(pages.filter((x) => fenetre.includes(x)), 'doublon avec la fenêtre').toEqual([]);
    expect(new Set([...fenetre, ...pages])).toEqual(new Set(await idsDe(sql`folder_id = ${D.gros}`)));
  });

  it('la racine porte aussi les fichiers d’un dossier hors portée · la corbeille se lit jusqu’au bout', async () => {
    const { donnees, pagination } = await pageRendue();
    const fen = (p: (f: DonneesDrive['fichiers'][number]) => boolean) => donnees.fichiers.filter(p).map((f) => f.id);
    const racine = new Set([...fen((f) => !f.supprime && f.parent === 'r:assets'), ...(await tout({ type: 'dossier', dossier: 'r:assets' }, pagination.vivants))]);
    expect(racine.size).toBe(N.racine + N.hors + 4);
    for (const id of await idsDe(sql`folder_id = ${D.hors}`)) expect(racine.has(id)).toBe(true);
    const jetes = [...fen((f) => !!f.supprime), ...(await tout({ type: 'corbeille' }, pagination.corbeille))];
    expect(new Set(jetes).size).toBe(jetes.length);
    expect(new Set(jetes)).toEqual(new Set(await idsDe(sql`workspace_id = ${ids.wsA} and deleted_at is not null and (brand_id = ${ids.brandA1} or brand_id is null)`)));
  });

  it('un fichier ajouté ENTRE deux pages · ni doublon ni trou (un plus récent attend la page relue, un plus ancien vient à son tour)', async () => {
    const { pagination } = await pageRendue();
    const portee = { type: 'dossier' as const, dossier: D.petit };
    const avant = await tout(portee, null);
    const p1 = await lire({ type: 'dossier', dossier: D.gros }, pagination.vivants);
    const [recent, ancien] = await inserer([ligne('ajout-recent.png', new Date(), { folderId: D.gros }), ligne('ajout-ancien.png', T(950_000), { folderId: D.gros })]);
    const suite = await tout({ type: 'dossier', dossier: D.gros }, p1.suivant);
    const lus = [...p1.medias.map((m) => m.id), ...suite];
    expect(new Set(lus).size, 'doublon après l’ajout').toBe(lus.length);
    expect(lus).toContain(ancien);
    expect(lus).not.toContain(recent);
    // La page relue · le plus récent est dans la fenêtre neuve.
    expect((await pageRendue()).donnees.fichiers.some((f) => f.id === recent)).toBe(true);
    expect(await tout(portee, null)).toEqual(avant);
    await db!.execute(sql`delete from assets where id in (${recent}::uuid, ${ancien}::uuid)`);
  });
});

describe('le filtre de type · en SQL, la règle du noyau', () => {
  it('chaque filtre compte exactement ce que le noyau compte (SVG image, PDF « autre », sans format)', async () => {
    const lignes = [...PETIT, { name: 'Étiquette', kind: 'image', mimeType: 'image/png' }];
    for (const { cle } of FILTRES_TYPE_DRIVE) {
      const attendu = lignes.filter((x) => passeFiltreType(typeFichier(x.kind, x.mimeType), cle)).length;
      expect((await tout({ type: 'dossier', dossier: D.petit }, null, cle)).length, cle).toBe(attendu);
      expect(vueDrive((await pageRendue()).donnees, { ...ETAT_DRIVE_INITIAL, chemin: ['r:assets'], type: cle }).dossiers.find((x) => x.id === D.petit)!.compte, `carte · ${cle}`).toBe(lignes.length);
    }
  });
});

describe('la recherche · sur TOUS les fichiers de l’espace', () => {
  const chercher = async (q: string, filtre: FiltreTypeDrive = 'tous') => lire({ type: 'recherche', q }, null, filtre);
  it('trouve un fichier ancien hors de la fenêtre · par son nom sans accent ni casse, ou par un tag', async () => {
    const { donnees } = await pageRendue();
    expect(donnees.fichiers.some((f) => f.id === F.ancien)).toBe(false);
    for (const q of ['etiquette', 'ÉTIQUETTE', 'tiquette d’hiver', 'packaging', 'CARTON']) {
      const r = await chercher(q);
      expect([r.total, r.medias.map((m) => m.id)], q).toEqual([1, [F.ancien]]);
    }
    expect((await chercher('crème')).medias.map((m) => m.id)).toEqual([F.creme]);
    expect((await chercher('100%')).medias.map((m) => m.id)).toEqual([F.pourcent]);
    expect((await chercher('etiquette', 'video')).total).toBe(0);
  });
  it('jamais hors portée · autre espace, autre marque, corbeille, dossier jeté, marqueur de template', async () => {
    expect((await chercher('etiquette')).medias.map((m) => m.name)).toEqual(['Étiquette d’hiver 2019.png']);
    expect((await chercher('template')).total).toBe(0);
  });
  it('un total exact et des pages sans doublon · « racine » rend ses 500', async () => {
    const r = await chercher('racine');
    expect([r.total, r.medias.length]).toEqual([N.racine, PAGE_BIBLIOTHEQUE]);
    const toutes = await tout({ type: 'recherche', q: 'racine' }, null);
    expect(new Set(toutes).size).toBe(N.racine);
  });
});

describe('la garde · lecture de la Bibliothèque, portée de la session', () => {
  it('un lecteur client est refusé · un membre en Starter lit (règle de lecture d’avant)', async () => {
    etat.session = session(ids, 'uv');
    expect(await pageBibliothequeAction({ portee: { type: 'recherche', q: 'etiquette' } })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE.role });
    etat.session = session(ids, 'ua', { plan: 'starter' });
    expect((await lire({ type: 'recherche', q: 'etiquette' }, null)).total).toBe(1);
  });
  it('un membre de B ne voit rien de A · ni sa recherche, ni ses dossiers', async () => {
    etat.session = session(ids, 'ub');
    expect((await lire({ type: 'recherche', q: 'etiquette' }, null)).medias.map((m) => m.name)).toEqual(['etiquette secrete B.png']);
    expect((await lire({ type: 'dossier', dossier: D.gros }, null)).medias).toEqual([]);
    expect((await lire({ type: 'dossier', dossier: 'r:assets' }, null)).medias.map((m) => m.name)).toEqual(['etiquette secrete B.png']);
  });
  it('la lecture ciblée du lien interne · le fichier vivant de la portée, et rien d’autre', async () => {
    const A1 = { workspaceId: ids.wsA, marque: ids.brandA1 };
    expect((await lireMediaCible(A1, F.ancien))?.name).toBe('Étiquette d’hiver 2019.png');
    const hors = await idsDe(sql`name in ('etiquette corbeille.png', 'etiquette A2.png', 'etiquette secrete B.png')`);
    expect(hors.length).toBe(3);
    for (const id of hors) expect(await lireMediaCible(A1, id), id).toBeNull();
  });
  it('un dossier hors de la marque active ne rend rien · ses fichiers sont lus à la racine', async () => {
    expect((await lire({ type: 'dossier', dossier: D.hors }, null)).medias).toEqual([]);
  });
  it('une demande forgée est refusée AVANT toute lecture des médias', async () => {
    requetes = [];
    for (const d of [{ portee: { type: 'dossier', dossier: "x' or 1=1" } }, { portee: { type: 'corbeille' }, curseur: { t: "2026' or 1=1", id: ids.ua } }, { portee: { type: 'recherche', q: 'x'.repeat(500) } }, null]) {
      expect(await pageBibliothequeAction(d), JSON.stringify(d)).toMatchObject({ error: expect.any(String) });
    }
    expect(requetes.filter((q) => /from "assets"/i.test(q))).toEqual([]);
  });
});
