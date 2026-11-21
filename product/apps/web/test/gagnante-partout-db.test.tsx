// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdsStudios, SessionTest, SurchargeSession } from './studios-semis';

/**
 * « Itérer depuis la gagnante » PARTOUT où on lit un résultat (suite de #1083)
 * · base RÉELLE (pglite, migrations du dépôt), VRAIES actions (commenter, créer
 * l'itération · gardes relues), VRAIES pages rendues (fiche d'un lot, page
 * Hypothèses, fiche projet onglet Activité) puis le VRAI écran Itérer monté et
 * cliqué · on lit le DOM et ce qui est écrit.
 *
 *  · lot conclu avec gagnante → un bouton par gagnante sur la fiche → l'écran
 *    Itérer sur CETTE variante → « Créer l'itération » · `depuisGagnante`
 *    (source, lot, `gagnanteAdId`) · le bilan la compte « Itération d'une gagnante » ;
 *  · hypothèse confirmée → le bouton sur SA carte → la même chose · infirmée,
 *    sans conclusion, en test · aucun bouton ;
 *  · une gagnante d'où une suite est déjà en test · signalée sur la fiche, la
 *    carte ET sous le fil de #1083 · fermée avec la phrase du plan ;
 *  · autre marque active · refus · rôle sans `studio.propose` · fermé avec la
 *    raison du rôle · `gagnanteAdId` forgé · refus, rien posé ;
 *  · rien n'est écrit pour afficher (lignes identiques avant / après) ;
 *  · ÉGALITÉ · une fiche et des cartes SANS gagnante confirmée rendent la capture
 *    faite sur main avant le changement (`fixtures/gagnante-partout-avant.html`).
 * 0 $ · fournisseur et stockage simulés, aucune génération, aucune dépense.
 * Aucune date « à venir » · les lots sont lancés il y a 30 jours.
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
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
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
  LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE, RAISON_HORS_PLAN, RAISON_ROLE_ITERATION, REFUS_GAGNANTE_DEPUIS, gestesGagnantesHypotheses, gestesGagnantesLot,
  lienIterationDepuis, lireDepuisGagnante, lireProvenanceCommentaire, phraseSuiteEnTest, provenanceDuTest, sousNavResultats, variablesDuPlan, type TestedVariable,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { attendreMontageStable } from './helpers/attendre-etat';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { commenterProjet } from '../app/actions/studios/activite';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { Projet } from '../spatial/vues/projet/Projet';
import { Lot } from '../spatial/vues/resultats/Lot';
import { Hypotheses } from '../spatial/vues/resultats/Hypotheses';
import { LOTS_SANS_GAGNANTE, cartesSansGagnante, faitsCartesSansGagnante, propsFicheLot } from './helpers/gagnante-partout-vues';
import { sansNomsAjoutes } from './helpers/noms-accessibles';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
type CleLot = 'C' | 'I' | 'S' | 'D';
const S = {
  P1: '', pub: '', asset: '', fil: '', F: '',
  lots: {} as Record<CleLot | 'R' | 'A2', { id: string; n: number }>,
  ads: {} as Record<string, string>,
};
const proprietaire = (o: SurchargeSession = {}): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus', ...o });
const admise: Record<string, TestedVariable> = {};

async function chaine(titre: string, brandId = ids.brandA1) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
let numero = 60;
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
async function remplir(concept: string, lotId: string, issues: Array<'winner' | 'loser'>, prefixe: string, statut: 'validated' | 'computed' = 'validated') {
  for (const [i, v] of issues.entries()) {
    const code = `${prefixe}${i + 1}`;
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: concept, batchId: lotId, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la question retient.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, v, statut);
    S.ads[code] = a!.id;
  }
}
async function plan() {
  const p = variablesDuPlan((await iterationPlanAction()).view!.rows);
  for (const k of Object.keys(admise)) delete admise[k];
  for (const [adId, c] of Object.entries(p)) { const o = c.options.find((x) => x.admise); if (o) admise[adId] = o.variable; }
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── Le fil de #1083 · une création testée, gagnante arbitrée · un commentaire · l'itération F née de lui (la vraie action).
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · gagnante partout' })).projectId;
  const job = await lancerLot(db, ctxDe(ids, 'ua'), S.P1, KEYFRAMES(1));
  await executer(db, job);
  S.asset = (await sortiesDuJob(db, job))['keyframe:s1']!;
  const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: S.asset });
  if (!v.ok) throw new Error(`variante ${v.code}`);
  const lien = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v.variante.id, saisie: saisieTest() });
  if (!lien.ok) throw new Error(`rattacher ${lien.code}`);
  S.pub = lien.lien.adsmapAdId;
  await verdict(S.pub, 'winner');

  // ── Résultats (A1) · une référence (6 sur 12), puis C confirmé, I infirmé, S sans conclusion, D à conclure (verdicts du moteur seulement).
  const ref = await chaine('Crème de référence');
  S.lots.R = await lot('Référence de la marque');
  await remplir(ref, S.lots.R.id, [...Array(6).fill('winner'), ...Array(6).fill('loser')], 'R');
  await plan();
  const texte = 'Il faudrait essayer une autre accroche · piste F.';
  const c = await commenterProjet({ projectId: S.P1, cible: 'creation', cibleId: S.asset, texte });
  if (!c.ok) throw new Error(`commenter ${JSON.stringify(c)}`);
  S.fil = c.commentaires.find((x) => x.texte === texte)!.id;
  const f = await creerIterationChoisieAction({ parentAdId: S.pub, variable: admise[S.pub]!, valeur: 'Une accroche douleur', hypothese: 'Si on change l’accroche F, alors le coût par achat baisse, parce que le fil l’a vu.', commentaire: { commentaireId: S.fil, projetId: S.P1 } });
  if (!f.ok) throw new Error(`itérer ${f.error}`);
  S.F = f.adId;

  const concept = await chaine('Crème testée');
  S.lots.C = await lot('Lot confirmé'); S.lots.I = await lot('Lot infirmé'); S.lots.S = await lot('Lot sans conclusion'); S.lots.D = await lot('Lot à conclure');
  await remplir(concept, S.lots.C.id, ['winner', 'winner', 'winner', 'winner'], 'C');
  await remplir(concept, S.lots.I.id, ['loser', 'loser', 'loser', 'loser'], 'I');
  await remplir(concept, S.lots.S.id, ['winner', 'loser', 'loser'], 'S');
  await remplir(concept, S.lots.D.id, ['winner', 'loser', 'winner', 'loser'], 'D', 'computed');
  // F rejoint le lot confirmé · son résultat sous le fil est « Itération confirmée ».
  await db.update(schema.ads).set({ batchId: S.lots.C.id, status: 'done' }).where(eq(schema.ads.id, S.F));
  await verdict(S.F, 'winner');
  // L'autre marque (A2) · une gagnante arbitrée à elle · son écran Itérer a un plan, il dit donc ses refus.
  const autre = await chaine('Crème de l’autre marque', ids.brandA2);
  S.lots.A2 = await lot('Lot de l’autre marque', ids.brandA2);
  await remplir(autre, S.lots.A2.id, ['winner'], 'Z');
  await plan();
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  // Rien d'asynchrone n'est attendu au montage (mesuré · sans aucune attente, le fichier passe) ·
  // l'état attendu est un arbre RENDU qui ne bouge plus, jamais une durée.
  await attendreMontageStable();
}
async function cliquer(el: Element | null, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(el: HTMLInputElement, valeur: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const iterer = (sp: Record<string, string>) => IterationSpatiale({ searchParams: Promise.resolve(sp) });
const fiche = async (k: CleLot) => dom(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id: S.lots[k].id }), searchParams: Promise.resolve({}) }))));
const hypotheses = async () => dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial({ searchParams: Promise.resolve({}) }))));
async function activite() {
  const r = await chargerProjet(h.session as never, S.P1);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return dom(renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="activite" />)));
}
/** La ligne d'une variante dans « Les variantes du lot » · par son code. */
const ligneVariante = (d: ParentNode, code: string) => [...d.querySelectorAll('[aria-label="Les variantes du lot"] .ev')].find((x) => x.querySelector('strong')?.textContent?.startsWith(`${code} · `)) ?? null;
/** La carte d'une hypothèse · par la phrase de son ad. */
const carte = (d: ParentNode, code: string) => [...d.querySelectorAll('.hcard')].find((x) => x.textContent!.includes(`Si on teste ${code},`)) ?? null;
const carteF = (d: ParentNode) => [...d.querySelectorAll('.hcard')].find((x) => x.textContent!.includes('l’accroche F,')) ?? null;
const geste = (n: Element | null) => n?.querySelector('[data-geste="iterer-gagnante"]') ?? null;
async function codeDe(adId: string) {
  const [a] = await db.select({ c: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId));
  return a!.c;
}
/** Toutes les lignes que l'affichage pourrait toucher · comparées en entier avant / après. */
async function lignes() {
  const t = async (x: unknown) => (await db.select().from(x as typeof schema.ads)).map((l) => JSON.stringify(l)).sort();
  return {
    commentaires: await t(schema.studioComments), ads: await t(schema.ads), verdicts: await t(schema.verdicts), lots: await t(schema.batches),
    aretes: await t(schema.iterationEdges), notifications: await t(schema.notifications), audit: await t(schema.studioAuditEvents),
    apprentissages: await t(schema.learnings), depense: await t(schema.aiSpend), credits: await t(schema.creditLedger), jobs: await t(schema.studioJobs),
  };
}
/** Un geste fermé · un bouton aria-disabled, ce qu'il cite (`aria-describedby`) écrit à côté. */
function ferme(d: ParentNode, b: Element | null) {
  const x = b as HTMLButtonElement | null;
  const cites = (x?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((i) => d.querySelector(`#${CSS.escape(i)}`)?.textContent ?? null);
  return [x?.tagName ?? null, x?.getAttribute('aria-disabled') ?? null, x?.textContent ?? null, ...cites];
}
/** Créer l'itération depuis l'écran Itérer MONTÉ · la variable du plan, une valeur · l'enfant né de la gagnante. */
async function creerDepuisEcran(gagnante: string) {
  await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
  expect(coche(), 'la variable du plan n’est pas cochée').toEqual([admise[gagnante]]);
  await saisir(document.querySelector('[data-champ="valeur"]') as HTMLInputElement, 'Une valeur nouvelle et précise');
  const avant = await lignes();
  await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
  let arete: { childAdId: string } | undefined;
  for (let i = 0; i < 80 && !arete; i += 1) {
    [arete] = await db.select({ childAdId: schema.iterationEdges.childAdId }).from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, gagnante));
    if (!arete) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  expect(arete, 'aucune itération depuis la gagnante').toBeTruthy();
  const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, arete!.childAdId));
  const apres = await lignes();
  expect([apres.ads.length - avant.ads.length, apres.aretes.length - avant.aretes.length, apres.depense, apres.credits, apres.jobs], 'une itération, une arête, 0 $')
    .toEqual([1, 1, avant.depense, avant.credits, avant.jobs]);
  return enfant!;
}

