// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Itérer depuis la gagnante AU CLAVIER et SUR LA CARTE DE LIGNÉE (suite de
 * #1083 et #1085) · base RÉELLE (pglite, migrations du dépôt), VRAIES actions
 * (commenter, créer l'itération, rattacher une création à sa fiche), VRAIES
 * pages (fiche d'un lot, fiche projet en lignée) rendues puis montées · on
 * tape les touches et on lit le DOM et ce qui est écrit.
 *
 *  · lot conclu avec gagnante · T ouvre `?lot=…&gagnante=…`, LE lien du bouton
 *    de la variante que son libellé nomme · l'écran Itérer sur cette variante ·
 *    « Créer l'itération » · `depuisGagnante` ;
 *  · lot pas conclu · T inchangé (`?iter=`) · raccourcis coupés · T inerte ;
 *  · aucun nom accessible en double menant à deux cibles ;
 *  · la carte de lignée · « née de la gagnante Vx » sur le nœud de l'itération
 *    (lot ET fil), rien sur les autres, rien d'une provenance forgée · le geste
 *    de la fiche du lot sur le nœud gagnant · fermé avec sa raison pour une
 *    autre marque active · rien d'écrit à l'affichage ;
 *  · ÉGALITÉ · hors des éléments ajoutés (et de la touche T, déclarée), le
 *    rendu est celui de la capture faite sur main (`fixtures/gagnante-clavier-avant.html`).
 * 0 $ · aucune génération, aucune dépense. Aucune date « à venir » · lots lancés il y a 30 jours.
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
  useRouter: () => ({ refresh() {}, push: (u: string) => h.push?.(u), replace() {}, back() {}, prefetch() {} }),
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
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import {
  LIBELLE_ITERER_GAGNANTE, RACCOURCIS, RAISON_GAGNANTE_AUTRE_MARQUE, gagnantesDeLaLignee, gestesClavierLot, gestesGagnantesLot, lienIterationDepuis, lienIterationVariable,
  lireDepuisGagnante, phraseNeeDeGagnante, variablesDuPlan, type GagnanteDuNoeud, type TestedVariable,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { commenterProjet } from '../app/actions/studios/activite';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { Lot } from '../spatial/vues/resultats/Lot';
import { RaccourcisLot } from '../spatial/vues/resultats/RaccourcisLot';
import { CanvasLibre } from '../spatial/vues/projet/CanvasLibre';
import { AD_GAGNANTE, AD_NEE, AD_PERDANTE, LOT_CONCLU, MODELE_LIGNEE, canevasLignee, propsFicheConclue } from './helpers/gagnante-clavier-vues';
import { ecartsDeNoms, sansNomsAjoutes } from './helpers/noms-accessibles';
import { sessionEquipeTest } from './helpers/face-equipe';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
/** a · gagnante du lot C · b · rattachée à l'itération X née de la gagnante choisie par T · c · le fil (pub pc) · d · rattachée à G, née de la gagnante F du fil. */
type Cle = 'a' | 'b' | 'c' | 'd';
const S = {
  P1: '', assets: {} as Record<Cle, string>, variantes: {} as Record<Cle, string>, pubs: {} as Record<'a' | 'c', string>,
  lots: {} as Record<'R' | 'C' | 'N' | 'Z', { id: string; n: number }>, ads: {} as Record<string, string>,
  fil: '', F: '', G: '', X: '', depart: '',
};
const proprietaire = (o: Partial<SessionTest> = {}): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus', ...o });
const admise: Record<string, TestedVariable> = {};

async function chaine(titre: string, brandId = ids.brandA1) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
let numero = 70;
async function lot(goal: string, brandId = ids.brandA1) {
  numero += 1;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId, number: numero, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return { id: b!.id, n: numero };
}
async function verdict(adId: string, v: 'winner' | 'loser', statut: 'validated' | 'computed' = 'validated') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: statut === 'validated' ? v : null, status: statut, comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
}
async function remplir(concept: string, lotId: string, issues: Array<'winner' | 'loser'>, prefixe: string, statuts: Array<'validated' | 'computed'> = []) {
  for (const [i, v] of issues.entries()) {
    const code = `${prefixe}${i + 1}`;
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: concept, batchId: lotId, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la question retient.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, v, statuts[i] ?? 'validated');
    S.ads[code] = a!.id;
  }
}
async function plan() {
  const p = variablesDuPlan((await iterationPlanAction()).view!.rows);
  for (const k of Object.keys(admise)) delete admise[k];
  for (const [adId, c] of Object.entries(p)) { const o = c.options.find((x) => x.admise); if (o) admise[adId] = o.variable; }
}
/** Rattacher une création à une fiche Adsmap EXISTANTE (la vraie action · la fiche garde sa provenance). */
async function rattacher(cle: Cle, adId: string) {
  const [a] = await db.select({ h: schema.ads.hypothesis, v: schema.ads.testedVariable }).from(schema.ads).where(eq(schema.ads.id, adId));
  const r = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: S.variantes[cle], saisie: saisieTest({ adsmapAdId: adId, hypothese: a!.h, variable: a!.v }) });
  if (!r.ok) throw new Error(`rattacher ${cle} · ${JSON.stringify(r)}`);
  if (r.lien.adsmapAdId !== adId) throw new Error(`rattacher ${cle} · une autre fiche`);
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · quatre créations retenues · a et c testées tout de suite.
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · gagnante au clavier' })).projectId;
  const job = await lancerLot(db, ctxDe(ids, 'ua'), S.P1, KEYFRAMES(4));
  await executer(db, job);
  const sorties = await sortiesDuJob(db, job);
  for (const [i, k] of (['a', 'b', 'c', 'd'] as const).entries()) {
    S.assets[k] = sorties[`keyframe:s${i + 1}`]!;
    const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: S.assets[k] });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    S.variantes[k] = v.variante.id;
  }
  for (const k of ['a', 'c'] as const) {
    const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: S.variantes[k], saisie: saisieTest() });
    if (!l.ok) throw new Error(`rattacher ${l.code}`);
    S.pubs[k] = l.lien.adsmapAdId;
  }
  // c · gagnante arbitrée HORS lot (la pub du fil) · le plan la propose.
  await verdict(S.pubs.c, 'winner');

  // ── Résultats (A1) · une référence (6 sur 12) · C confirmé (C1 à C4 et la pub de a) · N pas conclu (N1 arbitrée, N2 du moteur).
  const ref = await chaine('Crème de référence');
  S.lots.R = await lot('Référence de la marque');
  await remplir(ref, S.lots.R.id, [...Array(6).fill('winner'), ...Array(6).fill('loser')], 'R');
  const concept = await chaine('Crème testée');
  S.lots.C = await lot('Lot confirmé');
  await remplir(concept, S.lots.C.id, ['winner', 'winner', 'winner', 'winner'], 'C');
  await db.update(schema.ads).set({ batchId: S.lots.C.id, status: 'done' }).where(eq(schema.ads.id, S.pubs.a));
  await verdict(S.pubs.a, 'winner');
  S.lots.N = await lot('Lot à conclure');
  await remplir(concept, S.lots.N.id, ['winner', 'loser'], 'N', ['validated', 'computed']);
  // L'autre marque (A2) · une gagnante à elle (Z1) · une provenance qui la nomme est forgée.
  S.lots.Z = await lot('Lot de l’autre marque', ids.brandA2);
  await remplir(await chaine('Crème de l’autre marque', ids.brandA2), S.lots.Z.id, ['winner'], 'Z');
  await plan();

  // ── Le fil de #1083 · un commentaire sur c · F née de lui (vraie action) rejoint C, gagnante · G née de F (provenance du fil + `gagnanteAdId`).
  const texte = 'Il faudrait essayer une autre accroche · piste F.';
  const c = await commenterProjet({ projectId: S.P1, cible: 'creation', cibleId: S.assets.c, texte });
  if (!c.ok) throw new Error(`commenter ${JSON.stringify(c)}`);
  S.fil = c.commentaires.find((x) => x.texte === texte)!.id;
  const f = await creerIterationChoisieAction({ parentAdId: S.pubs.c, variable: admise[S.pubs.c]!, valeur: 'Une accroche douleur', hypothese: 'Si on change l’accroche F, alors le coût par achat baisse, parce que le fil l’a vu.', commentaire: { commentaireId: S.fil, projetId: S.P1 } });
  if (!f.ok) throw new Error(`itérer F ${f.error}`);
  S.F = f.adId;
  await db.update(schema.ads).set({ batchId: S.lots.C.id, status: 'done' }).where(eq(schema.ads.id, S.F));
  await verdict(S.F, 'winner');
  await plan();
  const g = await creerIterationChoisieAction({ parentAdId: S.F, variable: admise[S.F]!, valeur: 'Une suite de F', hypothese: 'Si on change encore l’accroche, alors le coût baisse, parce que F a gagné.', commentaire: { commentaireId: S.fil, projetId: S.P1 } });
  if (!g.ok || g.provenance !== 'commentaire') throw new Error(`itérer G ${JSON.stringify(g)}`);
  S.G = g.adId;
  await rattacher('d', S.G);
  await plan();
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
const toasts: string[] = [];
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; h.push = vi.fn(); toasts.length = 0; document.cookie = 'tt_raccourcis=; path=/; max-age=0'; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el, { ...CTX_TEST, toast: (m) => { toasts.push(m); } })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
}
async function cliquer(el: Element | null, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(el: HTMLInputElement, valeur: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const touche = async (key: string, cible: Element = document.body) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  await act(async () => { cible.dispatchEvent(ev); });
  return ev;
};
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const page = (id: string) => LotSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
const fiche = async (id: string) => dom(renderToStaticMarkup(avecSpatial(await page(id))));
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const lignee = async (noeud?: string) => ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(noeud ? { ...LIGNEE, noeud } : LIGNEE) });
const ligneeRendue = async () => dom(renderToStaticMarkup(avecSpatial(await lignee())));
const rT = () => RACCOURCIS.find((x) => x.id === 'lot-iterer')!;
/** Le texte VISIBLE d'un contrôle · sans la touche dessinée (`kbd`). */
const visible = (el: Element | null) => { if (!el) return null; const c = el.cloneNode(true) as Element; c.querySelectorAll('kbd').forEach((k) => k.remove()); return (c.textContent ?? '').replace(/\s+/g, ' ').trim(); };
/**
 * Aucune exception · les contrôles de ligne (« Fiche », « Montrer sur le canvas », « Ouvrir le test dans Adsmap »…)
 * nomment leur ligne depuis le lot des noms de ligne · la garde commune (`helpers/noms-accessibles`, règle du noyau)
 * refuse deux noms égaux vers deux cibles ET un nom qui ne contient pas le libellé visible.
 */
