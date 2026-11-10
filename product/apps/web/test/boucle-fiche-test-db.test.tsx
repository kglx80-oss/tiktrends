// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * La boucle, jusqu'à la fiche d'un test · base RÉELLE (pglite, migrations du
 * dépôt), VRAIES actions, VRAIES pages rendues et montées · on lit le DOM et ce
 * qui est écrit, jamais la présence d'un appel.
 *
 *  · la fiche d'un test (`/adsmap/tests/[id]`) · son persona et son offre (liens
 *    LUS · « à trancher » en désaccord), leur lecture sur la marque, et les gestes
 *    SEULEMENT quand l'un se détache · rien n'est écrit avant le clic ;
 *  · « Quelle offre » d'un lot · « Itérer sur cette offre » et « Créer une
 *    hypothèse » quand l'offre se détache · silence dit sinon · au clic,
 *    l'itération et l'hypothèse sont créées ;
 *  · une hypothèse née d'une offre porte la provenance « Offre », relue dans
 *    « D'où viennent les hypothèses qui gagnent » ;
 *  · une offre d'une autre marque dans l'adresse · aucune provenance posée ;
 *  · une autre marque, un autre espace · refus sans fuite, rien d'écrit.
 * 0 $ · aucun modèle, aucune dépense, aucun crédit (worker et stockage simulés).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'ub', 'lea', 'max', 'sam', 'zed']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: 'localhost' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../lib/spend-guard', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/spend-guard')>()), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { and, desc } from 'drizzle-orm';
import {
  NOTE_GESTES_OFFRE_SILENCE, NOTE_OFFRE_PROVENANCE, PHRASE_OFFRE_A_TRANCHER, PHRASE_PERSONA_A_TRANCHER,
  construireBriefV5, faitOffre, lienIterationVariable, lireOrigineHypothese, noteGestesSilenceFiche, offreBriefDepuis, saisieBriefVide,
  type BriefCanonique,
} from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { contexteDepuisSession } from '../lib/studios/garde';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique, contenuImages } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import FicheTestSpatial from '../app/(spatial)/sp/adsmap/tests/[id]/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const I = h.ids;
const JOUR = 86_400_000;
const O = { remise: '', livraison: '', garantie: '', secrete: '' };
const S = { LR: '', LS: '', LL: '', A2: '', LJ: '', lea: [] as string[], max: [] as string[], sam: [] as string[], zed: [] as string[], studio: '', page: '' };