/* ───────────────────────────── 1 · ce qu'on voit ───────────────────────────── */

describe('ce qu’on voit · la fiche d’un lot conclu, les cartes confirmées · rien ailleurs · afficher n’écrit rien', () => {
  it('préalables · chaque gagnante est dans le plan d’itération · les conclusions des lots sont celles attendues', async () => {
    for (const k of ['C1', 'C2', 'C3', 'C4', 'S1']) expect(admise[S.ads[k]!], `préalable · ${k} n’est pas dans le plan`).toBeTruthy();
    expect(admise[S.F], 'préalable · F n’est pas dans le plan').toBeTruthy();
    const d = await fiche('C');
    expect(d.querySelector('[aria-label="Conclusion du lot"]')?.getAttribute('data-conclusion')).toBe('confirmee');
    expect((await fiche('I')).querySelector('[aria-label="Conclusion du lot"]')?.getAttribute('data-conclusion')).toBe('infirmee');
    expect((await fiche('S')).querySelector('[aria-label="Conclusion du lot"]')?.getAttribute('data-conclusion')).toBe('non_concluante');
  });

  it('la fiche du lot confirmé · un lien par gagnante, vers l’écran Itérer parti du lot et de CETTE variante', async () => {
    const avant = await lignes();
    const d = await fiche('C');
    for (const k of ['C1', 'C2', 'C3', 'C4']) {
      const a = geste(ligneVariante(d, k));
      expect([a?.tagName, a?.getAttribute('href'), a?.textContent], `la ligne de ${k}`).toEqual(['A', `/studio/iterer?lot=${S.lots.C.id}&gagnante=${S.ads[k]}`, LIBELLE_ITERER_GAGNANTE]);
    }
    expect(geste(ligneVariante(d, await codeDe(S.F)))?.getAttribute('href'), 'F, gagnante du lot').toBe(lienIterationDepuis('lot', { id: S.lots.C.id, adId: S.F }));
    expect(d.querySelectorAll('[data-iterer-gagnante]').length, 'un bouton par gagnante, rien d’autre').toBe(5);
    expect(await lignes(), 'afficher la fiche a écrit').toEqual(avant);
  });

  it('les autres fiches · sans conclusion · la gagnante S1 seule · infirmé, à conclure · aucun bouton', async () => {
    const s = await fiche('S');
    expect(geste(ligneVariante(s, 'S1'))?.getAttribute('href')).toBe(`/studio/iterer?lot=${S.lots.S.id}&gagnante=${S.ads.S1}`);
    expect(s.querySelectorAll('[data-iterer-gagnante]').length, 'un bouton sur une perdante du lot sans conclusion').toBe(1);
    expect((await fiche('I')).querySelector('[data-iterer-gagnante]'), 'un bouton sur le lot infirmé').toBeNull();
    expect((await fiche('D')).querySelector('[data-iterer-gagnante]'), 'un bouton sur un lot à conclure').toBeNull();
  });

  it('la page Hypothèses · le bouton sur chaque carte CONFIRMÉE seulement · infirmée, sans conclusion, en test · rien', async () => {
    const avant = await lignes();
    const d = await hypotheses();
    for (const k of ['C1', 'C2', 'C3', 'C4']) {
      const c = carte(d, k);
      expect(c?.querySelector('[data-resultat-hypothese]')?.getAttribute('data-resultat-hypothese'), `la carte de ${k}`).toBe('confirmee');
      expect(geste(c)?.getAttribute('href'), `la carte de ${k}`).toBe(`/studio/iterer?hypothese=${S.ads[k]}&gagnante=${S.ads[k]}`);
    }
    for (const [k, statut] of [['I1', 'infirmee'], ['S1', 'sans_conclusion'], ['S2', 'sans_conclusion']] as const) {
      expect(carte(d, k)?.querySelector('[data-resultat-hypothese]')?.getAttribute('data-resultat-hypothese'), `la carte de ${k}`).toBe(statut);
      expect(geste(carte(d, k)), `un bouton sur ${k} (${statut})`).toBeNull();
    }
    expect([...d.querySelectorAll('.board4 > div')][2]!.contains(carte(d, 'D1')), 'préalable · D1 n’est pas « En test »').toBe(true);
    expect(geste(carte(d, 'D1')), 'un bouton sur une hypothèse en test').toBeNull();
    expect(d.querySelectorAll('[data-iterer-gagnante]').length, 'les cinq cartes confirmées, rien d’autre').toBe(5);
    expect(await lignes(), 'afficher les hypothèses a écrit').toEqual(avant);
  });
});