function doublons(racine: ParentNode) {
  const e = ecartsDeNoms(racine);
  return [...e.doublons, ...e.sansLibelle.map((x) => `nom sans le libellé visible · ${x}`)];
}
/** La ligne d'une variante dans « Les variantes du lot » · par son code. */
const ligneVariante = (d: ParentNode, code: string) => [...d.querySelectorAll('[aria-label="Les variantes du lot"] .ev')].find((x) => x.querySelector('strong')?.textContent?.startsWith(`${code} · `)) ?? null;
const geste = (n: Element | null) => n?.querySelector('[data-geste="iterer-gagnante"]') ?? null;
async function codeDe(adId: string) {
  const [a] = await db.select({ c: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId));
  return a!.c;
}
/** Toutes les lignes que l'affichage pourrait toucher · comparées en entier avant / après. */
async function lignes() {
  const t = async (x: unknown) => (await db.select().from(x as typeof schema.ads)).map((l) => JSON.stringify(l)).sort();
  return {
    ads: await t(schema.ads), verdicts: await t(schema.verdicts), lots: await t(schema.batches), aretes: await t(schema.iterationEdges),
    liens: await t(schema.studioTestLinks), commentaires: await t(schema.studioComments), notes: await t(schema.studioLineageNotes), notifications: await t(schema.notifications),
    audit: await t(schema.studioAuditEvents), apprentissages: await t(schema.learnings), depense: await t(schema.aiSpend), credits: await t(schema.creditLedger), jobs: await t(schema.studioJobs),
  };
}
/** Un geste fermé · un bouton aria-disabled, ce qu'il cite (`aria-describedby`) écrit à côté. */
function ferme(d: ParentNode, b: Element | null) {
  const x = b as HTMLButtonElement | null;
  const cites = (x?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((i) => d.querySelector(`#${CSS.escape(i)}`)?.textContent ?? null);
  return [x?.tagName ?? null, x?.getAttribute('aria-disabled') ?? null, x?.textContent ?? null, ...cites];
}
/** Ce qu'un geste montre · un lien (son adresse) ou un bouton fermé (sa raison, et le signal d'une suite en test). */
const etatGeste = (d: ParentNode, b: Element | null) => (b?.tagName === 'A' ? ['A', b.getAttribute('href'), b.textContent] : ferme(d, b));
const T = () => document.querySelector('[data-geste-clavier="lot-iterer"]');
const carteNoeud = (d: ParentNode, cle: Cle) => d.querySelector(`[data-carte="resultat:${S.variantes[cle]}"]`);
const listeNoeud = (d: ParentNode, cle: Cle) => d.querySelector(`[data-element-lignee="resultat:${S.variantes[cle]}"]`);

/* ───────────────────────────── 1 · la touche T ───────────────────────────── */

describe('la touche T · lot conclu avec gagnante · LE lien du bouton de sa variante · l’écran Itérer sur elle · l’itération porte `depuisGagnante`', () => {
  it('préalables · C conclu et confirmé · N pas conclu · a, F et les gagnantes de C dans le plan', async () => {
    const c = await fiche(S.lots.C.id);
    expect(c.querySelector('[aria-label="Conclusion du lot"]')?.getAttribute('data-conclusion')).toBe('confirmee');
    expect(c.querySelector('#conclure'), 'préalable · C reste à conclure').toBeNull();
    expect((await fiche(S.lots.N.id)).querySelector('#conclure'), 'préalable · N est déjà conclu (rien à arbitrer)').toBeTruthy();
    for (const x of [S.pubs.a, S.ads.C1!, S.ads.C4!, S.ads.N1!]) expect(admise[x], `préalable · ${x} n’est pas dans le plan`).toBeTruthy();
  });

  it('T · le libellé nomme la variante · son adresse est CELLE du bouton de cette variante · la touche l’ouvre · Itérer présélectionne cette variante · « Créer l’itération » pose `depuisGagnante`', async () => {
    const avant = await lignes();
    await monter(await page(S.lots.C.id));
    const libelle = visible(T());
    const code = /^Itérer depuis (\S+)$/.exec(libelle ?? '')?.[1];
    expect(code, `le bouton de T ne nomme pas une variante · « ${libelle} »`).toBeTruthy();
    const bouton = geste(ligneVariante(document, code!));
    expect(bouton?.tagName, `préalable · la ligne de ${code} n’a pas son geste ouvert`).toBe('A');
    const href = bouton!.getAttribute('href')!;
    expect(T()!.getAttribute('href'), 'T ne mène pas au bouton de la variante qu’il nomme').toBe(href);
    expect(params(href).lot, 'T n’ouvre pas l’écran Itérer depuis le lot').toBe(S.lots.C.id);
    S.depart = params(href).gagnante!;
    expect(href).toBe(lienIterationDepuis('lot', { id: S.lots.C.id, adId: S.depart }));
    await touche('t');
    expect(h.push.mock.calls, 'la touche T n’ouvre pas le lien du bouton').toEqual([[href]]);
    expect(toasts, 'un toast sur un geste ouvert').toEqual([]);
    expect(await lignes(), 'la touche a écrit').toEqual(avant);

    // L'écran d'arrivée, tel que la touche l'ouvre · la gagnante présélectionnée, la phrase du lot.
    await monter(await IterationSpatiale({ searchParams: Promise.resolve(params(href)) }));
    expect(pubChoisie(), 'Itérer ne présélectionne pas la variante de T').toEqual([S.depart]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain(`Itération depuis la gagnante ${code}, gagnante arbitrée du lot #${S.lots.C.n}`);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'la variable du plan n’est pas cochée').toEqual([admise[S.depart]]);
    await saisir(document.querySelector('[data-champ="valeur"]') as HTMLInputElement, 'Une valeur nouvelle et précise');
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
    let arete: { childAdId: string } | undefined;
    for (let i = 0; i < 80 && !arete; i += 1) {
      [arete] = await db.select({ childAdId: schema.iterationEdges.childAdId }).from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, S.depart));
      if (!arete) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    }
    expect(arete, 'aucune itération depuis la gagnante de T').toBeTruthy();
    const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, arete!.childAdId));
    expect(lireDepuisGagnante(enfant!.sourceRef), 'l’itération née de T ne porte pas `depuisGagnante`').toEqual({ source: 'lot', lotId: S.lots.C.id, hypotheseAdId: null, gagnanteAdId: S.depart });
    const apres = await lignes();
    expect([apres.depense, apres.credits, apres.jobs], '0 $').toEqual([avant.depense, avant.credits, avant.jobs]);
    S.X = enfant!.id;
    // La création b part en test sur l'itération X (vraie action · la fiche garde sa provenance).
    await rattacher('b', S.X);
    await plan();
  });

  it('la règle de la page · T rejoue `gestesClavierLot` avec les gestes de la fiche · rien de recopié', async () => {
    await monter(await page(S.lots.C.id));
    const lignesV = [...document.querySelectorAll('[aria-label="Les variantes du lot"] .ev')];
    const adresses = lignesV.map((x) => geste(x)?.getAttribute('href')).filter(Boolean);
    expect(adresses.length, 'préalable · des gestes ouverts sur la fiche').toBeGreaterThan(0);
    expect(adresses, 'T mène là où aucun bouton de variante ne mène').toContain(T()!.getAttribute('href'));
  });

  it('lot PAS conclu · T inchangé · `?iter=` de la gagnante arbitrée, « Itérer depuis la gagnante » · aucun bouton de variante', async () => {
    await monter(await page(S.lots.N.id));
    expect(document.querySelector('[data-iterer-gagnante]'), 'un bouton de variante sur un lot pas conclu').toBeNull();
    expect(visible(T()), 'le libellé de T a changé sur un lot pas conclu').toBe(`${LIBELLE_ITERER_GAGNANTE}`);
    await touche('t');
    expect(h.push.mock.calls, 'T a changé sur un lot pas conclu').toEqual([[lienIterationVariable({ adId: S.ads.N1! })]]);
  });

  it('raccourcis à une touche coupés (`tt_raccourcis`) · T inerte · ni navigation, ni toast, ni touche promise', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await monter(await page(S.lots.C.id));
    await touche('t');
    expect(h.push, 'T part alors que les raccourcis sont coupés').not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('fermé (Résultats ouvert par l’équipe, rôle sans `studio.propose`) · T fermé avec LA raison du bouton de sa variante · le toast la dit', async () => {
    h.session = session(ids, 'uv', { plan: 'plus', equipe: sessionEquipeTest({ role: 'adminplus', matrice: {}, plateformeAdmissible: true }) as SessionTest['equipe'] });
    await monter(await page(S.lots.C.id));
    const code = /^Itérer depuis (\S+)$/.exec(visible(T()) ?? '')?.[1];
    expect(code, 'le bouton de T fermé ne nomme pas la variante').toBeTruthy();
    const raisonBouton = ferme(document, geste(ligneVariante(document, code!))).at(-1);
    expect(T()!.tagName, 'T ouvert sans le rôle').toBe('BUTTON');
    expect(document.querySelector('[data-raison-ferme="lot-iterer"]')?.textContent, 'la raison de T n’est pas celle du bouton de sa variante').toBe(raisonBouton);
    await touche('t');
    expect(h.push).not.toHaveBeenCalled();
    expect(toasts, 'le toast ne dit pas la raison du bouton').toEqual([`${rT().libelle} · ${raisonBouton}`]);
  });
});

