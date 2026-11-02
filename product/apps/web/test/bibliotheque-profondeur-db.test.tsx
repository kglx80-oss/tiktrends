import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · APRÈS UN GESTE, la liste garde sa PROFONDEUR · sur une
 * VRAIE base (pglite, migrations du dépôt), la VRAIE page Spatial `/assets`,
 * les VRAIES actions (`pageBibliothequeAction`, renommer, corbeille) et les
 * règles du noyau que l'écran suit (`suiteListe`, `noterListeChargee`,
 * `relecturesApresGeste`, `pagesApresRelecture`, `ajouterMedias`, `vueDrive`).
 * On lit les fichiers que la liste AFFICHE après le geste · jamais la
 * présence d'un appel.
 *
 * 700 fichiers dans « Gros dossier », 2 300 à la racine, entrelacés dans le
 * temps · la fenêtre de 400 en prend 200 à chacun. « Charger plus » deux fois
 * dans le dossier (600 affichés), un geste sur le 450e fichier chargé, la
 * page relue · la liste relue montre toujours ses 450 premiers (et les 600),
 * sans doublon ; la relecture est bornée (2 000) et « Charger plus » reprend
 * sans trou au-delà ; la lecture paginée passe par l'index de la migration
 * 0067 (EXPLAIN sur base réelle).
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
  ajouterMedias, appliquerPage, ETAT_DRIVE_INITIAL, FENETRE_BIBLIOTHEQUE, noterListeChargee, pagesApresRelecture, pagesInitiales, PAGE_BIBLIOTHEQUE,
  profondeurApresPage, PROFONDEUR_MAX_BIBLIOTHEQUE, REFUS_PAGE, relecturesApresGeste, suiteListe, vueDrive,
  type DonneesDrive, type EtatDrive, type EtatPagesBibliotheque, type FenetresBibliotheque, type ListeChargee, type MediaSource,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { mettreAssetsCorbeilleAction, pageBibliothequeAction, renommerAssetAction, restaurerAssetsAction } from '../app/actions/assets';

const ids = etat.ids;
const N = { gros: 700, racine: 2300 };
let GROS = '';

/** Les requêtes SQL réellement envoyées, avec leurs paramètres (pour les relire sous EXPLAIN). */
let requetes: Array<{ q: string; p: unknown[] }> = [];
const client = (db as unknown as { session: { client: { query: (...a: unknown[]) => Promise<unknown> } } }).session.client;
const query = client.query.bind(client);
client.query = (...a: unknown[]) => { requetes.push({ q: String(a[0]), p: (a[1] as unknown[]) ?? [] }); return query(...a); };

const T = (minutesAvant: number) => new Date(Date.parse('2026-10-30T12:00:00.000Z') - minutesAvant * 60_000);
const ligne = (name: string, createdAt: Date, extra: Partial<typeof schema.assets.$inferInsert> = {}): typeof schema.assets.$inferInsert => ({
  workspaceId: ids.wsA, brandId: ids.brandA1, name, kind: 'image', source: 'upload', mimeType: 'image/png', sizeBytes: 1000,
  url: `https://stockage.invalid/assets/${name.replace(/\W/g, '')}.png`, createdAt, ...extra,
});
const inserer = async (lignes: Array<typeof schema.assets.$inferInsert>) => {
  for (let i = 0; i < lignes.length; i += 500) await db!.insert(schema.assets).values(lignes.slice(i, i + 500));
};
const lignesDe = async <R,>(q: ReturnType<typeof sql>) => ((await db!.execute(q)) as unknown as { rows: R[] }).rows;
/** Les fichiers vivants d'un dossier, dans l'ordre de la lecture (le plus récent d'abord). */
const ordreBase = async (dossier: string | null) => (await lignesDe<{ id: string }>(sql`select id from assets where workspace_id = ${ids.wsA} and deleted_at is null
  and ${dossier ? sql`folder_id = ${dossier}` : sql`folder_id is null`} order by created_at desc, id desc`)).map((r) => r.id);

