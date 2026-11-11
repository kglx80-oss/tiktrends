// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 13 ter V5 · T et L sur la VRAIE fiche d'un test · base réelle (pglite,
 * migrations du dépôt), page serveur réelle rendue et montée · on lit les
 * touches dessinées, on tape, on lit la navigation demandée, le toast, et ce
 * qui est écrit (rien).
 *  · une gagnante ARBITRÉE d'un lot, dans le plan · T ouvre l'écran Itérer
 *    EXISTANT, ce test présélectionné · L ouvre la fiche de son lot ;
 *  · un verdict du moteur pas encore arbitré · T fermé (raison dite) · dans le
 *    champ de l'arbitrage, la frappe reste au champ ;
 *  · un test hors lot · L fermé (raison dite).
 * Et la coquille lit au rendu serveur ce qu'il faut pour dessiner les touches
 * (cookie `tt_raccourcis`, plateforme). 0 $ · aucun modèle appelé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null,
  push: null as unknown as ReturnType<typeof import('vitest').vi.fn>, cookies: {} as Record<string, string>, entetes: {} as Record<string, string>,
}));
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
  useRouter: () => ({ refresh() {}, push: (u: string) => h.push(u), replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap/tests', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : h.cookies[n] !== undefined ? { value: h.cookies[n] } : undefined),
    getAll: () => [], has: () => false, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers({ 'x-tt-chemin': '/adsmap/tests', host: 'localhost', ...h.entetes }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import {
  RACCOURCIS, RAISON_ITERER_TEST_HORS_PLAN, RAISON_ITERER_TEST_SANS_GAGNANTE, RAISON_TEST_HORS_LOT,
  lienIterationVariable, lienLotSpatial, messageRaccourciFerme, toucheVisible,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';
import FicheTestSpatial from '../app/(spatial)/sp/adsmap/tests/[id]/page';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerCoquille } from '../lib/spatial/coquille';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const ids = h.ids;
const S = { L1: '', V1: '', W1: '', L4: '', H1: '', planH1: false };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(ws: string, brandId: string, number: number, goal: string) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return b!.id;
}
async function ad(ws: string, conceptId: string, batchId: string | null, code: string, verdict: 'winner' | 'loser', statut: 'validated' | 'computed') {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId, batchId, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la preuve rassure.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
  await db.insert(schema.verdicts).values({
    adId: a!.id, workspaceId: ws, computed: verdict, validated: statut === 'validated' ? verdict : null, status: statut, comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: verdict === 'winner' ? 12 : 3, cpa: verdict === 'winner' ? 10 : 40, roas: verdict === 'winner' ? 2.4 : 0.6, reason: verdict === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' },
  });
  return a!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Sérum');
  S.L1 = await lot(ids.wsA, ids.brandA1, 3, 'Affirmation ou question ?');
  S.V1 = await ad(ids.wsA, c1, S.L1, 'V1', 'winner', 'validated');
  await ad(ids.wsA, c1, S.L1, 'V2', 'loser', 'validated');
  const c4 = await chaine(ids.wsA, ids.brandA1, 'Crème');
  S.L4 = await lot(ids.wsA, ids.brandA1, 5, 'Preuve ou promesse ?');
  S.W1 = await ad(ids.wsA, c4, S.L4, 'V1', 'winner', 'computed');
  const c9 = await chaine(ids.wsA, ids.brandA1, 'Baume');
  S.H1 = await ad(ids.wsA, c9, null, 'V1', 'winner', 'validated');
  h.session = proprietaire(); h.marque = ids.brandA1;
  const plan = await iterationPlanAction();
  if (!plan.view?.rows.some((r) => r.adId === S.V1)) throw new Error('préalable · V1 n’est pas dans le plan d’itération');
  S.planH1 = !!plan.view?.rows.some((r) => r.adId === S.H1);
}, 240_000);

let root: Root | null = null;
const toasts: string[] = [];
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; h.push = vi.fn(); h.cookies = {}; h.entetes = {}; toasts.length = 0; document.cookie = 'tt_raccourcis=; path=/; max-age=0'; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el, { ...CTX_TEST, toast: (m) => { toasts.push(m); } })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}
const page = (id: string) => FicheTestSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const touche = async (key: string, cible: Element = document.body) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => { cible.dispatchEvent(ev); });
  return ev;
};
async function traces() {
  const n = (rows: unknown[]) => rows.length;
  return {
    ads: n(await db.select({ id: schema.ads.id }).from(schema.ads)),
    arbitres: n(await db.select({ id: schema.verdicts.adId }).from(schema.verdicts).where(eq(schema.verdicts.status, 'validated'))),
    apprentissages: n(await db.select({ id: schema.learnings.id }).from(schema.learnings)),
    aretes: n(await db.select({ id: schema.iterationEdges.id }).from(schema.iterationEdges)),
  };
}
const r = (id: string) => RACCOURCIS.find((x) => x.id === id)!;
const geste = (id: string) => document.querySelector(`[data-geste-clavier="${id}"]`);