type Qui = 'uo' | 'um' | 'ub';
function sess(qui: Qui): SessionTest {
  return {
    user: { id: I[qui]!, email: `${qui}@boucle-test.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace',
    role: qui === 'um' ? 'member' : 'owner', plan: 'plus', equipe: null,
  };
}
const MARQUE = { A: () => ({ id: I.bA!, name: 'Neva' }), A2: () => ({ id: I.bA2!, name: 'Autre' }), B: () => ({ id: I.bB!, name: 'Ailleurs' }) };
function comme(qui: Qui, marque: { id: string; name: string } | null) { h.session = sess(qui); h.marque = marque; }

/* ───────────────────────────── semis ───────────────────────────── */

async function lot(brandId: string, number: number, goal: string, ws = I.wsA!) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * JOUR) }).returning({ id: schema.batches.id });
  return b!.id;
}
const agg = (v: 'winner' | 'loser') => ({ spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6, reason: v === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' });
async function verdict(adId: string, v: 'winner' | 'loser', statut: 'validated' | 'computed', ws = I.wsA!) {
  await db.insert(schema.verdicts).values({ adId, workspaceId: ws, computed: v, validated: statut === 'validated' ? v : null, status: statut, comparable: true, metricsAgg: agg(v) });
}
/** Une ad de la carte (persona → désir → angle → concept → ad), diffusant une offre, rangée dans un lot, avec son verdict arbitré. */
async function adCarte(personaId: string, offerId: string | null, batchId: string, code: string, v: 'winner' | 'loser', ws = I.wsA!) {
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId, label: `Désir ${code}` }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: `Angle ${code}`, mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: `Concept ${code}` }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId: c!.id, batchId, variantCode: code, status: 'done', testedVariable: 'hook', offerId, hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la preuve rassure.` }).returning({ id: schema.ads.id });
  await verdict(ad!.id, v, 'validated', ws);
  return ad!.id;
}
async function offre(brandId: string, label: string, kind: string) {
  const [o] = await db.insert(schema.offers).values({ workspaceId: I.wsA!, brandId, label, kind, conditions: 'conditions' }).returning({ id: schema.offers.id });
  return o!.id;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus', onboardedAt: new Date() }, { id: I.wsB!, name: 'Espace B', plan: 'plus', onboardedAt: new Date() }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@boucle-test.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  await db.insert(schema.personas).values([
    { id: I.lea!, brandId: I.bA!, name: 'Léa, 34 ans', status: 'validated', rank: 1 }, { id: I.max!, brandId: I.bA!, name: 'Max', status: 'validated', rank: 2 },
    { id: I.sam!, brandId: I.bA!, name: 'Sam', status: 'validated', rank: 3 }, { id: I.zed!, brandId: I.bA2!, name: 'Zed secret', status: 'validated', rank: 1 },
  ]);
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.wsA!, brandId: I.bA!, url: 'https://neva.test/p', label: 'Page produit' }).returning();
  S.page = page!.id;
  O.remise = await offre(I.bA!, 'Remise de bienvenue', 'remise');
  O.livraison = await offre(I.bA!, 'Livraison offerte', 'livraison');
  O.garantie = await offre(I.bA!, 'Garantie 30 jours', 'garantie');
  O.secrete = await offre(I.bA2!, 'Offre secrète A2', 'remise');

  // LR · lot #1 · Max, 1 gagnante sur 10, sous « Livraison offerte » · la référence.
  S.LR = await lot(I.bA!, 1, 'Référence livraison');
  for (let i = 0; i < 10; i++) S.max.push(await adCarte(I.max!, O.livraison, S.LR, `R${i}`, i === 0 ? 'winner' : 'loser'));
  // LS · lot #4 · Sam, deux variantes sous « Garantie 30 jours » · sous l'effectif.
  S.LS = await lot(I.bA!, 4, 'Deux variantes garantie');
  for (const [k, v] of [['S1', 'winner'], ['S2', 'loser']] as const) S.sam.push(await adCarte(I.sam!, O.garantie, S.LS, k, v));
  // LL · lot #5 · Léa, 6 gagnantes sur 6, sous « Remise de bienvenue » · elle et l'offre se détachent.
  S.LL = await lot(I.bA!, 5, 'Pour Léa');
  for (let i = 0; i < 6; i++) S.lea.push(await adCarte(I.lea!, O.remise, S.LL, `V${i + 1}`, 'winner'));
  // A2 · un lot, un persona et une offre secrets.
  S.A2 = await lot(I.bA2!, 9, 'SECRET_LOT_A2');
  for (let i = 0; i < 4; i++) S.zed.push(await adCarte(I.zed!, O.secrete, S.A2, `Z${i}`, 'winner'));
  // LJ · le lot où les hypothèses créées plus bas sont mesurées.
  S.LJ = await lot(I.bA!, 7, 'Hypothèses mesurées');

  // Le test « à trancher » · un projet dont le brief vise Léa ET la remise, une variante rattachée au test (Studios réels, worker simulé) ·
  // puis la carte le range sous Max et le test diffuse la livraison · deux désaccords, aucun lien recopié.
  comme('uo', MARQUE.A());
  const personaRef = construireBriefV5({ ...saisieBriefVide(), intention: 'Faire acheter', persona: { id: I.lea!, label: 'Léa, 34 ans' } }).personaRef;
  const base = briefCanonique() as unknown as BriefCanonique;
  const faitRemise = faitOffre(offreBriefDepuis({ id: O.remise, intitule: 'Remise de bienvenue', type: 'remise', conditions: 'conditions' })!);
  const ctx = contexteDepuisSession(sess('uo'), [I.bA!, I.bA2!], [], 'st_boucle_test');
  const p = await projetAvecBrief(db, { workspaceId: I.wsA!, brandId: I.bA!, userId: I.uo!, titre: 'Pour Léa, remise', contenu: contenuImages(briefCanonique({ personaRef, facts: [...base.facts, faitRemise] })) });
  const job = await lancerLot(db, ctx, p.projectId, KEYFRAMES(1));
  await executer(db, job);
  const [assetId] = Object.values(await sortiesDuJob(db, job));
  const v = await creerVariante(ctx, { assetId: assetId! });
  if (!v.ok) throw new Error(v.code);
  const l = await rattacherVarianteAuTest(ctx, { variantId: v.variante.id, saisie: saisieTest() });
  if (!l.ok) throw new Error(l.code);
  S.studio = l.lien.adsmapAdId;
  const [angleMax] = await db.select({ id: schema.angles.id }).from(schema.angles).innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).where(eq(schema.desires.personaId, I.max!)).limit(1);
  const [ad] = await db.select({ c: schema.ads.conceptId }).from(schema.ads).where(eq(schema.ads.id, S.studio));
  await db.update(schema.concepts).set({ angleId: angleMax!.id }).where(eq(schema.concepts.id, ad!.c));
  await db.update(schema.ads).set({ offerId: O.livraison, landingPageId: S.page }).where(eq(schema.ads.id, S.studio));

  // Préalable · les gagnantes de Léa sont au plan d'itération de la marque, la perdante de Max non.
  const plan = await iterationPlanAction();
  if (!S.lea.every((id) => plan.view?.rows.some((r) => r.adId === id))) throw new Error('préalable · les gagnantes de Léa ne sont pas au plan d’itération');
  h.session = null; h.marque = null;
}, 300_000);

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const ficheTest = async (id: string) => dom(renderToStaticMarkup(avecSpatial(await FicheTestSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))));
const pageLot = async (id: string) => dom(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }) }))));
const pageHypotheses = async () => dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial())));
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
const cible = (d: ParentNode, g: 'persona' | 'offre') => d.querySelector<HTMLElement>(`[aria-label="Pour qui · quelle offre · ce test"] [data-cible-test="${g}"]`)!;
const derniere = async () => (await db.select().from(schema.ads).where(and(eq(schema.ads.workspaceId, I.wsA!), eq(schema.ads.status, 'draft'))).orderBy(desc(schema.ads.createdAt)).limit(1))[0]!;