/** L'écran, tel que `usePagesBibliotheque` le tient · données de la page, pages lues, listes chargées. */
interface Ecran { base: DonneesDrive; fenetres: FenetresBibliotheque; extras: MediaSource[]; pages: EtatPagesBibliotheque; listes: ListeChargee[] }
const ouvrir = async (): Promise<Ecran> => {
  const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement<{ donnees: DonneesDrive; pagination: FenetresBibliotheque }>;
  return { base: el.props.donnees, fenetres: el.props.pagination, extras: [], pages: pagesInitiales(el.props.pagination), listes: [] };
};
const dans = (dossier: string): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, chemin: ['r:assets', dossier] });
const donnees = (x: Ecran) => ajouterMedias(x.base, x.extras);
/** Les fichiers de la bibliothèque que la liste AFFICHE. */
const affiches = (x: Ecran, e: EtatDrive) => vueDrive(donnees(x), e).fichiers.filter((f) => !f.lectureSeule);
const suite = (x: Ecran, e: EtatDrive) => { const d = donnees(x); return suiteListe(d, e, vueDrive(d, e), x.pages); };

/** « Charger plus » · la page demandée par le noyau, ajoutée comme l'écran l'ajoute. */
const chargerPlus = async (x: Ecran, e: EtatDrive): Promise<Ecran> => {
  const s = suite(x, e);
  if (!s?.demande) throw new Error('rien à charger');
  const r = await pageBibliothequeAction(s.demande);
  if ('error' in r) throw new Error(r.error);
  const liste: ListeChargee = { cle: s.cle, portee: s.demande.portee, filtre: s.demande.filtre, profondeur: profondeurApresPage(s.affiches, r.medias.length) };
  return { ...x, extras: [...x.extras, ...r.medias], pages: appliquerPage(x.pages, s.cle, r), listes: noterListeChargee(x.listes, liste) };
};
/** Le geste fait, la page se relit · chaque liste chargée relue à sa profondeur (ce que fait l'écran). */
const apresGeste = async (avant: Ecran): Promise<Ecran> => {
  const neuf = await ouvrir();
  const relues = [];
  for (const r of relecturesApresGeste(avant.listes)) {
    const page = await pageBibliothequeAction(r.demande);
    if ('error' in page) throw new Error(page.error);
    relues.push({ ...r, page });
  }
  const { pages, listes } = pagesApresRelecture(neuf.fenetres, relues);
  return { ...neuf, extras: relues.flatMap((r) => r.page.medias), pages, listes };
};
/** Le geste fait, la page relue SANS relecture (le comportement d'avant) · la référence. */
const sansRelecture = ouvrir;

beforeAll(async () => {
  await semer(db, schema, ids);
  GROS = (await db!.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'Gros dossier' }).returning({ id: schema.libraryFolders.id }))[0]!.id;
  // Racine et gros dossier entrelacés · la fenêtre des 400 en prend 200 à chacun.
  await inserer(Array.from({ length: N.racine }, (_, i) => ligne(`racine-${String(i).padStart(4, '0')}.png`, T(2 * i))));
  await inserer(Array.from({ length: N.gros }, (_, i) => ligne(`gros-${String(i).padStart(4, '0')}.png`, T(2 * i + 1), { folderId: GROS })));
  // 150 fichiers du gros dossier dans la MÊME milliseconde, autour du 450e · l'ordre y tient par l'identifiant.
  await db!.execute(sql`update assets set created_at = ${T(760).toISOString()}::timestamptz
    where folder_id = ${GROS} and name between 'gros-0380' and 'gros-0529'`);
  await db!.execute(sql`analyze assets`);
}, 120_000);

beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('après un geste · la liste relue garde sa profondeur', () => {
  it('précondition · la fenêtre ne donne que 200 fichiers du dossier · deux « Charger plus » en affichent 600', async () => {
    let x = await ouvrir();
    expect(affiches(x, dans(GROS)).length).toBe(FENETRE_BIBLIOTHEQUE / 2);
    x = await chargerPlus(x, dans(GROS));
    x = await chargerPlus(x, dans(GROS));
    expect(affiches(x, dans(GROS)).length).toBe(600);
    expect(x.listes).toEqual([expect.objectContaining({ cle: `d:${GROS}|tous`, profondeur: 600 })]);
  });

  it('renommer le 450e fichier chargé · la liste relue montre toujours ses 450 premiers (et les 600), sans doublon, le nom neuf', async () => {
    let x = await ouvrir();
    x = await chargerPlus(x, dans(GROS));
    x = await chargerPlus(x, dans(GROS));
    const ordre = await ordreBase(GROS);
    const cible = ordre[449]!;
    expect(affiches(x, dans(GROS)).some((f) => f.id === cible), 'le 450e est chargé avant le geste').toBe(true);
    expect(await renommerAssetAction({ id: cible, nom: 'renomme-450.png' })).toMatchObject({ ok: true });

    // Référence · sans relecture, la page relue revient à la fenêtre et le fichier touché disparaît de l'écran.
    const avant = affiches(await sansRelecture(), dans(GROS));
    expect([avant.length, avant.some((f) => f.id === cible)]).toEqual([200, false]);

    const apres = await apresGeste(x);
    const vus = affiches(apres, dans(GROS)).map((f) => f.id);
    expect(new Set(vus).size, 'doublon dans la liste relue').toBe(vus.length);
    expect(ordre.slice(0, 450).filter((id) => !vus.includes(id)), 'fichiers parmi les 450 premiers absents de la liste relue').toEqual([]);
    expect(vus.length).toBe(600);
    expect(new Set(vus)).toEqual(new Set(ordre.slice(0, 600)));
    expect(affiches(apres, dans(GROS)).find((f) => f.id === cible)?.nom).toBe('renomme-450.png');
    // La liste dit toujours 600 sur 700, et « Charger plus » reprend après le 600e · sans trou ni doublon.
    const s = suite(apres, dans(GROS))!;
    expect([s.affiches, s.total]).toEqual([600, 700]);
    const fin = await chargerPlus(apres, dans(GROS));
    const tous = affiches(fin, dans(GROS)).map((f) => f.id);
    expect([tous.length, new Set(tous).size]).toEqual([700, 700]);
    expect(await renommerAssetAction({ id: cible, nom: 'gros-0449.png' })).toMatchObject({ ok: true });
  });

  it('mettre le 450e fichier chargé à la corbeille · la liste relue montre les 450 premiers de la liste NEUVE, sans lui, toujours 600', async () => {
    let x = await ouvrir();
    x = await chargerPlus(x, dans(GROS));
    x = await chargerPlus(x, dans(GROS));
    const cible = (await ordreBase(GROS))[449]!;
    expect(await mettreAssetsCorbeilleAction({ ids: [cible] })).toMatchObject({ ok: true });
    const ordre = await ordreBase(GROS);
    const apres = await apresGeste(x);
    const vus = affiches(apres, dans(GROS)).map((f) => f.id);
    expect(vus).not.toContain(cible);
    expect(new Set(vus).size, 'doublon dans la liste relue').toBe(vus.length);
    expect(ordre.slice(0, 450).filter((id) => !vus.includes(id)), 'fichiers parmi les 450 premiers absents de la liste relue').toEqual([]);
    expect(new Set(vus)).toEqual(new Set(ordre.slice(0, 600)));
    expect(await restaurerAssetsAction({ ids: [cible] })).toMatchObject({ ok: true });
  });
});

describe('la borne · une relecture n’excède jamais PROFONDEUR_MAX_BIBLIOTHEQUE', () => {
  it('2 200 fichiers chargés à la racine · la relecture en lit 2 000, « Charger plus » reprend au 2 001e, sans trou ni doublon', async () => {
    const racine = dans('r:assets');
    let x = await ouvrir();
    while (affiches(x, racine).length < 2100) x = await chargerPlus(x, racine);
    const profondeur = affiches(x, racine).length;
    expect(profondeur).toBeGreaterThan(PROFONDEUR_MAX_BIBLIOTHEQUE);
    const relectures = relecturesApresGeste(x.listes);
    expect(relectures.map((r) => r.demande.limite)).toEqual([PROFONDEUR_MAX_BIBLIOTHEQUE]);
    requetes = [];
    const apres = await apresGeste(x);
    expect(requetes.filter((r) => /from "assets"/i.test(r.q) && /limit \$\d+/i.test(r.q) && r.p.includes(PROFONDEUR_MAX_BIBLIOTHEQUE)).length, 'la relecture · une seule requête de 2 000').toBe(1);
    const vus = affiches(apres, racine).map((f) => f.id);
    expect(vus.length).toBe(PROFONDEUR_MAX_BIBLIOTHEQUE);
    const ordre = await ordreBase(null);
    expect(new Set(vus)).toEqual(new Set(ordre.slice(0, PROFONDEUR_MAX_BIBLIOTHEQUE)));
    const suivant = await chargerPlus(apres, racine);
    const tous = affiches(suivant, racine).map((f) => f.id);
    expect(new Set(tous).size).toBe(tous.length);
    expect(new Set(tous)).toEqual(new Set(ordre.slice(0, PROFONDEUR_MAX_BIBLIOTHEQUE + PAGE_BIBLIOTHEQUE)));
  });

  it('une profondeur au-delà de la borne, forgée par le navigateur · refusée AVANT toute lecture des médias', async () => {
    requetes = [];
    for (const limite of [PROFONDEUR_MAX_BIBLIOTHEQUE + 1, 0, 1.5, '200', -1]) {
      expect(await pageBibliothequeAction({ portee: { type: 'dossier', dossier: 'r:assets' }, curseur: null, limite }), String(limite)).toEqual({ error: REFUS_PAGE.illisible });
    }
    expect(requetes.filter((r) => /from "assets"/i.test(r.q))).toEqual([]);
    const ok = await pageBibliothequeAction({ portee: { type: 'dossier', dossier: 'r:assets' }, curseur: null, limite: PROFONDEUR_MAX_BIBLIOTHEQUE });
    expect('error' in ok ? ok.error : ok.medias.length).toBe(PROFONDEUR_MAX_BIBLIOTHEQUE);
    // Une profondeur courte (moins qu'une page) · la liste continue, son curseur le dit (jamais « fin » à tort).
    const court = await pageBibliothequeAction({ portee: { type: 'dossier', dossier: GROS }, curseur: null, limite: 3 });
    if ('error' in court) throw new Error(court.error);
    expect(court.medias.map((m) => m.id)).toEqual((await ordreBase(GROS)).slice(0, 3));
    expect(court.suivant?.id).toBe(court.medias[2]!.id);
  });
});