/* ───────────────────────────── 2 · le geste ───────────────────────────── */

describe('le geste · l’écran Itérer EXISTANT sur la bonne variante · « Créer l’itération » · la gagnante relue, posée', () => {
  it('depuis la fiche du lot · C2 présélectionnée, la phrase du lot · créée · `depuisGagnante` · le bilan inchangé', async () => {
    const d = await fiche('C');
    const href = geste(ligneVariante(d, 'C2'))!.getAttribute('href')!;
    const avant = await lignes();
    await monter(await iterer(params(href)));
    expect(pubChoisie(), 'la pub présélectionnée n’est pas la gagnante').toEqual([S.ads.C2]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toBe(`Itération depuis la gagnante C2, gagnante arbitrée du lot #${S.lots.C.n} · la variable proposée est celle du plan, modifiable · la nouvelle itération gardera la gagnante d’où elle part. Rien n’est créé sans ton clic sur « Créer l’itération ».`);
    expect(await lignes(), 'ouvrir l’écran a écrit').toEqual(avant);
    const enfant = await creerDepuisEcran(S.ads.C2!);
    const ref = enfant.sourceRef as Record<string, unknown>;
    expect(ref.depuisGagnante, 'la provenance du lot et la gagnante').toEqual({ source: 'lot', lotId: S.lots.C.id, gagnanteAdId: S.ads.C2 });
    expect(lireDepuisGagnante(ref)).toEqual({ source: 'lot', lotId: S.lots.C.id, hypotheseAdId: null, gagnanteAdId: S.ads.C2 });
    expect(provenanceDuTest({ origine: null, typeAd: enfant.adType, commentaire: lireProvenanceCommentaire(ref) }), 'le bilan ne la compte pas « Itération d’une gagnante »').toBe('iteration');
  });

  it('depuis la carte d’une hypothèse confirmée · C3 présélectionnée, la phrase de l’hypothèse · créée · `depuisGagnante` nomme la carte', async () => {
    const d = await hypotheses();
    const href = geste(carte(d, 'C3'))!.getAttribute('href')!;
    await monter(await iterer(params(href)));
    expect(pubChoisie()).toEqual([S.ads.C3]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain(`Itération depuis la gagnante C3, gagnante du lot #${S.lots.C.n}, qui a confirmé l’hypothèse`);
    const enfant = await creerDepuisEcran(S.ads.C3!);
    expect((enfant.sourceRef as Record<string, unknown>).depuisGagnante).toEqual({ source: 'hypothese', lotId: S.lots.C.id, hypotheseAdId: S.ads.C3, gagnanteAdId: S.ads.C3 });
  });
});

/* ───────────────────────────── 3 · signalé à l'avance ───────────────────────────── */

describe('signalé à l’avance · une suite déjà en test · sur la fiche, la carte ET sous le fil de #1083', () => {
  it('fiche et carte · C2 a une suite en test · fermée avec la phrase du plan, « Déjà une suite en test · Vx » à côté · C4 reste ouverte', async () => {
    await plan();
    const [arete] = await db.select({ c: schema.iterationEdges.childAdId }).from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, S.ads.C2!));
    const suite = await codeDe(arete!.c);
    const avant = await lignes();
    const d = await fiche('C');
    expect(ferme(d, geste(ligneVariante(d, 'C2'))), 'sur la fiche').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, phraseSuiteEnTest(suite), RAISON_HORS_PLAN]);
    expect(ligneVariante(d, 'C2')!.querySelector('[data-suite-en-test]')?.textContent).toBe(`Déjà une suite en test · ${suite}`);
    expect(geste(ligneVariante(d, 'C4'))?.tagName, 'une gagnante sans suite reste ouverte').toBe('A');
    const hy = await hypotheses();
    expect(ferme(hy, geste(carte(hy, 'C2'))), 'sur la carte').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, phraseSuiteEnTest(suite), RAISON_HORS_PLAN]);
    expect(await lignes(), 'signaler a écrit').toEqual(avant);
  });

  it('sous le fil · F ouverte, puis une itération née d’elle (la vraie action, provenance du fil) · fermée, la suite signalée · aussi sur la fiche du lot', async () => {
    const a = await activite();
    const c = a.querySelector(`[data-commentaire="${S.fil}"]`);
    expect(c?.querySelector('[data-resultat-commentaire]')?.getAttribute('data-resultat-commentaire'), 'préalable · F n’est pas confirmée sous le fil').toBe('confirmee');
    expect(geste(c)?.tagName, 'F ouverte sous le fil avant sa suite').toBe('A');
    expect(c?.querySelector('[data-suite-en-test]'), 'un signal avant la suite').toBeNull();
    await plan();
    const r = await creerIterationChoisieAction({ parentAdId: S.F, variable: admise[S.F]!, valeur: 'Une suite de F', hypothese: 'Si on change encore l’accroche, alors le coût baisse, parce que F a gagné.', commentaire: { commentaireId: S.fil, projetId: S.P1 } });
    expect([r.ok, r.ok && r.provenance], 'la suite de F').toEqual([true, 'commentaire']);
    const suite = await codeDe((r as { adId: string }).adId);
    const b = await activite();
    const c2 = b.querySelector(`[data-commentaire="${S.fil}"]`);
    expect(ferme(b, geste(c2)), 'sous le fil').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, phraseSuiteEnTest(suite), RAISON_HORS_PLAN]);
    const d = await fiche('C');
    expect(ferme(d, geste(ligneVariante(d, await codeDe(S.F)))), 'sur la fiche du lot').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, phraseSuiteEnTest(suite), RAISON_HORS_PLAN]);
    const hy = await hypotheses();
    expect(ferme(hy, geste(carteF(hy))), 'sur sa carte').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, phraseSuiteEnTest(suite), RAISON_HORS_PLAN]);
  });
});