describe('lot 13 ter · T et L sur la vraie fiche d’un test', () => {
  it('gagnante arbitrée d’un lot · T ouvre Itérer pré-rempli, L son lot · touches dessinées de la table · rien d’écrit', async () => {
    const avant = await traces();
    await monter(await page(S.V1));
    expect([geste('test-iterer')?.getAttribute('aria-keyshortcuts'), geste('test-iterer')?.querySelector('kbd')?.textContent]).toEqual([toucheVisible('test-iterer')!.aria, 'T']);
    expect([geste('test-lot')?.getAttribute('aria-keyshortcuts'), geste('test-lot')?.querySelector('kbd')?.textContent]).toEqual([toucheVisible('test-lot')!.aria, 'L']);
    expect(geste('test-lot')?.textContent).toContain('#3');
    await touche('t');
    await touche('l');
    expect(h.push.mock.calls, 'T puis L').toEqual([[lienIterationVariable({ adId: S.V1 })], [lienLotSpatial(S.L1)]]);
    expect(toasts).toEqual([]);
    expect(await traces(), 'une touche a écrit').toEqual(avant);
  });

  it('verdict du moteur pas arbitré · T fermé, la raison dite · dans le champ de l’arbitrage, la frappe reste au champ · rien d’arbitré', async () => {
    const avant = await traces();
    await monter(await page(S.W1));
    await touche('t');
    expect(h.push).not.toHaveBeenCalled();
    expect(toasts).toEqual([messageRaccourciFerme(r('test-iterer'), RAISON_ITERER_TEST_SANS_GAGNANTE)]);
    expect(document.querySelector('[data-raison-ferme="test-iterer"]')?.textContent).toBe(RAISON_ITERER_TEST_SANS_GAGNANTE);
    const champ = document.querySelector('textarea[aria-label="Ce que ce test t’apprend"]')!;
    expect(champ, 'préalable · le formulaire d’arbitrage est là').not.toBeNull();
    const ev = await touche('l', champ);
    expect(ev.defaultPrevented, 'L volé au champ').toBe(false);
    expect(h.push, 'L parti depuis le champ').not.toHaveBeenCalled();
    await touche('l');
    expect(h.push.mock.calls).toEqual([[lienLotSpatial(S.L4)]]);
    expect(await traces(), 'une touche a arbitré ou écrit').toEqual(avant);
  });

  it('hors lot · L fermé, la raison dite · T selon le plan', async () => {
    await monter(await page(S.H1));
    await touche('l');
    expect(toasts).toEqual([messageRaccourciFerme(r('test-lot'), RAISON_TEST_HORS_LOT)]);
    await touche('t');
    if (S.planH1) expect(h.push.mock.calls).toEqual([[lienIterationVariable({ adId: S.H1 })]]);
    else { expect(h.push).not.toHaveBeenCalled(); expect(toasts[1]).toBe(messageRaccourciFerme(r('test-iterer'), RAISON_ITERER_TEST_HORS_PLAN)); }
  });

  it('coupés par tt_raccourcis · rien ne part', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await monter(await page(S.V1));
    await touche('t'); await touche('l');
    expect(h.push).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('la coquille lit au rendu serveur la préférence (cookie) et la plateforme (en-têtes)', async () => {
    expect((await chargerCoquille()).raccourcis).toEqual({ actifs: true, mac: false });
    h.cookies = { tt_raccourcis: '0' };
    h.entetes = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)' };
    expect((await chargerCoquille()).raccourcis).toEqual({ actifs: false, mac: true });
    h.entetes = { 'sec-ch-ua-platform': '"Windows"', 'user-agent': 'Macintosh' };
    expect((await chargerCoquille()).raccourcis?.mac, 'l’indice client prime').toBe(false);
  });
});