/* ───────────────────────────── 2 · les noms ───────────────────────────── */

describe('aucun nom accessible en double menant à deux cibles · la touche et le bouton de la ligne ont deux noms', () => {
  it('fiche du lot conclu · ouverte, puis fermée par le rôle · aucun doublon · les libellés VISIBLES de T et des lignes diffèrent', async () => {
    for (const s of [proprietaire(), session(ids, 'uv', { plan: 'plus', equipe: sessionEquipeTest({ role: 'adminplus', matrice: {}, plateformeAdmissible: true }) as SessionTest['equipe'] })]) {
      h.session = s;
      await monter(await page(S.lots.C.id));
      expect(document.querySelectorAll('[data-iterer-gagnante]').length, 'préalable · des boutons de variante').toBeGreaterThan(1);
      expect(doublons(document), 'deux contrôles de même nom mènent à deux cibles').toEqual([]);
      const lignesV = [...document.querySelectorAll('[aria-label="Les variantes du lot"] [data-geste="iterer-gagnante"]')].map(visible);
      expect(lignesV, 'le libellé visible de T est celui d’un bouton de ligne').not.toContain(visible(T()));
    }
  });
});

/* ───────────────────────────── 3 · la carte de lignée ───────────────────────────── */

describe('la carte de lignée · « née de la gagnante Vx » sur le bon nœud · le geste sur le nœud gagnant · rien écrit', () => {
  it('b (X, née par T) · « née de la gagnante » de la variante de T · d (G, née de F par le fil) · celle de F · a et c · rien · carte, nom accessible, liste', async () => {
    expect(S.X, 'préalable · l’itération de T').toBeTruthy();
    const avant = await lignes();
    const l = await ligneeRendue();
    const attendu: Record<Cle, string | null> = { a: null, b: await codeDe(S.depart), c: null, d: await codeDe(S.F) };
    for (const k of ['a', 'b', 'c', 'd'] as const) {
      const carte = carteNoeud(l, k);
      expect(carte, `préalable · le nœud Résultat de ${k}`).toBeTruthy();
      const phrase = attendu[k] ? phraseNeeDeGagnante(attendu[k]!) : null;
      expect(carte!.querySelector('[data-nee-de-gagnante]')?.textContent ?? null, `la carte de ${k}`).toBe(phrase);
      expect(carte!.getAttribute('aria-label')!.includes(' · née de la gagnante '), `le nom accessible de la carte de ${k}`).toBe(!!phrase);
      if (phrase) expect(carte!.getAttribute('aria-label')).toContain(` · ${phrase}`);
      expect(listeNoeud(l, k)!.querySelector('[data-nee-de-gagnante]')?.textContent ?? null, `la liste de ${k}`).toBe(phrase);
    }
    expect(l.querySelectorAll('[data-carte] [data-nee-de-gagnante]').length, 'une phrase sur une autre carte').toBe(2);
    expect(await lignes(), 'afficher la lignée a écrit').toEqual(avant);
  });

  it('a (gagnante arbitrée du lot conclu C) · le geste de la fiche du lot, à l’identique · aucun autre nœud n’en a · détail monté · le même', async () => {
    const avant = await lignes();
    const f = await fiche(S.lots.C.id);
    const surFiche = etatGeste(f, geste(ligneVariante(f, await codeDe(S.pubs.a))));
    expect(surFiche[0], 'préalable · la fiche n’a pas de geste pour a').toBeTruthy();
    const l = await ligneeRendue();
    expect(etatGeste(l, geste(listeNoeud(l, 'a'))), 'le geste de la liste n’est pas celui de la fiche').toEqual(surFiche);
    for (const k of ['b', 'c', 'd'] as const) expect(geste(listeNoeud(l, k)), `un geste sur le nœud de ${k}`).toBeNull();
    expect(l.querySelectorAll('[data-carte] [data-geste="iterer-gagnante"]').length, 'un geste dans une carte (un bouton dans un bouton)').toBe(0);
    expect(doublons(l), 'deux contrôles de même nom mènent à deux cibles').toEqual([]);

    await monter(await lignee(`resultat:${S.variantes.a}`));
    const detail = document.querySelector(`[data-detail-carte="resultat:${S.variantes.a}"]`);
    expect(detail, 'préalable · le détail du nœud de a').toBeTruthy();
    expect(etatGeste(document, geste(detail)), 'le geste du détail n’est pas celui de la fiche').toEqual(surFiche);
    await cliquer(carteNoeud(document, 'b'), 'la carte de b');
    const db2 = document.querySelector(`[data-detail-carte="resultat:${S.variantes.b}"]`);
    expect(db2?.querySelector('[data-nee-de-gagnante]')?.textContent, 'le détail de b').toBe(phraseNeeDeGagnante(await codeDe(S.depart)));
    expect(geste(db2), 'un geste dans le détail de b').toBeNull();
    expect(await lignes(), 'afficher a écrit').toEqual(avant);
  });

  it('autre marque active · le geste fermé, sa raison à côté (comme sur la fiche du lot) · la naissance reste dite', async () => {
    h.marque = ids.brandA2;
    const l = await ligneeRendue();
    expect(ferme(l, geste(listeNoeud(l, 'a'))), 'pas fermé avec la raison de l’autre marque').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE]);
    expect(l.querySelector('a[data-iterer-gagnante]'), 'un lien ouvert hors de la marque active').toBeNull();
    expect(carteNoeud(l, 'b')!.querySelector('[data-nee-de-gagnante]')?.textContent).toBe(phraseNeeDeGagnante(await codeDe(S.depart)));
  });

  it('forgé · la fiche de c prétend naître de Z1 (autre marque), puis de C1 dans le lot N · rien n’est dit · restaurée', async () => {
    const [avant] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, S.pubs.c));
    try {
      for (const faux of [
        { source: 'lot', lotId: S.lots.Z.id, gagnanteAdId: S.ads.Z1 },
        { source: 'lot', lotId: S.lots.N.id, gagnanteAdId: S.ads.C1 },
        { source: 'lot', lotId: S.lots.C.id, gagnanteAdId: S.pubs.c },
      ]) {
        await db.update(schema.ads).set({ sourceRef: { ...(avant!.s as object), depuisGagnante: faux } }).where(eq(schema.ads.id, S.pubs.c));
        const l = await ligneeRendue();
        expect(carteNoeud(l, 'c')!.querySelector('[data-nee-de-gagnante]'), `une naissance forgée est dite · ${JSON.stringify(faux)}`).toBeNull();
        expect(l.querySelectorAll('[data-carte] [data-nee-de-gagnante]').length).toBe(2);
      }
    } finally {
      await db.update(schema.ads).set({ sourceRef: avant!.s }).where(eq(schema.ads.id, S.pubs.c));
    }
  });
});

