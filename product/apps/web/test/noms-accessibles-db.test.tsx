// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Des contrôles de ligne aux noms distincts · base RÉELLE (pglite, migrations
 * du dépôt), VRAIES pages Résultats (vue d'ensemble, lots, fiche d'un lot en
 * composition et à conclure, tests, hypothèses, boucle, décisions,
 * apprentissages) rendues · on lit le DOM comme un lecteur d'écran et on
 * exige · aucun nom accessible en double menant à deux cibles, chaque nom
 * contient le libellé visible, et chaque contrôle de ligne nomme SA ligne
 * (il commence par le mot affiché). La fiche d'un lot CONCLU et la lignée
 * réelles sont gardées par `gagnante-clavier-db.test.tsx` (exception retirée).
 * 0 $ · rien n'est écrit à l'affichage. Aucune date « à venir » · lots lancés il y a 30 jours.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/adsmap', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { semer, session } from './studios-semis';
import { avecSpatial } from './spatial/fournisseur';
import { ecartsDeNoms, libelleVisible, nomAccessible } from './helpers/noms-accessibles';
import ResultatsSpatial from '../app/(spatial)/sp/adsmap/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import TestsSpatial from '../app/(spatial)/sp/adsmap/tests/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import BoucleSpatial from '../app/(spatial)/sp/adsmap/boucle/page';
import DecisionsSpatial from '../app/(spatial)/sp/adsmap/decisions/page';
import ApprentissagesSpatial from '../app/(spatial)/sp/adsmap/apprentissages/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const L = {} as Record<'D' | 'A' | 'T', { id: string; n: number }>;
let numero = 40;

async function concept(titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(goal: string, status: 'planned' | 'testing') {
  numero += 1;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: numero, goal, status, launchedAt: status === 'testing' ? new Date(Date.now() - 30 * 86_400_000) : null }).returning({ id: schema.batches.id });
  return { id: b!.id, n: numero };
}
async function ad(conceptId: string, code: string, batchId: string | null, status: 'draft' | 'done') {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId, batchId, variantCode: code, status, hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la question retient.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
  return a!.id;
}
async function verdictCalcule(adId: string, v: 'winner' | 'loser') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: null, status: 'computed', comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = session(ids, 'ua', { role: 'owner', plan: 'plus' }); h.marque = ids.brandA1;
  const c = await concept('Crème du matin');
  // D · un lot en COMPOSITION · deux variantes rangées · deux autres libres (le vivier).
  L.D = await lot('Lot à composer', 'planned');
  for (const code of ['D1', 'D2']) await ad(c, code, L.D.id, 'draft');
  for (const code of ['V1', 'V2']) await ad(c, code, null, 'draft');
  // A · un lot À CONCLURE · deux verdicts calculés, à arbitrer.
  L.A = await lot('Lot à arbitrer', 'testing');
  await verdictCalcule(await ad(c, 'A1', L.A.id, 'done'), 'winner');
  await verdictCalcule(await ad(c, 'A2', L.A.id, 'done'), 'loser');
  // T · un deuxième lot en test · la liste des lots en a plusieurs.
  L.T = await lot('Lot en test', 'testing');
  await ad(c, 'T1', L.T.id, 'done');
  await ad(c, 'T2', L.T.id, 'done');
}, 240_000);

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const rendre = async (p: Promise<ReactElement> | ReactElement) => dom(renderToStaticMarkup(avecSpatial(await p)));
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
/** Les contrôles de ligne d'un libellé visible · combien, et ceux dont le nom ne nomme pas leur ligne. */
function deLigne(d: ParentNode, libelle: string) {
  const c = [...d.querySelectorAll('a[href], button')].filter((x) => libelleVisible(x) === libelle);
  return { n: c.length, sansLigne: c.map((x) => nomAccessible(x, d)).filter((n) => !n.startsWith(`${libelle} · `)) };
}
function sansEcart(d: ParentNode) {
  const e = ecartsDeNoms(d);
  expect(e.doublons, 'deux contrôles de même nom accessible mènent à des cibles différentes').toEqual([]);
  expect(e.sansLibelle, 'un nom accessible ne contient pas le libellé visible').toEqual([]);
}
async function lignes() {
  const t = async (x: unknown) => (await db.select().from(x as typeof schema.ads)).map((l) => JSON.stringify(l)).sort();
  return { ads: await t(schema.ads), verdicts: await t(schema.verdicts), lots: await t(schema.batches), apprentissages: await t(schema.learnings), depense: await t(schema.aiSpend), credits: await t(schema.creditLedger) };
}