describe('l’index de la migration 0067 · la lecture paginée le suit (EXPLAIN sur base réelle)', () => {
  /** Le plan des VRAIES requêtes envoyées par la page et l'action, relues sous EXPLAIN avec leurs paramètres. */
  const plans = async () => {
    requetes = [];
    const x = await ouvrir();
    await pageBibliothequeAction({ portee: { type: 'dossier', dossier: 'r:assets' }, curseur: x.fenetres.vivants });
    await pageBibliothequeAction({ portee: { type: 'dossier', dossier: 'r:assets' }, curseur: null, limite: 1000 });
    // Les lectures des VIVANTS · la fenêtre de la corbeille (presque vide ici) se lit plus vite sans index, le planificateur le sait.
    const lues = requetes.filter((r) => /from "assets"/i.test(r.q) && /order by "assets"\."created_at" desc, "assets"\."id" desc/i.test(r.q) && !/"deleted_at" is not null/i.test(r.q));
    expect(lues.length).toBe(3); // fenêtre des vivants, page par curseur, relecture
    const out: string[] = [];
    for (const r of lues) out.push(((await query(`explain ${r.q}`, r.p)) as { rows: Array<Record<string, string>> }).rows.map((l) => Object.values(l)[0]).join('\n'));
    return out;
  };

  it('fenêtre, page par curseur et relecture · « Index Scan using assets_ws_created_id_idx », sans tri', async () => {
    const [index] = await lignesDe<{ d: string }>(sql`select pg_get_indexdef('assets_ws_created_id_idx'::regclass) as d`);
    expect(index!.d).toBe('CREATE INDEX assets_ws_created_id_idx ON public.assets USING btree (workspace_id, created_at DESC, id DESC)');
    for (const p of await plans()) {
      expect(p).toMatch(/Index Scan using assets_ws_created_id_idx/);
      expect(p).not.toMatch(/\bSort\b/);
    }
    // Le curseur fait partie de la condition d'index · Postgres saute droit au fichier suivant.
    expect((await plans())[1]).toMatch(/Index Cond: \(\(workspace_id = .*\) AND \(ROW\(created_at, id\) < ROW\(/);
  });

  it('référence · sans l’index, la même lecture TRIE toutes les lignes de l’espace (la garde voit la différence)', async () => {
    await db!.execute(sql`drop index assets_ws_created_id_idx`);
    try {
      for (const p of await plans()) {
        expect(p).not.toMatch(/assets_ws_created_id_idx/);
        expect(p).toMatch(/\bSort\b/);
      }
    } finally {
      await db!.execute(sql.raw('CREATE INDEX IF NOT EXISTS "assets_ws_created_id_idx" ON "assets" USING btree ("workspace_id", "created_at" DESC, "id" DESC)'));
    }
  });
});
