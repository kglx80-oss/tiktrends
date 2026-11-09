// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * « Dans les tests » des fiches persona et offre, et la provenance « Jarvis » ·
 * base RÉELLE (pglite, migrations du dépôt), VRAIES actions, VRAIES pages
 * rendues et montées · on lit le DOM et ce qui est écrit, jamais la présence
 * d'un appel.
 *
 *  · fiche persona et fiche offre · leurs « Lots de test » (liens vers la fiche
 *    de chaque lot), leur lecture contre le reste de la marque ;
 *  · les gestes « Itérer » et « Créer une hypothèse » SEULEMENT quand le groupe
 *    se détache · rien n'est écrit avant le clic ;
 *  · une itération créée depuis un geste Jarvis porte la provenance « Jarvis »,
 *    relue à part dans « D'où viennent les hypothèses qui gagnent » · la phrase
 *    qui la rangeait dans les itérations a disparu ;
 *  · une adresse forgée (réponse d'une autre marque, d'une autre personne,
 *    contexte d'ailleurs, pub hors du contexte) · aucune provenance posée ;
 *  · une autre marque, un autre espace · refus sans fuite.
 * 0 $ · aucun modèle, aucune dépense, aucun crédit.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/brands', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../lib/spend-guard', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/spend-guard')>()), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { and, desc } from 'drizzle-orm';
import {
  NOTE_JARVIS_PROVENANCE, REFUS_GESTE_JARVIS, variablesDuPlan, lienIterationJarvis, lienIterationVariable, lienLotSpatial, lireOrigineHypothese, lireProvenanceJarvis, noteGestesSilenceFiche,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { avecSpatial } from './spatial/fournisseur';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import PersonasSpatiale from '../app/(spatial)/sp/brands/[id]/personas/page';
import OffreSpatiale from '../app/(spatial)/sp/brands/[id]/offre/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const P = { lea: '', max: '', sam: '', zed: '' };
const O = { remise: '', livraison: '', garantie: '', essai: '', secrete: '' };
const S = { LL: '', LR: '', LS: '', A2: '', LJ: '', lea: [] as string[], max: [] as string[], zed: [] as string[], msg: '', msgA2: '', msgAutre: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
const JOUR = 86_400_000;

/* ───────────────────────────── semis ───────────────────────────── */

async function lot(brandId: string, number: number, goal: string, ws = ids.wsA) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * JOUR) }).returning({ id: schema.batches.id });
  return b!.id;
}
const agg = (v: 'winner' | 'loser') => ({ spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6, reason: v === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' });
async function verdict(adId: string, v: 'winner' | 'loser', statut: 'validated' | 'computed', ws = ids.wsA) {
  await db.insert(schema.verdicts).values({ adId, workspaceId: ws, computed: v, validated: statut === 'validated' ? v : null, status: statut, comparable: true, metricsAgg: agg(v) });
}
/** Une ad de la carte (persona → désir → angle → concept → ad), diffusant une offre, rangée dans un lot, avec son verdict arbitré. */
async function adCarte(personaId: string, offerId: string | null, batchId: string, code: string, v: 'winner' | 'loser', ws = ids.wsA) {
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId, label: `Désir ${code}` }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: `Angle ${code}`, mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: `Concept ${code}` }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId: c!.id, batchId, variantCode: code, status: 'done', testedVariable: 'hook', offerId, hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la preuve rassure.` }).returning({ id: schema.ads.id });
  await verdict(ad!.id, v, 'validated', ws);
  return ad!.id;
}
async function offre(brandId: string, label: string, kind: string) {
  const [o] = await db.insert(schema.offers).values({ workspaceId: ids.wsA, brandId, label, kind, conditions: 'conditions' }).returning({ id: schema.offers.id });
  return o!.id;
}
async function message(brandId: string, user: string, contenu: string) {
  const [m] = await db.insert(schema.jarvisMessages).values({ workspaceId: ids.wsA, brandId, userId: user, role: 'assistant', content: contenu }).returning({ id: schema.jarvisMessages.id });
  return m!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;
  const [lea, max, sam, zed] = await db.insert(schema.personas).values([
    { brandId: ids.brandA1, name: 'Léa, 34 ans', status: 'validated', rank: 1 }, { brandId: ids.brandA1, name: 'Max', status: 'validated', rank: 2 },
    { brandId: ids.brandA1, name: 'Sam', status: 'validated', rank: 3 }, { brandId: ids.brandA2, name: 'Zed secret', status: 'validated', rank: 1 },
  ]).returning({ id: schema.personas.id });
  Object.assign(P, { lea: lea!.id, max: max!.id, sam: sam!.id, zed: zed!.id });
  O.remise = await offre(ids.brandA1, 'Remise de bienvenue', 'remise');
  O.livraison = await offre(ids.brandA1, 'Livraison offerte', 'livraison');
  O.garantie = await offre(ids.brandA1, 'Garantie 30 jours', 'garantie');
  O.essai = await offre(ids.brandA1, 'Essai gratuit', 'essai');
  O.secrete = await offre(ids.brandA2, 'Offre secrète A2', 'remise');

  // LR · lot #1 · Max, 1 gagnante sur 10, sous « Livraison offerte » · la référence.
  S.LR = await lot(ids.brandA1, 1, 'Référence livraison');
  for (let i = 0; i < 10; i++) S.max.push(await adCarte(P.max, O.livraison, S.LR, `R${i}`, i === 0 ? 'winner' : 'loser'));
  // LS · lot #4 · Sam, deux variantes sous « Garantie 30 jours » · sous l'effectif.
  S.LS = await lot(ids.brandA1, 4, 'Deux variantes garantie');
  await adCarte(P.sam, O.garantie, S.LS, 'S1', 'winner');
  await adCarte(P.sam, O.garantie, S.LS, 'S2', 'loser');
  // LL · lot #5 · Léa, 6 gagnantes sur 6, sous « Remise de bienvenue » · elle et l'offre se détachent.
  S.LL = await lot(ids.brandA1, 5, 'Pour Léa');
  for (let i = 0; i < 6; i++) S.lea.push(await adCarte(P.lea, O.remise, S.LL, `V${i + 1}`, 'winner'));
  // A2 · un lot et une offre secrets, jamais visibles depuis A1.
  S.A2 = await lot(ids.brandA2, 9, 'SECRET_LOT_A2');
  for (let i = 0; i < 4; i++) S.zed.push(await adCarte(P.zed, O.secrete, S.A2, `Z${i}`, 'winner'));
  // LJ · un lot où les itérations créées plus bas sont mesurées (le geste « Ranger dans un lot » écrit `batch_id`).
  S.LJ = await lot(ids.brandA1, 7, 'Itérations mesurées');

  // Les réponses de Jarvis · la mienne (A1), une d'une autre marque (A2), une d'une autre personne (A1, ur).
  S.msg = await message(ids.brandA1, ids.ua, 'La V1 gagne nettement · décline-la.');
  S.msgA2 = await message(ids.brandA2, ids.ua, 'La V1 gagne nettement · décline-la.');
  S.msgAutre = await message(ids.brandA1, ids.ur, 'La V1 gagne nettement · décline-la.');
  // Préalable · les gagnantes de Léa sont au plan d'itération de la marque.
  const plan = await iterationPlanAction();
  if (!S.lea.every((id) => plan.view?.rows.some((r) => r.adId === id))) throw new Error('préalable · les gagnantes de Léa ne sont pas au plan d’itération');
});

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const pagePersonas = async (id = ids.brandA1) => dom(renderToStaticMarkup(avecSpatial(await PersonasSpatiale({ params: Promise.resolve({ id }) }))));
const pageOffre = async (id = ids.brandA1) => dom(renderToStaticMarkup(avecSpatial(await OffreSpatiale({ params: Promise.resolve({ id }) }))));
const pageHypotheses = async () => dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial())));
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
const bilan = (d: ParentNode) => d.querySelector<HTMLElement>('[aria-label="D’où viennent les hypothèses qui gagnent"]')!;
const hrefs = (el: ParentNode | null | undefined, sel: string) => [...(el?.querySelectorAll(sel) ?? [])].map((a) => a.getAttribute('href'));

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
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
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
/** Ranger le formulaire d'hypothèse ouvert, puis attendre l'écriture. */
async function ranger(f: HTMLFormElement, avant: number) {
  await cliquer([...f.querySelectorAll('button')].find((b) => b.textContent === 'Ranger dans « À formuler »'), 'ranger');
  for (let i = 0; i < 50 && (await traces()).ads === avant; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}
/** L'écran Itérer, monté depuis une adresse · la pub choisie, une variable admise, une valeur, puis « Créer l'itération ». */
async function itererDepuis(href: string, parent: string) {
  const deja = new Set((await db.select({ c: schema.iterationEdges.childAdId }).from(schema.iterationEdges)).map((x) => x.c));
  await monter(await IterationSpatiale({ searchParams: Promise.resolve(params(href)) }));
  const note = document.querySelector('[data-note-jarvis]')?.textContent ?? null;
  await cliquer(document.querySelector(`[data-itad="${parent}"]`), 'la pub de départ');
  await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
  if (!document.querySelector('[data-itvar][aria-checked="true"]')) await cliquer(document.querySelector('[data-itvar]:not([aria-disabled])'), 'une variable admise');
  await saisir(document.querySelector('[data-champ="valeur"]'), 'Une valeur nouvelle et précise');
  await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
  const e = (await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, parent))).filter((x) => !deja.has(x.childAdId));
  expect(e, 'au clic, une itération est créée depuis la pub de départ').toHaveLength(1);
  const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, e[0]!.childAdId));
  return { enfant: enfant!, note };
}
/** La variante mesurée · rangée dans le lot des itérations avec son verdict (le cycle de test existant). */
async function mesurer(adId: string, v: 'winner' | 'loser') {
  await db.update(schema.ads).set({ batchId: S.LJ, status: 'done' }).where(eq(schema.ads.id, adId));
  await verdict(adId, v, 'computed');
}

/* ───────────────────────────── la fiche persona ───────────────────────────── */

describe('fiche persona · « Dans les tests » · ses lots, sa lecture, et les gestes seulement quand il se détache', () => {
  it('Léa se détache · ses lots en liens, sa lecture, « Itérer sur ce persona » ouvre Itérer sur SA gagnante · rien d’écrit', async () => {
    const avant = await traces();
    const d = await pagePersonas();
    const c = d.querySelector('[data-lecture-persona]')!.parentElement!;
    expect(c.querySelector('[data-lecture-persona]')!.getAttribute('data-lecture-persona')).toBe('au_dessus');
    expect(c.querySelector('[data-tests-persona]')!.textContent).toBe('6 tests · 1 lot');
    expect(c.querySelector('[data-lecture-persona]')!.textContent).toMatch(/^6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 2 sur 12/);
    expect(hrefs(c.querySelector('[data-lots-de-test="persona"]'), 'a'), 'les lots de test de Léa').toEqual([lienLotSpatial(S.LL)]);
    expect(c.querySelector('[data-lots-de-test="persona"] a')!.textContent).toBe('Lot #5 · Pour Léa · 6 tests');
    const it = c.querySelector<HTMLAnchorElement>(`[data-gestes-persona="${P.lea}"] [data-geste-persona-lot="iterer"]`)!;
    expect(it?.tagName, 'Itérer ouvert est un lien').toBe('A');
    expect(it.textContent).toBe('Itérer sur ce persona');
    expect(S.lea, 'Itérer part d’une gagnante de Léa').toContain(params(it.getAttribute('href')!).iter);
    expect(it.getAttribute('href')).toBe(lienIterationVariable({ adId: params(it.getAttribute('href')!).iter! }));
    expect(c.querySelector('[data-gestes-silence]'), 'le silence dit alors que Léa se détache').toBeNull();
    expect(d.textContent, 'la fiche de A1 laisse fuir A2').not.toMatch(/SECRET_LOT_A2|Zed secret/);
    expect(await traces(), 'ouvrir la fiche a écrit').toEqual(avant);
  });

  it('« Créer une hypothèse » ouvre le formulaire pré-rempli (Léa, ses verdicts) · rien d’écrit avant « Ranger »', async () => {
    await monter((await PersonasSpatiale({ params: Promise.resolve({ id: ids.brandA1 }) })) as ReactElement);
    const avant = await traces();
    await cliquer(document.querySelector(`[data-gestes-persona="${P.lea}"] [data-geste-persona-lot="hypothese"] button`), 'créer une hypothèse');
    const f = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    expect(f, 'le formulaire n’est pas ouvert').toBeTruthy();
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="si"]')!.value).toBe('on décline nos prochaines créas pour Léa');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="parceQue"]')!.value).toMatch(/^ses variantes gagnent nettement plus souvent que le reste de la marque \(6 sur 6 contre 2 sur 12\)$/);
    expect(f.textContent).toContain('Source · la lecture par persona de la marque.');
    expect(await traces(), 'ouvrir le formulaire a écrit').toEqual(avant);
    await saisir(f.querySelector('textarea[name="alors"]'), 'le coût par achat baisse sur ce segment');
    await ranger(f, avant.ads);
    expect((await traces()).ads - avant.ads, 'l’hypothèse n’est pas créée').toBe(1);
    const [neuve] = await db.select().from(schema.ads).where(and(eq(schema.ads.workspaceId, ids.wsA), eq(schema.ads.status, 'draft'))).orderBy(desc(schema.ads.createdAt)).limit(1);
    expect(lireOrigineHypothese(neuve!.sourceRef)).toMatchObject({ type: 'persona', personaId: P.lea });
  });

  it('Sam ne se détache pas (2 verdicts) · ses lots, sa lecture muette, AUCUN geste, et c’est dit', async () => {
    await monter((await PersonasSpatiale({ params: Promise.resolve({ id: ids.brandA1 }) })) as ReactElement);
    await cliquer([...document.querySelectorAll('[aria-label="Persona"] button')].find((b) => b.textContent?.includes('Sam')), 'la puce de Sam');
    expect(document.querySelector('[data-lecture-persona]')!.getAttribute('data-lecture-persona')).toBe('effectif');
    expect(hrefs(document.querySelector('[data-lots-de-test="persona"]'), 'a')).toEqual([lienLotSpatial(S.LS)]);
    expect(document.querySelector('[data-gestes-persona]'), 'un geste pour un persona qui ne se détache pas').toBeNull();
    expect(document.querySelector('[data-gestes-silence="persona"]')?.textContent, 'le silence des gestes du persona n’est pas dit').toBe(noteGestesSilenceFiche('Ce persona'));
  });
});

/* ───────────────────────────── la fiche offre ───────────────────────────── */

describe('fiche offre · « Dans les tests » · chaque offre, ses lots, sa lecture, ses gestes seulement si elle se détache', () => {
  it('chaque offre lue · « Remise » au-dessus avec ses gestes, « Livraison » en dessous, « Garantie » muette et dite, « Essai » sans test · rien d’écrit', async () => {
    const avant = await traces();
    const d = await pageOffre();
    const bloc = (id: string) => d.querySelector(`[data-tests-de-offre="${id}"]`)!;
    expect(bloc(O.remise).querySelector('[data-lecture-offre]')!.getAttribute('data-lecture-offre')).toBe('au_dessus');
    expect(bloc(O.remise).querySelector('[data-tests-offre]')!.textContent).toBe('6 tests · 1 lot');
    expect(hrefs(bloc(O.remise).querySelector('[data-lots-de-test="offre"]'), 'a')).toEqual([lienLotSpatial(S.LL)]);
    const it = bloc(O.remise).querySelector(`[data-gestes-offre="${O.remise}"] [data-geste-offre="iterer"]`)!;
    expect(it?.tagName, 'Itérer sur cette offre n’est pas un lien ouvert').toBe('A');
    expect(it.textContent).toBe('Itérer sur cette offre');
    expect(S.lea).toContain(params(it.getAttribute('href')!).iter);

    expect(bloc(O.livraison).querySelector('[data-lecture-offre]')!.getAttribute('data-lecture-offre')).toBe('en_dessous');
    expect(hrefs(bloc(O.livraison).querySelector(`[data-gestes-offre="${O.livraison}"]`), '[data-geste-offre="iterer"]'), 'Itérer part de la seule gagnante de la livraison').toEqual([lienIterationVariable({ adId: S.max[0]! })]);

    expect(bloc(O.garantie).querySelector('[data-lecture-offre]')!.getAttribute('data-lecture-offre')).toBe('effectif');
    expect(bloc(O.garantie).querySelector('[data-gestes-offre]'), 'un geste pour une offre qui ne se détache pas').toBeNull();
    expect(bloc(O.garantie).querySelector('[data-gestes-silence="offre"]')?.textContent, 'le silence des gestes de l’offre n’est pas dit').toBe(noteGestesSilenceFiche('Cette offre'));
    expect(hrefs(bloc(O.garantie).querySelector('[data-lots-de-test="offre"]'), 'a')).toEqual([lienLotSpatial(S.LS)]);

    expect(bloc(O.essai).querySelector('[data-tests-offre]')!.textContent).toBe('Aucun test ne diffuse cette offre');
    expect(bloc(O.essai).querySelector('[data-lecture-offre]')!.textContent).toBe('Aucune variante tranchée au protocole ne cible cette offre · rien à lire.');
    expect(bloc(O.essai).querySelector('[data-lots-de-test], [data-gestes-offre], [data-gestes-silence]')).toBeNull();
    // La lecture d'ensemble et la règle, dites une fois sous la grille.
    expect(d.querySelector('section[aria-label="Offres de la marque"]')!.textContent).toMatch(/Sur toute la marque · Remise de bienvenue au-dessus · Livraison offerte en dessous du reste de la marque, intervalles disjoints au niveau 0,95\. Règle · au moins 4 variantes tranchées au protocole pour une offre/);
    expect(d.textContent).not.toMatch(/Offre secrète A2|SECRET_LOT_A2/);
    expect(await traces(), 'ouvrir la fiche a écrit').toEqual(avant);
  });

  it('« Créer une hypothèse » depuis l’offre · le formulaire cite l’offre et ses verdicts, variable « offre » · rien d’écrit avant « Ranger »', async () => {
    await monter((await OffreSpatiale({ params: Promise.resolve({ id: ids.brandA1 }) })) as ReactElement);
    const avant = await traces();
    await cliquer(document.querySelector(`[data-gestes-offre="${O.remise}"] [data-geste-offre="hypothese"] button`), 'créer une hypothèse');
    const f = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    expect(f, 'le formulaire n’est pas ouvert').toBeTruthy();
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="si"]')!.value, 'le départ ne cite pas l’offre').toBe('on met l’offre « Remise de bienvenue » dans nos prochaines créas');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="parceQue"]')!.value).toBe('ses variantes gagnent nettement plus souvent que le reste de la marque (6 sur 6 contre 2 sur 12)');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="alors"]')!.value, 'un résultat attendu inventé').toBe('');
    expect(f.querySelector<HTMLSelectElement>('select[name="variable"]')!.value).toBe('offer');
    expect(f.textContent).toContain('provenance « À la main »');
    expect(await traces(), 'ouvrir le formulaire a écrit').toEqual(avant);
    await saisir(f.querySelector('textarea[name="alors"]'), 'le taux de conversion monte');
    await ranger(f, avant.ads);
    expect((await traces()).ads - avant.ads, 'l’hypothèse n’est pas créée').toBe(1);
    const [neuve] = await db.select().from(schema.ads).where(and(eq(schema.ads.workspaceId, ids.wsA), eq(schema.ads.status, 'draft'))).orderBy(desc(schema.ads.createdAt)).limit(1);
    expect([lireOrigineHypothese(neuve!.sourceRef)?.type, neuve!.testedVariable], 'l’hypothèse née de l’offre n’est pas « à la main », variable offre').toEqual(['libre', 'offer']);
    expect(neuve!.hypothesis).toMatch(/^Si on met l’offre « Remise de bienvenue » dans nos prochaines créas, alors le taux de conversion monte/);
  });
});

/* ───────────────────────────── la provenance « Jarvis » ───────────────────────────── */

describe('provenance « Jarvis » · posée seulement après relecture, lue à part dans le bilan', () => {
  it('« Créer l’itération » depuis MA réponse, contexte du lot de Léa · l’ad porte la provenance Jarvis', async () => {
    const avant = await traces();
    const { enfant, note } = await itererDepuis(lienIterationJarvis({ type: 'lot', id: S.LL }, S.msg)!, S.lea[0]!);
    expect(note, 'la réponse n’a pas été relue').not.toBe(REFUS_GESTE_JARVIS);
    expect(lireProvenanceJarvis(enfant.sourceRef), 'la provenance Jarvis n’est pas posée').toEqual({ reponseId: S.msg, contexte: { type: 'lot', id: S.LL } });
    expect(enfant.adType).toBe('iteration');
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.aretes - avant.aretes, apres.depense, apres.credits]).toEqual([1, 1, avant.depense, avant.credits]);
    await mesurer(enfant.id, 'winner');
  });

  it('adresse forgée · une réponse d’une autre marque · l’écran refuse, l’itération naît sans provenance', async () => {
    const { enfant, note } = await itererDepuis(lienIterationJarvis({ type: 'lot', id: S.LL }, S.msgA2)!, S.lea[1]!);
    expect(note).toBe(REFUS_GESTE_JARVIS);
    expect(lireProvenanceJarvis(enfant.sourceRef), 'une provenance Jarvis posée depuis une réponse d’une autre marque').toBeNull();
    await mesurer(enfant.id, 'loser');
  });

  it('l’action appelée en direct avec une provenance forgée · rien n’est posé (autre personne, contexte d’ailleurs, pub hors du contexte, mal formée) · le témoin relu, oui', async () => {
    // Une gagnante déclinée quitte le plan · chaque cas part d'une gagnante encore au plan, avec une variable qu'elle admet.
    const variables = variablesDuPlan((await iterationPlanAction()).view!.rows);
    const admise = (adId: string) => variables[adId]!.options.find((o) => o.admise)!.variable;
    const creer = (parentAdId: string, jarvis: unknown) => creerIterationChoisieAction({ parentAdId, variable: admise(parentAdId), valeur: 'Une valeur nouvelle', hypothese: 'Si on change cette variable, alors le coût baisse, parce que la preuve rassure.', jarvis });
    const cas: Array<[string, string, unknown]> = [
      ['réponse d’une autre personne', S.lea[2]!, { reponseId: S.msgAutre, contexte: { type: 'lot', id: S.LL } }],
      ['lot d’une autre marque', S.lea[3]!, { reponseId: S.msg, contexte: { type: 'lot', id: S.A2 } }],
      ['pub hors du contexte', S.max[0]!, { reponseId: S.msg, contexte: { type: 'lot', id: S.LL } }],
      ['mal formée', S.lea[4]!, { reponseId: 'La V1 gagne', contexte: { type: 'lot', id: S.LL } }],
    ];
    for (const [nom, parentAdId, jarvis] of cas) {
      const r = await creer(parentAdId, jarvis);
      expect(r.ok, `${nom} · ${!r.ok ? r.error : ''}`).toBe(true);
      if (!r.ok) continue;
      expect(r.provenance ?? null, nom).toBeNull();
      const [ad] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, r.adId));
      expect(lireProvenanceJarvis(ad!.s), `${nom} · une provenance Jarvis posée`).toBeNull();
      await mesurer(r.adId, 'loser');
    }
    // Le témoin · la même action, ma réponse et le lot de Léa relus · posée.
    const ok = await creer(S.lea[5]!, { reponseId: S.msg, contexte: { type: 'lot', id: S.LL } });
    expect(ok.ok && ok.provenance, 'le témoin relu n’a pas de provenance').toBe('jarvis');
    if (ok.ok) await mesurer(ok.adId, 'loser');
  });

  it('le bilan lit « Geste de Jarvis » à part · l’itération de Jarvis n’est plus comptée dans « Itération d’une gagnante » · la phrase a disparu', async () => {
    const b = bilan(await pageHypotheses());
    const j = b.querySelector('[data-groupe-provenance="jarvis"]')!;
    expect(j, 'la provenance Jarvis n’est pas lue dans le bilan').toBeTruthy();
    expect(j.textContent).toContain('Geste de Jarvis');
    expect(j.textContent, 'les deux itérations relues · l’écran et le témoin').toContain('2 variantes tranchées');
    const it = b.querySelector('[data-groupe-provenance="iteration"]')!;
    expect(it.textContent, 'les itérations sans provenance relue (adresses forgées)').toContain('sur 5 variantes tranchées');
    expect(b.querySelector('[data-taux-general]')!.textContent).toContain('Geste de Jarvis');
    expect(b.textContent, 'la phrase qui range Jarvis dans les itérations est encore à l’écran').not.toContain('Jarvis ne garde pas encore de provenance');
    expect(b.textContent).toContain(NOTE_JARVIS_PROVENANCE);
  });
});

/* ───────────────────────────── autre marque, autre espace ───────────────────────────── */

describe('autre marque, autre espace · refus sans fuite, rien d’écrit', () => {
  it('A2 active · les fiches de A1 ferment « Dans les tests » avec leur raison · ni lots ni gestes', async () => {
    h.marque = ids.brandA2;
    const avant = await traces();
    const p = await pagePersonas(ids.brandA1);
    expect(p.textContent, 'la fiche persona d’une marque inactive lit ses tests').toContain('Les tests se lisent dans la marque active · ouvre d’abord cette marque');
    expect(p.querySelector('[data-lots-de-test], [data-gestes-persona], [data-lecture-persona]')).toBeNull();
    const o = await pageOffre(ids.brandA1);
    expect(o.querySelector(`[data-tests-de-offre="${O.remise}"]`)!.textContent, 'la fiche offre d’une marque inactive lit ses tests').toContain('Les tests se lisent dans la marque active');
    expect(o.querySelector('[data-lots-de-test], [data-gestes-offre], [data-lecture-offre]')).toBeNull();
    expect(await traces()).toEqual(avant);
  });

  it('A2 active · ses fiches lisent SES tests, rien de A1 ne fuit', async () => {
    h.marque = ids.brandA2;
    const p = await pagePersonas(ids.brandA2);
    expect(hrefs(p.querySelector('[data-lots-de-test="persona"]'), 'a')).toEqual([lienLotSpatial(S.A2)]);
    const o = await pageOffre(ids.brandA2);
    expect(hrefs(o.querySelector(`[data-tests-de-offre="${O.secrete}"] [data-lots-de-test="offre"]`), 'a')).toEqual([lienLotSpatial(S.A2)]);
    for (const d of [p, o]) {
      expect(d.textContent).not.toMatch(/Pour Léa|Remise de bienvenue|Référence livraison/);
      expect(d.innerHTML).not.toContain(S.LL);
    }
  });

  it('une marque d’un autre espace · introuvable · un lecteur client · renvoyé', async () => {
    await expect(pagePersonas(ids.brandB1)).rejects.toThrow('NOT_FOUND');
    await expect(pageOffre(ids.brandB1)).rejects.toThrow('NOT_FOUND');
    h.session = session(ids, 'uv', { plan: 'plus' });
    await expect(pagePersonas(ids.brandA1)).rejects.toThrow(/REDIRECT/);
    await expect(pageOffre(ids.brandA1)).rejects.toThrow(/REDIRECT/);
  });
});