/* ───────────────────────────── 4 · égalité ───────────────────────────── */

/**
 * Écart DÉCLARÉ, étroitement · la touche T de la fiche (le contrôle
 * `[data-geste-clavier="lot-iterer"]` · son libellé et son adresse changent,
 * c'est le but) · sur la lignée, les éléments ajoutés (`[data-lignee-gagnante]`,
 * `[data-nee-de-gagnante]`) et la phrase ajoutée au nom accessible de la carte ·
 * rien d'autre ne bouge. Depuis le lot des noms de ligne · les `aria-label` AJOUTÉS (qui commencent
 * par le libellé visible · `sansNomsAjoutes`) sont retirés avant la comparaison, la capture reste celle de main.
 */
function sansEcartDeclare(html: string, avant?: string) {
  const d = dom(avant === undefined ? html : sansNomsAjoutes(html, avant).html);
  d.querySelectorAll('[data-geste-clavier="lot-iterer"], [data-lignee-gagnante], [data-nee-de-gagnante]').forEach((x) => x.remove());
  d.querySelectorAll('[data-carte][aria-label]').forEach((x) => x.setAttribute('aria-label', x.getAttribute('aria-label')!.replace(/ · née de la gagnante \S+/, '')));
  return d.innerHTML;
}

describe('égalité · hors des éléments ajoutés et de la touche T, la capture de main', () => {
  it('la fiche d’un lot conclu et la lignée, gestes et naissances calculés par la VRAIE règle · le reste, octet pour octet', () => {
    const l = LOT_CONCLU;
    const g = gestesGagnantesLot(l, { marqueActive: true, peutIterer: true });
    const k = gestesClavierLot({ etat: l.etat, ads: l.ads, gagnante: l.gagnante, planIds: new Set(l.ads.map((a) => a.id)), depuisGagnante: g });
    expect([k.iterer.href, k.iterer.libelle], 'T sur le lot conclu').toEqual([g[l.gagnante]!.href, 'Itérer depuis V2']);
    const p = propsFicheConclue();
    const ficheHtml = renderToStaticMarkup(avecSpatial(<Lot {...p} fiches={p.fiches!.map((f, i) => ({ ...f, ...(g[l.ads[i]!.id] ? { gagnante: g[l.ads[i]!.id] } : {}) }))} actions={<RaccourcisLot conclure={k.conclure} iterer={k.iterer} />} />));
    const relues = new Map(l.ads.map((a) => [a.id, { id: a.id, variante: a.variante, lotId: l.id }]));
    const gagnantes: Record<string, GagnanteDuNoeud> = gagnantesDeLaLignee(
      MODELE_LIGNEE.noeuds.filter((n) => n.type === 'resultat').map((n, i) => ({ noeud: n.id, adId: [AD_GAGNANTE, AD_PERDANTE, AD_NEE][i]!, enLot: !!n.lotTest })),
      { naissances: new Map([[AD_NEE, { source: 'lot', lotId: l.id, gagnanteAdId: AD_GAGNANTE }]]), relue: (id) => relues.get(id), lots: [l], o: { marqueActive: true, peutIterer: true } },
    );
    expect(Object.keys(gagnantes).sort(), 'préalable · la lignée figée a sa naissance et son geste').toEqual(['resultat:va1', 'resultat:va3']);
    const ligneesHtml = ['resultat:va1', 'resultat:va3'].map((n) => renderToStaticMarkup(avecSpatial(<CanvasLibre c={canevasLignee(n, { gagnantes })} cibler={() => {}} />)));
    const html = `${ficheHtml}\n${ligneesHtml.join('\n')}\n`;
    const avant = readFileSync(join(__dirname, 'fixtures/gagnante-clavier-avant.html'), 'utf8');
    const d = dom(html);
    expect(d.querySelectorAll('[data-lignee-gagnante]').length, 'les éléments ajoutés · le geste de va1 (détail, liste) · la naissance de va3 (détail, liste), deux fois chacun').toBe(6);
    expect(d.querySelectorAll('[data-carte] [data-nee-de-gagnante]').length, 'la phrase sur la carte de va3, dans chaque rendu').toBe(2);
    expect(html, 'préalable · rien n’a été ajouté').not.toBe(avant);
    expect(sansNomsAjoutes(html, avant).retires, 'préalable · les noms de ligne ajoutés (« Fiche », lignée)').toBeGreaterThan(0);
    expect(sansEcartDeclare(html, avant), 'hors des éléments ajoutés et de la touche T, le rendu a changé').toBe(sansEcartDeclare(avant));
  });
});