/* ───────────────────────────── 4 · les portes ───────────────────────────── */

describe('les portes · autre marque active, rôle sans `studio.propose`', () => {
  it('autre marque active · l’écran Itérer refuse le lot et la carte, rien de présélectionné · la fiche du lot n’existe pas · sous le fil, fermé avec sa raison', async () => {
    h.marque = ids.brandA2;
    const avant = await lignes();
    for (const [sp, phrase] of [
      [params(lienIterationDepuis('lot', { id: S.lots.C.id, adId: S.ads.C4! })!), REFUS_GAGNANTE_DEPUIS.lot],
      [params(lienIterationDepuis('hypothese', { id: S.ads.C4!, adId: S.ads.C4! })!), REFUS_GAGNANTE_DEPUIS.hypothese],
    ] as const) {
      await monter(await iterer(sp));
      expect(document.querySelector('[data-note-commentaire]')?.textContent, JSON.stringify(sp)).toBe(phrase);
      expect(pubChoisie(), JSON.stringify(sp)).toEqual([]);
      expect([...document.querySelectorAll('[data-itad]')].map((b) => b.getAttribute('data-itad')), 'préalable · l’écran ne lit pas le plan de l’autre marque').toEqual([S.ads.Z1]);
    }
    await expect(fiche('C')).rejects.toThrow('NOT_FOUND');
    expect(carte(await hypotheses(), 'C4'), 'la carte d’une autre marque sur la page Hypothèses').toBeNull();
    const a = await activite();
    expect(ferme(a, geste(a.querySelector(`[data-commentaire="${S.fil}"]`))), 'sous le fil').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE]);
    expect(await lignes(), 'l’écran a écrit').toEqual(avant);
  });

  it('Résultats ouvert par l’équipe, rôle d’espace sans `studio.propose` · fiche et carte · fermées avec la raison du rôle', async () => {
    h.session = session(ids, 'uv', { plan: 'plus', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } });
    const d = await fiche('C');
    expect(ferme(d, geste(ligneVariante(d, 'C4'))), 'sur la fiche').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_ROLE_ITERATION]);
    expect(d.querySelector('a[data-iterer-gagnante]'), 'un lien ouvert sans le rôle').toBeNull();
    const hy = await hypotheses();
    expect(ferme(hy, geste(carte(hy, 'C4'))), 'sur la carte').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_ROLE_ITERATION]);
  });
});