async function traces() {
  const n = (rows: unknown[]) => rows.length;
  return {
    ads: n(await db.select({ id: schema.ads.id }).from(schema.ads)),
    aretes: n(await db.select({ id: schema.iterationEdges.id }).from(schema.iterationEdges)),
    concepts: n(await db.select({ id: schema.concepts.id }).from(schema.concepts)),
    depense: n(await db.select({ id: schema.aiSpend.id }).from(schema.aiSpend)),
    credits: n(await db.select({ id: schema.creditLedger.id }).from(schema.creditLedger)),
  };
}

let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; h.session = null; h.marque = null; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
}
async function cliquer(el: Element | null | undefined, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(el: HTMLInputElement | HTMLTextAreaElement | null, valeur: string) {
  expect(el).toBeTruthy();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  await act(async () => { el!.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function ranger(f: HTMLFormElement, avant: number) {
  await cliquer([...f.querySelectorAll('button')].find((b) => b.textContent === 'Ranger dans « À formuler »'), 'ranger');
  for (let i = 0; i < 50 && (await traces()).ads === avant; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}
/** La variante mesurée · rangée dans le lot des hypothèses avec son verdict (le cycle de test existant). */
async function mesurer(adId: string, v: 'winner' | 'loser') {
  await db.update(schema.ads).set({ batchId: S.LJ, status: 'done' }).where(eq(schema.ads.id, adId));
  await verdict(adId, v, 'computed');
}

/* ───────────────────────────── la fiche d'un test ───────────────────────────── */

describe('fiche d’un test · son persona, son offre, leur lecture, les gestes seulement quand l’un se détache', () => {
  it('une variante de Léa sous la remise · les deux se détachent · leur lecture, leurs gestes, Itérer part de CE test · rien d’écrit', async () => {
    comme('uo', MARQUE.A());
    const avant = await traces();
    const d = await ficheTest(S.lea[2]!);
    const p = cible(d, 'persona'), o = cible(d, 'offre');
    expect(p.getAttribute('data-cible-id'), 'le persona du test n’est pas lu').toBe(I.lea);
    expect(p.querySelector('[data-cible-libelle]')!.textContent).toBe('Léa · d’après la carte');
    expect(p.querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture')).toBe('au_dessus');
    expect(p.querySelector('[data-cible-phrase]')!.textContent).toMatch(/^6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 2 sur 12/);
    const itP = p.querySelector<HTMLAnchorElement>(`[data-gestes-persona="${I.lea}"] [data-geste-persona-lot="iterer"]`)!;
    expect(itP?.tagName, 'Itérer sur ce persona n’est pas un lien ouvert').toBe('A');
    expect(itP.getAttribute('href'), 'Itérer part d’abord de CE test, au plan').toBe(lienIterationVariable({ adId: S.lea[2]! }));
    expect(o.getAttribute('data-cible-id'), 'l’offre du test n’est pas lue').toBe(O.remise);
    expect(o.querySelector('[data-cible-libelle]')!.textContent).toBe('Remise de bienvenue · d’après le test');
    expect(o.querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture')).toBe('au_dessus');
    const itO = o.querySelector<HTMLAnchorElement>(`[data-gestes-offre="${O.remise}"] [data-geste-offre="iterer"]`)!;
    expect(itO?.textContent).toBe('Itérer sur cette offre');
    expect(itO.getAttribute('href')).toBe(lienIterationVariable({ adId: S.lea[2]! }));
    expect(d.querySelectorAll('[data-cible-silence]'), 'le silence est dit alors que les deux se détachent').toHaveLength(0);
    expect(d.textContent, 'la fiche laisse fuir A2').not.toMatch(/SECRET_LOT_A2|Zed secret|Offre secrète/);
    expect(await traces(), 'ouvrir la fiche a écrit').toEqual(avant);
  });

  it('une perdante de Max sous la livraison · en dessous · Itérer part d’une gagnante de Max au plan, pas de ce test', async () => {
    comme('uo', MARQUE.A());
    const d = await ficheTest(S.max[3]!);
    const p = cible(d, 'persona');
    expect(p.querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture')).toBe('en_dessous');
    expect(p.querySelector(`[data-gestes-persona="${I.max}"] [data-geste-persona-lot="iterer"]`)!.getAttribute('href'), 'Itérer part d’une perdante').toBe(lienIterationVariable({ adId: S.max[0]! }));
    expect(cible(d, 'offre').querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture')).toBe('en_dessous');
  });

  it('une variante de Sam sous la garantie · ni l’un ni l’autre ne se détache · leur lecture muette, AUCUN geste, et c’est dit', async () => {
    comme('uo', MARQUE.A());
    const d = await ficheTest(S.sam[0]!);
    const p = cible(d, 'persona'), o = cible(d, 'offre');
    expect([p.querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture'), o.querySelector('[data-cible-lecture]')!.getAttribute('data-cible-lecture')]).toEqual(['effectif', 'effectif']);
    expect(d.querySelector('[data-gestes-persona], [data-gestes-offre]'), 'un geste pour un groupe qui ne se détache pas').toBeNull();
    expect(p.querySelector('[data-cible-silence="persona"]')?.textContent, 'le silence des gestes du persona n’est pas dit').toBe(noteGestesSilenceFiche('Ce persona'));
    expect(o.querySelector('[data-cible-silence="offre"]')?.textContent, 'le silence des gestes de l’offre n’est pas dit').toBe(noteGestesSilenceFiche('Cette offre'));
  });

  it('le test des Studios · carte (Max) contre brief (Léa), test (livraison) contre brief (remise) · « à trancher », ni lecture ni geste', async () => {
    comme('uo', MARQUE.A());
    const d = await ficheTest(S.studio);
    const p = cible(d, 'persona'), o = cible(d, 'offre');
    expect(p.hasAttribute('data-a-trancher'), 'le désaccord du persona n’est pas affiché').toBe(true);
    expect(p.getAttribute('data-cible-id'), 'un persona retenu malgré le désaccord').toBe('');
    expect(p.querySelector('[data-cible-libelle]')!.textContent).toBe('Persona à trancher · la carte dit Max, le brief du projet Léa');
    expect(p.querySelector('[data-cible-phrase]')!.textContent).toBe(PHRASE_PERSONA_A_TRANCHER);
    expect(o.hasAttribute('data-a-trancher'), 'le désaccord de l’offre n’est pas affiché').toBe(true);
    expect(o.querySelector('[data-cible-libelle]')!.textContent).toBe('Offre à trancher · le test diffuse « Livraison offerte », le brief du projet « Remise de bienvenue »');
    expect(o.querySelector('[data-cible-phrase]')!.textContent).toBe(PHRASE_OFFRE_A_TRANCHER);
    expect(d.querySelector('[data-cible-lecture], [data-gestes-persona], [data-gestes-offre]'), 'une lecture ou un geste pour un test à trancher').toBeNull();
    expect(d.querySelector('[aria-label="Pour qui · quelle offre · ce test"]')!.textContent).toContain('À trancher');
  });

  it('« Créer une hypothèse » depuis l’offre de la fiche · le formulaire cite l’offre, rien d’écrit avant « Ranger » · puis provenance « Offre »', async () => {
    comme('uo', MARQUE.A());
    await monter((await FicheTestSpatial({ params: Promise.resolve({ id: S.lea[2]! }), searchParams: Promise.resolve({}) })) as ReactElement);
    const avant = await traces();
    await cliquer(document.querySelector(`[data-gestes-offre="${O.remise}"] [data-geste-offre="hypothese"] button`), 'créer une hypothèse');
    const f = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    expect(f, 'le formulaire n’est pas ouvert').toBeTruthy();
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="si"]')!.value).toBe('on met l’offre « Remise de bienvenue » dans nos prochaines créas');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="parceQue"]')!.value).toBe('ses variantes gagnent nettement plus souvent que le reste de la marque (6 sur 6 contre 2 sur 12)');
    expect(f.textContent, 'le formulaire dit encore « À la main »').toContain('provenance « Offre »');
    expect(await traces(), 'ouvrir le formulaire a écrit').toEqual(avant);
    await saisir(f.querySelector('textarea[name="alors"]'), 'le taux de conversion monte');
    await ranger(f, avant.ads);
    expect((await traces()).ads - avant.ads, 'l’hypothèse n’est pas créée').toBe(1);
    const neuve = await derniere();
    expect(lireOrigineHypothese(neuve.sourceRef), 'l’hypothèse née de l’offre n’a pas la provenance « Offre »').toEqual({ type: 'offre', offre: 'Remise de bienvenue', offreId: O.remise });
    expect(neuve.testedVariable).toBe('offer');
    await mesurer(neuve.id, 'winner');
  });
});

/* ───────────────────────────── « Quelle offre » d'un lot ───────────────────────────── */

describe('« Quelle offre » d’un lot · les gestes quand l’offre se détache, le silence dit sinon', () => {
  it('le lot de Léa · « Itérer sur cette offre » ouvre Itérer sur une gagnante du lot, « Créer une hypothèse » proposé · rien d’écrit', async () => {
    comme('uo', MARQUE.A());
    const avant = await traces();
    const d = await pageLot(S.LL);
    const bloc = d.querySelector('[aria-label="Quelle offre · les offres du lot"]')!;
    const g = bloc.querySelector(`[data-groupe-offre="${O.remise}"] [data-gestes-offre="${O.remise}"]`);
    expect(g, 'aucun geste sur une offre du lot qui se détache').toBeTruthy();
    const it = g!.querySelector<HTMLAnchorElement>('[data-geste-offre="iterer"]')!;
    expect(it.tagName).toBe('A');
    expect(S.lea, 'Itérer ne part pas d’une gagnante du lot').toContain(params(it.getAttribute('href')!).iter);
    expect(g!.querySelector('[data-geste-offre="hypothese"] button')!.textContent).toBe('Créer une hypothèse');
    expect(bloc.querySelector('[data-gestes-offre-silence]'), 'le silence est dit alors que l’offre se détache').toBeNull();
    expect(await traces(), 'ouvrir le lot a écrit').toEqual(avant);
  });

  it('le lot de Sam · la garantie ne se détache pas · aucun geste, et c’est dit', async () => {
    comme('uo', MARQUE.A());
    const bloc = (await pageLot(S.LS)).querySelector('[aria-label="Quelle offre · les offres du lot"]')!;
    expect(bloc.querySelector('[data-gestes-offre]'), 'un geste pour une offre qui ne se détache pas').toBeNull();
    expect(bloc.querySelector('[data-gestes-offre-silence]')?.textContent, 'le silence des gestes de l’offre du lot n’est pas dit').toBe(NOTE_GESTES_OFFRE_SILENCE);
  });

  it('au clic · « Créer une hypothèse » range l’hypothèse avec la provenance « Offre » · « Itérer sur cette offre » mène à l’itération créée', async () => {
    comme('uo', MARQUE.A());
    await monter((await LotSpatial({ params: Promise.resolve({ id: S.LL }) })) as ReactElement);
    const avant = await traces();
    const g = document.querySelector(`[data-gestes-offre="${O.remise}"]`)!;
    const href = g.querySelector('[data-geste-offre="iterer"]')!.getAttribute('href')!;
    await cliquer(g.querySelector('[data-geste-offre="hypothese"] button'), 'créer une hypothèse');
    const f = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    expect(f.textContent).toContain('Source · la lecture par offre du lot #5.');
    expect(await traces(), 'ouvrir le formulaire a écrit').toEqual(avant);
    await saisir(f.querySelector('textarea[name="alors"]'), 'le panier moyen monte');
    await ranger(f, avant.ads);
    const neuve = await derniere();
    expect(lireOrigineHypothese(neuve.sourceRef)).toMatchObject({ type: 'offre', offreId: O.remise });
    await mesurer(neuve.id, 'loser');

    // Itérer · l'écran EXISTANT, monté depuis le lien du geste · rien avant « Créer l'itération », puis l'itération.
    const parent = params(href).iter!;
    const deja = await traces();
    await monter(await IterationSpatiale({ searchParams: Promise.resolve(params(href)) }));
    expect(await traces(), 'ouvrir Itérer a écrit').toEqual(deja);
    await cliquer(document.querySelector(`[data-itad="${parent}"]`), 'la pub de départ');
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    if (!document.querySelector('[data-itvar][aria-checked="true"]')) await cliquer(document.querySelector('[data-itvar]:not([aria-disabled])'), 'une variable admise');
    await saisir(document.querySelector('[data-champ="valeur"]'), 'Une valeur nouvelle et précise');
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
    const e = await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, parent));
    expect(e, 'au clic, aucune itération créée depuis la gagnante de l’offre').toHaveLength(1);
    const apres = await traces();
    expect([apres.ads - deja.ads, apres.aretes - deja.aretes, apres.depense, apres.credits]).toEqual([1, 1, deja.depense, deja.credits]);
  });
});

/* ───────────────────────────── la provenance « Offre » ───────────────────────────── */

describe('provenance « Offre » · posée seulement après relecture, lue dans le bilan', () => {
  it('l’action appelée en direct · une offre d’une autre marque, inconnue, mal formée · AUCUNE provenance posée · le témoin relu, oui', async () => {
    comme('uo', MARQUE.A());
    const saisie = { si: 'on met l’offre dans nos prochaines créas', variable: 'offer' };
    const cas: Array<[string, unknown]> = [
      ['offre d’une autre marque', O.secrete], ['offre inconnue', '0a0a0a0a-0000-4000-8000-000000000000'], ['mal formée', 'Remise de bienvenue'],
    ];
    for (const [nom, offreId] of cas) {
      const r = await creerHypotheseAction({ source: { type: 'offre', offreId: offreId as string }, saisie });
      expect(r.ok, `${nom} · ${r.error ?? ''}`).toBe(true);
      expect(r.provenance, `${nom} · une provenance offre posée`).toBe('libre');
      const [ad] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, r.adId!));
      expect(lireOrigineHypothese(ad!.s), `${nom} · une provenance offre posée`).toEqual({ type: 'libre' });
      expect(JSON.stringify(ad!.s), `${nom} · l’adresse est recopiée`).not.toContain(String(offreId));
      await mesurer(r.adId!, 'loser');
    }
    const ok = await creerHypotheseAction({ source: { type: 'offre', offreId: O.garantie }, saisie });
    expect(ok.provenance, 'le témoin relu n’a pas la provenance offre').toBe('offre');
  });

  it('le bilan lit « Offre » à part · les deux hypothèses nées d’une offre, pas les adresses forgées · la carte dit « Offre · … » avec son lien', async () => {
    comme('uo', MARQUE.A());
    const d = await pageHypotheses();
    const b = d.querySelector('[aria-label="D’où viennent les hypothèses qui gagnent"]')!;
    const g = b.querySelector('[data-groupe-provenance="offre"]')!;
    expect(g, 'la provenance « Offre » n’est pas lue dans le bilan').toBeTruthy();
    expect(g.textContent).toContain('Offre');
    expect(g.textContent, 'les deux hypothèses nées d’une offre, mesurées').toContain('2 variantes tranchées');
    expect(b.querySelector('[data-groupe-provenance="libre"]')!.textContent, 'les adresses forgées comptent « À la main »').toContain('3 variantes tranchées');
    expect(b.querySelector('[data-taux-general]')!.textContent).toContain('Offre');
    expect(b.querySelector('[data-note-offre]')!.textContent).toBe(NOTE_OFFRE_PROVENANCE);
    expect(b.textContent).toContain('9 provenances, 6 lues au plus à la fois, silence au-delà');
    const pro = [...d.querySelectorAll('[data-provenance-hypothese]')].find((x) => x.textContent?.includes('Offre · Remise de bienvenue'));
    expect(pro, 'la carte ne dit pas la provenance « Offre »').toBeTruthy();
    expect(pro!.querySelector('a')!.getAttribute('href')).toBe(`/brands/${I.bA}/offre`);
  });
});

/* ───────────────────────────── autre marque, autre espace ───────────────────────────── */

describe('autre marque, autre espace · refus sans fuite, rien d’écrit', () => {
  it('A2 active · la fiche d’un test de A1 est introuvable, sans rien dire de son persona ni de son offre · le lot de A1, introuvable', async () => {
    comme('uo', MARQUE.A2());
    const avant = await traces();
    const d = await ficheTest(S.lea[2]!);
    expect(d.textContent).toContain('Ce test est introuvable dans Adsmap pour Autre');
    expect(d.textContent, 'la fiche laisse fuir A1').not.toMatch(/Léa|Remise de bienvenue|Pour Léa/);
    expect(d.querySelector('[aria-label="Pour qui · quelle offre · ce test"]')).toBeNull();
    await expect(pageLot(S.LL)).rejects.toThrow('NOT_FOUND');
    expect(await traces()).toEqual(avant);
  });

  it('A2 active · la fiche d’un test de A2 lit SES persona et offre, rien de A1 ne fuit', async () => {
    comme('uo', MARQUE.A2());
    const d = await ficheTest(S.zed[0]!);
    expect(cible(d, 'persona').getAttribute('data-cible-id')).toBe(I.zed);
    expect(cible(d, 'offre').getAttribute('data-cible-id')).toBe(O.secrete);
    expect(d.textContent).not.toMatch(/Léa|Remise de bienvenue|Livraison offerte/);
    expect(d.innerHTML).not.toContain(S.lea[0]!);
  });

  it('un autre espace · introuvable · une hypothèse depuis une offre de A1 · aucune provenance posée chez lui', async () => {
    comme('ub', MARQUE.B());
    const d = await ficheTest(S.lea[2]!);
    expect(d.textContent).toContain('Ce test est introuvable dans Adsmap pour Ailleurs');
    expect(d.textContent).not.toMatch(/Léa|Remise de bienvenue/);
    const r = await creerHypotheseAction({ source: { type: 'offre', offreId: O.remise }, saisie: { si: 'on teste' } });
    expect(r.provenance, 'une offre d’un autre espace pose sa provenance').toBe('libre');
    const [ad] = await db.select({ s: schema.ads.sourceRef, ws: schema.ads.workspaceId }).from(schema.ads).where(eq(schema.ads.id, r.adId!));
    expect([ad!.ws, JSON.stringify(ad!.s).includes('Remise')]).toEqual([I.wsB, false]);
  });
});
