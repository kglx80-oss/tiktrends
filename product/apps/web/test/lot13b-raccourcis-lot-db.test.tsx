// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 13 bis V5 · C et T sur la VRAIE fiche d'un lot · base réelle (pglite,
 * migrations du dépôt), page serveur réelle rendue et montée · on tape les
 * touches et on lit ce qui se passe (ancre, focus, navigation demandée, toast)
 * et ce qui est écrit (rien).
 *  · un lot conclu dont la gagnante arbitrée est dans le plan · T ouvre
 *    l'écran Itérer EXISTANT, cette gagnante présélectionnée · C est fermé ;
 *  · un lot à conclure (verdicts du moteur, rien d'arbitré) · C mène à
 *    « Conclure le lot » · T est fermé (aucune gagnante arbitrée) ;
 *  · aucune écriture, aucune action serveur par une touche.
 * 0 $ · aucun modèle appelé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null, push: null as unknown as ReturnType<typeof import('vitest').vi.fn> }));
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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap/lots', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/adsmap/lots', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { RACCOURCIS, RAISON_GESTE_RIEN_A_CONCLURE, RAISON_GESTE_SANS_GAGNANTE_LOT, lienIterationVariable, messageRaccourciFerme } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const ids = h.ids;
const S = { L1: '', V1: '', V2: '', L4: '', W1: '', W2: '' };
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
async function ad(ws: string, conceptId: string, batchId: string, code: string, verdict: 'winner' | 'loser', statut: 'validated' | 'computed') {
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
  // L1 · conclu · V1 gagnante arbitrée (dans le plan), V2 perdante.
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Sérum');
  S.L1 = await lot(ids.wsA, ids.brandA1, 3, 'Affirmation ou question ?');
  S.V1 = await ad(ids.wsA, c1, S.L1, 'V1', 'winner', 'validated');
  S.V2 = await ad(ids.wsA, c1, S.L1, 'V2', 'loser', 'validated');
  // L4 · à conclure · le moteur a tranché, personne n'a arbitré.
  const c4 = await chaine(ids.wsA, ids.brandA1, 'Crème');
  S.L4 = await lot(ids.wsA, ids.brandA1, 5, 'Preuve ou promesse ?');
  S.W1 = await ad(ids.wsA, c4, S.L4, 'V1', 'winner', 'computed');
  S.W2 = await ad(ids.wsA, c4, S.L4, 'V2', 'loser', 'computed');
  h.session = proprietaire(); h.marque = ids.brandA1;
  const plan = await iterationPlanAction();
  if (!plan.view?.rows.some((r) => r.adId === S.V1)) throw new Error('préalable · V1 n’est pas dans le plan d’itération');
}, 240_000);

let root: Root | null = null;
const toasts: string[] = [];
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; h.push = vi.fn(); toasts.length = 0; window.location.hash = ''; document.cookie = 'tt_raccourcis=; path=/; max-age=0'; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el, { ...CTX_TEST, toast: (m) => { toasts.push(m); } })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}
const page = (id: string) => LotSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
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

describe('lot 13 bis · C et T sur la vraie fiche d’un lot', () => {
  it('lot conclu · T ouvre Itérer EXISTANT, la gagnante présélectionnée · C fermé, le toast dit pourquoi · rien d’écrit', async () => {
    const avant = await traces();
    await monter(await page(S.L1));
    expect(document.getElementById('conclure'), 'préalable · un lot conclu n’a pas de section à conclure').toBeNull();
    await touche('c');
    expect(window.location.hash).toBe('');
    expect(toasts).toEqual([messageRaccourciFerme(r('lot-conclure'), RAISON_GESTE_RIEN_A_CONCLURE)]);
    await touche('t');
    expect(h.push.mock.calls, 'T n’ouvre pas Itérer depuis la gagnante').toEqual([[lienIterationVariable({ adId: S.V1 })]]);
    // L'écran d'arrivée, tel que la touche l'ouvre · la gagnante y est présélectionnée.
    const href = h.push.mock.calls[0]![0] as string;
    await monter(await IterationSpatiale({ searchParams: Promise.resolve(Object.fromEntries(new URL(`http://x${href}`).searchParams)) }));
    expect(document.querySelector(`[data-itad="${S.V1}"]`)?.getAttribute('aria-pressed'), 'Itérer n’est pas pré-rempli').toBe('true');
    expect(await traces(), 'une touche a écrit').toEqual(avant);
  });

  it('lot à conclure · C mène à « Conclure le lot » (ancre, focus) · T fermé · rien d’arbitré', async () => {
    const avant = await traces();
    await monter(await page(S.L4));
    await touche('c');
    expect(window.location.hash, 'C ne mène pas à l’ancre').toBe('#conclure');
    expect(document.activeElement?.id).toBe('conclure');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Conclure le lot');
    await touche('t');
    expect(h.push, 'T ouvre Itérer sans gagnante arbitrée').not.toHaveBeenCalled();
    expect(toasts).toEqual([messageRaccourciFerme(r('lot-iterer'), RAISON_GESTE_SANS_GAGNANTE_LOT)]);
    // Dans l'apprentissage du verdict · la frappe appartient au champ.
    window.location.hash = '';
    const champ = document.querySelector(`[data-apprentissage="${S.W1}"]`)!;
    await touche('c', champ);
    expect(window.location.hash, 'C dans le champ').toBe('');
    expect(await traces(), 'une touche a arbitré ou écrit').toEqual(avant);
  });

  it('coupés par tt_raccourcis · rien ne part', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await monter(await page(S.L1));
    await touche('t'); await touche('c');
    expect(h.push).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });
});