/* ───────────────────────────── 5 · forgé ───────────────────────────── */

describe('forgé · une gagnante qui n’en est pas une · refus · l’action ne pose rien', () => {
  it('l’écran · une perdante du lot, une gagnante d’un AUTRE lot, une carte infirmée, une autre gagnante que celle de la carte, deux sources · refus', async () => {
    const avant = await lignes();
    const cas: Array<[Record<string, string>, string]> = [
      [params(lienIterationDepuis('lot', { id: S.lots.I.id, adId: S.ads.I1! })!), REFUS_GAGNANTE_DEPUIS.lot],
      [params(lienIterationDepuis('lot', { id: S.lots.S.id, adId: S.ads.C4! })!), REFUS_GAGNANTE_DEPUIS.lot],
      [params(lienIterationDepuis('lot', { id: S.lots.D.id, adId: S.ads.D1! })!), REFUS_GAGNANTE_DEPUIS.lot],
      [params(lienIterationDepuis('hypothese', { id: S.ads.S1!, adId: S.ads.S1! })!), REFUS_GAGNANTE_DEPUIS.hypothese],
      [params(lienIterationDepuis('hypothese', { id: S.ads.C4!, adId: S.ads.C1! })!), REFUS_GAGNANTE_DEPUIS.hypothese],
      [{ lot: S.lots.C.id, hypothese: S.ads.C4!, gagnante: S.ads.C4! }, REFUS_GAGNANTE_DEPUIS.lot],
      [{ lot: S.lots.C.id, gagnante: 'C4' }, REFUS_GAGNANTE_DEPUIS.lot],
    ];
    for (const [sp, phrase] of cas) {
      await monter(await iterer(sp));
      expect(document.querySelector('[data-note-commentaire]')?.textContent, JSON.stringify(sp)).toBe(phrase);
      expect(pubChoisie(), `une pub présélectionnée · ${JSON.stringify(sp)}`).toEqual([]);
    }
    expect(await lignes(), 'l’écran a écrit').toEqual(avant);
  });

  it('l’action · une gagnante de la référence avec la source du lot C · S1 avec la source de la carte C4 · créées ordinaires · rien de ce que le client ajoute n’est recopié', async () => {
    await plan();
    for (const [parentAdId, gagnante] of [
      [S.ads.R1!, { source: 'lot', id: S.lots.C.id, lotId: S.lots.C.id, gagnanteAdId: S.ads.R1 }],
      [S.ads.S1!, { source: 'hypothese', id: S.ads.C4, gagnanteAdId: S.ads.S1 }],
    ] as const) {
      expect(admise[parentAdId], 'préalable · la pub n’est pas dans le plan').toBeTruthy();
      const r = await creerIterationChoisieAction({ parentAdId, variable: admise[parentAdId]!, valeur: 'Une valeur forgée', hypothese: 'Si on change le témoin, alors le coût par achat baisse, parce que.', gagnante });
      expect([r.ok, r.ok && r.provenance], 'une provenance posée sur une pub qui n’est pas une gagnante admise').toEqual([true, null]);
      const [enfant] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, (r as { adId: string }).adId));
      expect(JSON.stringify(enfant!.s ?? {}), 'la gagnante forgée par le client a été recopiée').not.toMatch(/depuisGagnante|gagnanteAdId/);
    }
  });
});