describe('vraies pages Résultats · aucun nom en double vers deux cibles · chaque contrôle de ligne nomme sa ligne', () => {
  it('la fiche d’un lot en COMPOSITION · « Fiche », « Retirer », « Ajouter » nomment leur variante', async () => {
    const d = await rendre(LotSpatial({ params: Promise.resolve({ id: L.D.id }), searchParams: sp() }));
    for (const [libelle, n] of [['Fiche', 2], ['Retirer', 2], ['Ajouter', 2]] as const) {
      const x = deLigne(d, libelle);
      expect(x.n, `préalable · « ${libelle} » rendu ${x.n} fois sur la fiche du lot en composition`).toBeGreaterThanOrEqual(n);
      expect(x.sansLigne, `« ${libelle} » ne nomme pas sa variante`).toEqual([]);
    }
    sansEcart(d);
  });

  it('la fiche d’un lot À CONCLURE · « Valider le verdict » et la portée nomment leur variante', async () => {
    const d = await rendre(LotSpatial({ params: Promise.resolve({ id: L.A.id }), searchParams: sp() }));
    for (const libelle of ['Valider le verdict', 'Cette variante', 'Le concept']) {
      const x = deLigne(d, libelle);
      expect(x.n, `préalable · « ${libelle} » rendu ${x.n} fois sur la fiche du lot à conclure`).toBeGreaterThanOrEqual(2);
      expect(x.sansLigne, `« ${libelle} » ne nomme pas sa variante`).toEqual([]);
    }
    sansEcart(d);
  });

  it('la liste des lots · le lien de chaque lot nomme son lot', async () => {
    const d = await rendre(LotsSpatial({ searchParams: sp({ filtre: 'tous' }) }));
    const liens = [...d.querySelectorAll('[data-lot-lien]')];
    expect(liens.length, 'préalable · plusieurs lots dans la liste').toBeGreaterThanOrEqual(2);
    for (const l of liens) expect(nomAccessible(l, d).startsWith(`${libelleVisible(l)} · Lot`), `le lien d’un lot ne nomme pas son lot · « ${nomAccessible(l, d)} »`).toBe(true);
    sansEcart(d);
  });

  it('tous les tests · « Ouvrir » / « Arbitrer » et « Studio » nomment leur test', async () => {
    const d = await rendre(TestsSpatial({ searchParams: sp() }));
    const studio = deLigne(d, 'Studio');
    expect(studio.n, 'préalable · plusieurs tests rattachés à un concept').toBeGreaterThanOrEqual(2);
    expect(studio.sansLigne).toEqual([]);
    const ouvrir = [deLigne(d, 'Ouvrir'), deLigne(d, 'Arbitrer')];
    expect(ouvrir[0]!.n + ouvrir[1]!.n, 'préalable · plusieurs fiches de test').toBeGreaterThanOrEqual(2);
    expect([...ouvrir[0]!.sansLigne, ...ouvrir[1]!.sansLigne]).toEqual([]);
    sansEcart(d);
  });

  it('vue d’ensemble, hypothèses, boucle, décisions, apprentissages · aucun écart · rien d’écrit à l’affichage', async () => {
    const avant = await lignes();
    for (const [nom, page] of [
      ['vue d’ensemble', () => ResultatsSpatial({ searchParams: sp() })], ['hypothèses', () => HypothesesSpatial({ searchParams: sp() })],
      ['boucle', () => BoucleSpatial()], ['décisions', () => DecisionsSpatial()], ['apprentissages', () => ApprentissagesSpatial()],
    ] as const) {
      const d = await rendre(page());
      expect(d.querySelector('.view'), `préalable · la page ${nom} est rendue`).toBeTruthy();
      const e = ecartsDeNoms(d);
      expect(e.doublons, `${nom} · deux contrôles de même nom accessible mènent à des cibles différentes`).toEqual([]);
      expect(e.sansLibelle, `${nom} · un nom accessible ne contient pas le libellé visible`).toEqual([]);
    }
    expect(await lignes(), 'afficher a écrit').toEqual(avant);
  });
});