/* ───────────────────────────── 6 · égalité ───────────────────────────── */

describe('égalité · une fiche et des cartes SANS gagnante confirmée rendent la capture de main, octet pour octet', () => {
  it('les gestes calculés par la VRAIE règle (aucun) · strictement la capture', () => {
    const O = { marqueActive: true, peutIterer: true };
    const lots = LOTS_SANS_GAGNANTE.map((l) => {
      const g = gestesGagnantesLot(l, O);
      expect(g, `un geste sur le lot #${l.numero}`).toEqual({});
      const p = propsFicheLot(l);
      return renderToStaticMarkup(avecSpatial(<Lot {...p} fiches={p.fiches!.map((f, i) => ({ ...f, ...(g[l.ads[i]!.id] ? { gagnante: g[l.ads[i]!.id] } : {}) }))} />));
    }).join('\n');
    const faits = faitsCartesSansGagnante();
    const gestes = gestesGagnantesHypotheses(faits, (id) => LOTS_SANS_GAGNANTE.find((l) => l.id === id)?.ads ?? [], O);
    expect(gestes, 'un geste sur une carte non confirmée').toEqual({});
    const hyp = renderToStaticMarkup(avecSpatial(<Hypotheses sousNav={sousNavResultats({ admin: true })} jarvis={false} note="n" cartes={cartesSansGagnante()} gagnantes={gestes} />));
    const avant = readFileSync(join(__dirname, 'fixtures/gagnante-partout-avant.html'), 'utf8');
    const html = `${lots}\n${hyp}\n`;
    // Depuis les noms de ligne · les `aria-label` AJOUTÉS (« Fiche · … », « Voir · … », qui commencent par le libellé visible) sont retirés, la capture reste celle de main.
    const n = sansNomsAjoutes(html, avant);
    expect(n.retires, 'préalable · les noms de ligne ajoutés').toBeGreaterThan(0);
    expect(n.html.length, 'le rendu sans gagnante confirmée a changé de taille').toBe(n.avant.length);
    expect(n.html, 'le rendu sans gagnante confirmée a changé').toBe(n.avant);
  });
});
