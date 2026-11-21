// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * « Itérer depuis la gagnante » (suite de #1079) · base RÉELLE (pglite,
 * migrations du dépôt), VRAIES actions (commenter, noter, créer l'itération ·
 * gardes relues), VRAIES vues rendues puis montées (la fiche projet onglet
 * Activité, le canvas de lignée · liste et détail du nœud, l'écran Itérer) ·
 * on lit le DOM et ce qui est écrit.
 *
 *  · commentaire / note → itération (la vraie action, provenance du fil) → lot
 *    conclu · confirmée · « Itérer depuis la gagnante » sous le commentaire ET
 *    sous la note (liste, détail du nœud) · infirmée, sans conclusion, en test
 *    · aucun bouton ;
 *  · le geste mène à l'écran Itérer EXISTANT, la GAGNANTE présélectionnée · le
 *    clic « Créer l'itération » crée l'itération depuis elle · provenance du fil
 *    (même forme) + `gagnanteAdId` · sous le fil, « née de la gagnante » ;
 *  · une gagnante forgée (infirmée, d'un autre fil) · refus, rien de présélectionné
 *    · la provenance n'est pas posée par l'action pour une pub qui n'en est pas une ;
 *  · autre marque active · fermé, sa raison écrite à côté · Résultats fermé
 *    (formule, lecteur) · rien · rôle sans `studio.propose` (Résultats ouvert
 *    par l'équipe) · fermé avec la raison du rôle ;
 *  · rien n'est écrit pour afficher (lignes identiques avant / après) ;
 *  · ÉGALITÉ · un fil SANS résultat confirmé rend, octet pour octet, la capture
 *    faite sur main avant le changement (`fixtures/fils-sans-confirmee-avant.html`).
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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/studio/projets', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/studio/projets', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import {
  LIBELLE_ITERER_GAGNANTE, MAX_CHOIX_ITERATION, RAISON_GAGNANTE_AUTRE_MARQUE, RAISON_ROLE_ITERATION, REFUS_GAGNANTE, gestesGagnantesFil, lienIterationGagnante, lireGagnanteDuFil,
  lireProvenanceCommentaire, lireProvenanceNote, phraseNeeDeGagnante, variablesDuPlan, type ResultatFil, type TestedVariable,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { commenterProjet } from '../app/actions/studios/activite';
import { noterNoeudLignee } from '../app/actions/studios/notes-lignee';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { Projet } from '../spatial/vues/projet/Projet';
import { OngletActivite } from '../spatial/vues/projet/OngletActivite';
import { NotesSansNoeud, type ControleNotes } from '../spatial/vues/projet/NotesLignee';
import { sessionEquipeTest } from './helpers/face-equipe';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
/** C · confirmée · I · infirmée · S · sans conclusion · T · en test (hors lot) · NC, NI · les notes, confirmée et infirmée · X · une gagnante témoin, jamais itérée. */
type Cle = 'C' | 'I' | 'S' | 'T' | 'NC' | 'NI' | 'X';
const CLES: readonly Cle[] = ['C', 'I', 'S', 'T', 'NC', 'NI', 'X'];
const S = {
  P1: '', assets: {} as Record<Cle, string>, variantes: {} as Record<Cle, string>, pubs: {} as Record<Cle, string>,
  fils: {} as Record<Cle, string>, iterations: {} as Record<Cle, string>, lots: {} as Record<'C' | 'I' | 'S', { id: string; n: number }>,
};
const proprietaire = (o: Partial<SessionTest> = {}): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus', ...o });
const admise: Record<string, TestedVariable> = {};

async function chaine(titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
let numero = 40;
async function lot(goal: string) {
  numero += 1;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: numero, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return { id: b!.id, n: numero };
}
async function verdict(adId: string, v: 'winner' | 'loser') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: v, status: 'validated', comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
}
async function remplir(concept: string, lotId: string, issues: Array<'winner' | 'loser'>, prefixe: string) {
  for (const [i, v] of issues.entries()) {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: concept, batchId: lotId, variantCode: `${prefixe}${i + 1}`, status: 'done', hypothesis: `Si on teste ${prefixe}${i + 1}, alors le coût par achat baisse.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, v);
  }
}
const FIL: Record<Cle, 'commentaire' | 'note'> = { C: 'commentaire', I: 'commentaire', S: 'commentaire', T: 'commentaire', NC: 'note', NI: 'note', X: 'commentaire' };

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  await db.update(schema.users).set({ name: 'Anne Propriétaire' }).where(eq(schema.users.id, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · sept créations retenues, testées, gagnantes arbitrées (le plan d'itération propose chacune une fois).
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · itérer depuis la gagnante' })).projectId;
  const sorties: string[] = [];
  for (const n of [4, 3]) {
    const job = await lancerLot(db, ctxDe(ids, 'ua'), S.P1, KEYFRAMES(n));
    await executer(db, job);
    const s = await sortiesDuJob(db, job);
    for (let i = 1; i <= n; i += 1) sorties.push(s[`keyframe:s${i}`]!);
  }
  for (const [i, k] of CLES.entries()) {
    const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: sorties[i]! });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: v.variante.id, saisie: saisieTest() });
    if (!l.ok) throw new Error(`rattacher ${l.code}`);
    await verdict(l.lien.adsmapAdId, 'winner');
    Object.assign(S.assets, { [k]: sorties[i]! }); Object.assign(S.variantes, { [k]: v.variante.id }); Object.assign(S.pubs, { [k]: l.lien.adsmapAdId });
  }
  // ── Résultats (A1) · une référence (6 sur 12).
  const ref = await chaine('Crème');
  const R = await lot('Référence de la marque');
  await remplir(ref, R.id, [...Array(6).fill('winner'), ...Array(6).fill('loser')], 'R');
  await plan();

  // ── Les fils · par les VRAIES actions · un commentaire par création C, I, S, T, X · une note sur la création NC, NI.
  for (const k of CLES) {
    if (FIL[k] === 'commentaire') {
      const texte = `Il faudrait essayer une autre accroche · piste ${k}.`;
      const r = await commenterProjet({ projectId: S.P1, cible: 'creation', cibleId: S.assets[k], texte });
      if (!r.ok) throw new Error(`commenter ${JSON.stringify(r)}`);
      S.fils[k] = r.commentaires.find((c) => c.texte === texte)!.id;
    } else {
      const texte = `Une autre accroche sur ce nœud · piste ${k}.`;
      const r = await noterNoeudLignee({ projectId: S.P1, noeud: `creation:${S.variantes[k]}`, texte });
      if (!r.ok) throw new Error(`noter ${JSON.stringify(r)}`);
      S.fils[k] = r.notes.find((n) => n.texte === texte)!.id;
    }
  }
  // ── Les itérations nées des fils · la VRAIE action (provenance relue) · X reste la gagnante témoin, jamais itérée.
  for (const k of CLES.filter((x) => x !== 'X')) {
    const parentAdId = S.pubs[k];
    const r = await creerIterationChoisieAction({
      parentAdId, variable: admise[parentAdId]!, valeur: `Une accroche douleur, piste ${k}`, hypothese: `Si on change l’accroche ${k}, alors le coût par achat baisse, parce que le fil l’a vu.`,
      [FIL[k]]: FIL[k] === 'commentaire' ? { commentaireId: S.fils[k], projetId: S.P1 } : { noteId: S.fils[k], projetId: S.P1 },
    });
    if (!r.ok) throw new Error(`itérer ${r.error}`);
    expect(r.provenance, `la provenance du fil ${k} n’est pas posée`).toBe(FIL[k]);
    S.iterations[k] = r.adId;
  }
}, 240_000);

/** Le plan d'itération RÉEL · les variables admises de chaque gagnante qui y est. */
async function plan() {
  const p = variablesDuPlan((await iterationPlanAction()).view!.rows);
  for (const [adId, c] of Object.entries(p)) { const o = c.options.find((x) => x.admise); if (o) admise[adId] = o.variable; }
}

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
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
}
async function cliquer(el: Element | null, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(el: HTMLTextAreaElement | HTMLInputElement, valeur: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const iterer = (sp: Record<string, string>) => IterationSpatiale({ searchParams: Promise.resolve(sp) });
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const lignee = async () => ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(LIGNEE) });
async function fiche() {
  const r = await chargerProjet(h.session as never, S.P1);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return dom(renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="activite" />)));
}
const commentaire = (d: ParentNode, k: Cle) => d.querySelector(`[data-commentaire="${S.fils[k]}"]`);
const noteListe = (d: ParentNode, k: Cle) => d.querySelector(`[data-notes-panneau="liste:creation:${S.variantes[k]}"] [data-note="${S.fils[k]}"]`);
const noteDetail = (d: ParentNode, k: Cle) => d.querySelector(`[data-notes-panneau="detail:creation:${S.variantes[k]}"] [data-note="${S.fils[k]}"]`);
const geste = (n: Element | null) => n?.querySelector('[data-geste="iterer-gagnante"]') ?? null;
const lien = (k: Cle) => lienIterationGagnante(FIL[k], { id: S.fils[k], projetId: S.P1, adId: S.iterations[k] })!;
async function codeDe(adId: string) {
  const [a] = await db.select({ c: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId));
  return a!.c;
}
/** Toutes les lignes que l'affichage pourrait toucher · comparées en entier avant / après. */
async function lignes() {
  const t = async (x: unknown) => (await db.select().from(x as typeof schema.ads)).map((l) => JSON.stringify(l)).sort();
  return {
    commentaires: await t(schema.studioComments), notes: await t(schema.studioLineageNotes), ads: await t(schema.ads), verdicts: await t(schema.verdicts),
    lots: await t(schema.batches), aretes: await t(schema.iterationEdges), notifications: await t(schema.notifications), audit: await t(schema.studioAuditEvents),
    depense: await t(schema.aiSpend), credits: await t(schema.creditLedger), jobs: await t(schema.studioJobs),
  };
}
/** Un geste fermé · un bouton aria-disabled, sa raison écrite à côté (`aria-describedby`). */
function ferme(d: ParentNode, b: Element | null) {
  const x = b as HTMLButtonElement | null;
  return [x?.tagName ?? null, x?.getAttribute('aria-disabled') ?? null, x?.textContent ?? null, x ? d.querySelector(`#${CSS.escape(x.getAttribute('aria-describedby')!)}`)?.textContent ?? null : null];
}

/* ───────────────────────────── 1 · avant la conclusion ───────────────────────────── */

describe('avant la conclusion des lots · « en test » partout · aucun bouton', () => {
  it('la fiche (Activité) et la lignée · aucune gagnante à itérer', async () => {
    const d = await fiche();
    for (const k of ['C', 'I', 'S', 'T'] as const) expect(commentaire(d, k)!.querySelector('[data-resultat-commentaire]')?.getAttribute('data-resultat-commentaire'), `${k} n’est pas en test`).toBe('en_test');
    expect(d.querySelector('[data-iterer-gagnante]'), 'un bouton avant la conclusion').toBeNull();
    const l = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    expect(noteListe(l, 'NC')!.querySelector('[data-resultat-note]')?.getAttribute('data-resultat-note')).toBe('en_test');
    expect(l.querySelector('[data-iterer-gagnante]'), 'un bouton sous une note en test').toBeNull();
  });
});

/* ───────────────────────────── 2 · les lots se concluent ───────────────────────────── */

describe('les lots se concluent · « Itérer depuis la gagnante » sous le résultat CONFIRMÉ seulement · sous le commentaire ET sous la note', () => {
  it('confirmée · un lien vers l’écran Itérer parti de la gagnante · infirmée, sans conclusion, en test · rien · afficher n’écrit rien', async () => {
    const concept = await chaine('Crème itérée');
    S.lots.C = await lot('Itération confirmée'); S.lots.I = await lot('Itération infirmée'); S.lots.S = await lot('Itération sans conclusion');
    await remplir(concept, S.lots.C.id, ['winner', 'winner', 'winner', 'winner'], 'C');
    await remplir(concept, S.lots.I.id, ['loser', 'loser', 'loser', 'loser'], 'I');
    await remplir(concept, S.lots.S.id, ['winner', 'loser', 'loser'], 'S');
    for (const [k, l] of [['C', S.lots.C], ['NC', S.lots.C], ['I', S.lots.I], ['NI', S.lots.I], ['S', S.lots.S]] as const) await db.update(schema.ads).set({ batchId: l.id, status: 'done' }).where(eq(schema.ads.id, S.iterations[k]));
    for (const k of ['C', 'NC', 'S'] as const) await verdict(S.iterations[k], 'winner');
    for (const k of ['I', 'NI'] as const) await verdict(S.iterations[k], 'loser');

    const avant = await lignes();
    const d = await fiche();
    const statut = (k: Cle) => commentaire(d, k)!.querySelector('[data-resultat-commentaire]')?.getAttribute('data-resultat-commentaire');
    expect((['C', 'I', 'S', 'T'] as const).map(statut), 'les quatre issues').toEqual(['confirmee', 'infirmee', 'sans_conclusion', 'en_test']);
    const a = geste(commentaire(d, 'C'));
    expect([a?.tagName, a?.getAttribute('href'), a?.textContent], 'sous le commentaire confirmé').toEqual(['A', lien('C'), LIBELLE_ITERER_GAGNANTE]);
    expect(a?.getAttribute('href'), 'l’adresse ne part pas de la gagnante').toBe(`/studio/iterer?commentaire=${S.fils.C}&projet=${S.P1}&gagnante=${S.iterations.C}`);
    expect(a?.closest('[data-resultat-commentaire]')?.getAttribute('data-resultat-commentaire'), 'le bouton n’est pas sous le résultat confirmé').toBe('confirmee');
    for (const k of ['I', 'S', 'T'] as const) expect(geste(commentaire(d, k)), `un bouton sous « ${statut(k)} »`).toBeNull();
    expect(d.querySelectorAll('[data-iterer-gagnante]').length, 'un bouton de trop dans la fiche').toBe(1);

    const l = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    const b = geste(noteListe(l, 'NC'));
    expect([b?.tagName, b?.getAttribute('href'), b?.textContent], 'sous la note confirmée (liste)').toEqual(['A', lien('NC'), LIBELLE_ITERER_GAGNANTE]);
    expect(noteListe(l, 'NI')!.querySelector('[data-resultat-note]')?.getAttribute('data-resultat-note')).toBe('infirmee');
    expect(geste(noteListe(l, 'NI')), 'un bouton sous la note infirmée').toBeNull();
    expect(await lignes(), 'afficher a écrit').toEqual(avant);
  });

  it('le détail du nœud · monté, ouvert par l’indicateur de notes · le même lien · la note infirmée n’en a pas', async () => {
    await monter(await lignee());
    await cliquer(document.querySelector(`[data-ouvrir-notes="creation:${S.variantes.NC}"]`), 'l’indicateur de notes de NC');
    await vi.waitFor(() => expect(noteDetail(document, 'NC'), 'la note NC n’est pas dans le détail').toBeTruthy());
    const a = geste(noteDetail(document, 'NC'));
    expect([a?.tagName, a?.getAttribute('href')], 'sous la note confirmée (détail)').toEqual(['A', lien('NC')]);
    await cliquer(document.querySelector(`[data-ouvrir-notes="creation:${S.variantes.NI}"]`), 'l’indicateur de notes de NI');
    await vi.waitFor(() => expect(noteDetail(document, 'NI')).toBeTruthy());
    expect(geste(noteDetail(document, 'NI')), 'un bouton sous la note infirmée (détail)').toBeNull();
  });
});

/* ───────────────────────────── 3 · les portes ───────────────────────────── */

describe('les portes · autre marque active, Résultats fermé, rôle · l’idiome existant', () => {
  it('autre marque active · fermé, sa raison écrite à côté (comme « Voir le lot ») · sous le commentaire et sous la note', async () => {
    h.marque = ids.brandA2;
    const d = await fiche();
    expect(ferme(d, geste(commentaire(d, 'C'))), 'sous le commentaire · pas fermé avec sa raison écrite à côté').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE]);
    expect(commentaire(d, 'C')!.querySelector('button[data-lien-lot]')?.getAttribute('aria-disabled'), '« Voir le lot » n’est plus fermé').toBe('true');
    const l = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    expect(ferme(l, geste(noteListe(l, 'NC'))), 'sous la note · pas fermé avec sa raison écrite à côté').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_GAGNANTE_AUTRE_MARQUE]);
    expect(l.querySelector('a[data-iterer-gagnante]'), 'un lien ouvert hors de la marque active').toBeNull();
  });

  it('Résultats fermé par la formule · aucun résultat, aucun bouton · le lecteur client · la fiche elle-même lui est fermée', async () => {
    h.session = proprietaire({ plan: 'core' });
    const d = await fiche();
    expect(commentaire(d, 'C'), 'le commentaire n’est pas lu').toBeTruthy();
    expect(d.querySelector('[data-resultats-commentaire]'), 'un résultat sans Résultats').toBeNull();
    expect(d.querySelector('[data-iterer-gagnante]'), 'un bouton sans Résultats').toBeNull();
    const l = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    expect(noteListe(l, 'NC'), 'la note n’est pas lue').toBeTruthy();
    expect(l.querySelector('[data-iterer-gagnante]'), 'un bouton sous une note sans Résultats').toBeNull();
    h.session = session(ids, 'uv', { plan: 'plus' });
    const r = await chargerProjet(h.session as never, S.P1);
    expect(r.ok, 'le lecteur client ouvre la fiche').toBe(false);
  });

  it('Résultats ouvert par l’équipe, rôle d’espace sans `studio.propose` · fermé avec la raison du rôle', async () => {
    h.session = session(ids, 'uv', { plan: 'plus', equipe: sessionEquipeTest({ role: 'adminplus', matrice: {}, plateformeAdmissible: true }) as SessionTest['equipe'] });
    const d = await fiche();
    expect(commentaire(d, 'C')!.querySelector('[data-resultat-commentaire]')?.getAttribute('data-resultat-commentaire'), 'le résultat n’est pas dit').toBe('confirmee');
    expect(ferme(d, geste(commentaire(d, 'C'))), 'sous le commentaire · pas fermé avec sa raison écrite à côté').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_ROLE_ITERATION]);
    const l = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    expect(ferme(l, geste(noteListe(l, 'NC'))), 'sous la note · pas fermé avec sa raison écrite à côté').toEqual(['BUTTON', 'true', LIBELLE_ITERER_GAGNANTE, RAISON_ROLE_ITERATION]);
  });
});

/* ───────────────────────────── 4 · le geste ───────────────────────────── */

describe('le geste · l’écran Itérer EXISTANT, la gagnante présélectionnée · l’itération créée porte la provenance du fil', () => {
  for (const k of ['C', 'NC'] as const) {
    it(`${FIL[k]} · la gagnante présélectionnée, la variable du plan · rien avant le clic · créée · provenance du fil + gagnante · « née de la gagnante » sous le fil`, async () => {
      await plan();
      const gagnante = S.iterations[k];
      expect(admise[gagnante], 'préalable · la gagnante n’est pas dans le plan d’itération').toBeTruthy();
      // Le plan de la marque a plus de gagnantes que l'écran n'en montre · la gagnante est au-delà des plus urgentes, gardée quand même (`garder`).
      const rang = [...new Set((await iterationPlanAction()).view!.rows.map((r) => r.adId))].indexOf(gagnante);
      expect(rang, 'préalable · la gagnante est parmi les plus urgentes, `garder` n’est pas éprouvé').toBeGreaterThanOrEqual(MAX_CHOIX_ITERATION);
      const avant = await lignes();
      await monter(await iterer(params(lien(k))));
      expect(pubChoisie(), 'la pub présélectionnée n’est pas la gagnante').toEqual([gagnante]);
      const code = await codeDe(gagnante);
      expect(document.querySelector('[data-note-commentaire]')?.textContent).toBe(`Itération depuis la gagnante ${code}, confirmée et née ${k === 'C' ? 'de ce commentaire' : 'de cette note'} · la variable proposée est celle du plan, modifiable · la nouvelle itération gardera la provenance ${k === 'C' ? 'de ce commentaire' : 'de cette note'}. Rien n’est créé sans ton clic sur « Créer l’itération ».`);
      expect(document.body.textContent, 'le texte du fil repris comme hypothèse').not.toContain(`piste ${k}.`);
      await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
      expect(coche(), 'la variable du plan n’est pas cochée').toEqual([admise[gagnante]]);
      await saisir(document.querySelector('[data-champ="valeur"]') as HTMLInputElement, 'Une valeur nouvelle et précise');
      expect(await lignes(), 'rien de créé avant le clic').toEqual(avant);
      await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
      let arete: { childAdId: string } | undefined;
      for (let i = 0; i < 80 && !arete; i += 1) {
        [arete] = await db.select({ childAdId: schema.iterationEdges.childAdId }).from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, gagnante));
        if (!arete) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      }
      expect(arete, 'aucune itération depuis la gagnante').toBeTruthy();
      const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, arete!.childAdId));
      const ref = enfant!.sourceRef as Record<string, unknown>;
      if (k === 'C') {
        expect(ref.commentaire, 'la provenance du commentaire et la gagnante').toEqual({ commentaireId: S.fils.C, projetId: S.P1, gagnanteAdId: gagnante });
        expect(lireProvenanceCommentaire(ref)).toEqual({ commentaireId: S.fils.C, projetId: S.P1 });
        expect(lireProvenanceNote(ref)).toBeNull();
      } else {
        expect(ref.note, 'la provenance de la note et la gagnante').toEqual({ noteId: S.fils.NC, projetId: S.P1, gagnanteAdId: gagnante });
        expect(lireProvenanceCommentaire(ref)).toBeNull();
      }
      expect(lireGagnanteDuFil(ref, FIL[k])).toBe(gagnante);
      expect(JSON.stringify(ref), 'le texte du fil recopié').not.toContain('piste');
      const apres = await lignes();
      expect([apres.ads.length - avant.ads.length, apres.aretes.length - avant.aretes.length, apres.depense, apres.credits, apres.jobs], 'une itération, une arête, 0 $')
        .toEqual([1, 1, avant.depense, avant.credits, avant.jobs]);

      // Sous le fil · la nouvelle itération, en test, « née de la gagnante » · la gagnante garde son résultat et son bouton.
      act(() => { root?.unmount(); }); root = null;
      const d = k === 'C' ? await fiche() : dom(renderToStaticMarkup(avecSpatial(await lignee())));
      const fil = k === 'C' ? commentaire(d, 'C') : noteListe(d, 'NC');
      const attr = k === 'C' ? 'data-resultat-commentaire' : 'data-resultat-note';
      const nouvelle = [...fil!.querySelectorAll(`[${attr}="en_test"]`)].find((x) => x.textContent!.includes(enfant!.variantCode));
      expect(nouvelle?.querySelector('[data-nee-de-gagnante]')?.textContent, 'la nouvelle itération ne dit pas d’où elle part').toBe(`, ${phraseNeeDeGagnante(code)}`);
      expect(nouvelle?.textContent).toBe(`Itération en test ${enfant!.variantCode}, ${phraseNeeDeGagnante(code)} · son résultat se lira ici quand son lot sera conclu`);
      expect(fil!.querySelectorAll(`[${attr}="confirmee"]`).length, 'la gagnante a perdu son résultat').toBe(1);
    });
  }
});

/* ───────────────────────────── 5 · forgé ───────────────────────────── */

describe('forgé · une gagnante qui n’en est pas une · refus · l’action ne pose rien', () => {
  it('l’écran · une itération INFIRMÉE de ce fil, la gagnante d’un AUTRE fil, une adresse mal formée · refus, rien de présélectionné', async () => {
    const avant = await lignes();
    const cas: Array<[Record<string, string>, string]> = [
      [params(lienIterationGagnante('commentaire', { id: S.fils.I, projetId: S.P1, adId: S.iterations.I })!), REFUS_GAGNANTE.commentaire],
      [params(lienIterationGagnante('commentaire', { id: S.fils.S, projetId: S.P1, adId: S.iterations.C })!), REFUS_GAGNANTE.commentaire],
      [params(lienIterationGagnante('note', { id: S.fils.NI, projetId: S.P1, adId: S.iterations.NC })!), REFUS_GAGNANTE.note],
      [{ ...params(lien('C')), gagnante: 'V7' }, 'Ce commentaire n’est pas lisible avec ta marque active et tes droits · rien n’est présélectionné.'],
    ];
    for (const [sp, phrase] of cas) {
      await monter(await iterer(sp));
      expect(document.querySelector('[data-note-commentaire]')?.textContent, JSON.stringify(sp)).toBe(phrase);
      expect(pubChoisie(), `une pub présélectionnée · ${JSON.stringify(sp)}`).toEqual([]);
    }
    expect(await lignes(), 'l’écran a écrit').toEqual(avant);
  });

  it('l’action · la gagnante témoin (dans le plan, née d’aucun fil) avec la provenance du commentaire S · créée ordinaire, sans provenance', async () => {
    await plan();
    const r = await creerIterationChoisieAction({
      parentAdId: S.pubs.X, variable: admise[S.pubs.X]!, valeur: 'Une valeur témoin', hypothese: 'Si on change le témoin, alors le coût par achat baisse, parce que.',
      commentaire: { commentaireId: S.fils.S, projetId: S.P1, gagnanteAdId: S.pubs.X },
    });
    expect([r.ok, r.ok && r.provenance], 'une provenance posée sur une pub qui n’est ni la pub du fil ni sa gagnante').toEqual([true, null]);
    const [enfant] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, (r as { adId: string }).adId));
    expect(JSON.stringify(enfant!.s ?? {}), 'la gagnante forgée par le client a été recopiée').not.toMatch(/gagnanteAdId|commentaire/);
  });
});

/* ───────────────────────────── 6 · égalité ───────────────────────────── */

describe('égalité · un fil SANS résultat confirmé rend la capture de main, octet pour octet', () => {
  it('l’onglet Activité et « Notes sans nœud » · les gestes calculés par la VRAIE règle (aucun) · strictement la capture', () => {
    const R = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/resultat-commentaire-avant.json'), 'utf8')) as { ouvert: ResultatFil[]; autreMarque: ResultatFil[] };
    const sans = (l: ResultatFil[]) => l.filter((r) => r.etat !== 'conclue' || r.statut !== 'confirmee');
    // La vraie règle, sur des itérations GAGNANTES arbitrées · rien n'est confirmé · aucun geste.
    const regle = (fil: 'commentaire' | 'note', l: ResultatFil[], marqueActive: boolean) =>
      gestesGagnantesFil(fil, l, l.map((r) => ({ adId: r.adId, variante: r.variante, lot: null, conclusion: null, verdict: { validated: 'winner', comparable: true } })), { id: S.fils.C, projetId: S.P1, marqueActive, peutIterer: true });
    for (const l of [R.ouvert, R.autreMarque]) expect(Object.keys(regle('commentaire', sans(l), true)), 'un geste sous un résultat non confirmé').toEqual([]);
    // Témoin · la même règle propose bien le geste sous le résultat confirmé de la capture (identifiants rendus bien formés).
    const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    expect(Object.values(regle('commentaire', R.ouvert.map((r, i) => ({ ...r, adId: uuid(i) })), true)).map((g) => g.libelle), 'la règle ne propose rien sous le résultat confirmé').toEqual([LIBELLE_ITERER_GAGNANTE]);

    const gestes = { modifier: { ok: true, raison: null }, resoudre: { ok: true, raison: null }, rouvrir: { ok: false, raison: 'x' } };
    const vide = (g: Record<string, unknown>) => (Object.keys(g).length ? { gagnantes: g } : {});
    const base = (id: string, resultats: ResultatFil[], iterer: unknown, marqueActive: boolean) => ({
      id, cible: { type: 'creation', id: 'a1', libelle: 'Lot 1 · Création 1' }, auteur: 'Anne', quand: '09/11/2026 · 10:00', texte: `Texte ${id}`,
      segments: [{ type: 'texte', texte: `Texte ${id}` }], modifie: null, resolu: null, gestes, iterer, resultats, ...vide(regle('commentaire', resultats, marqueActive)), rowVersion: 1,
    });
    const ouvert = { libelle: 'Itérer depuis ce commentaire', href: '/studio/iterer?commentaire=c&projet=p', raison: null };
    const fermeG = { libelle: 'Itérer depuis ce commentaire', href: null, raison: 'Ce projet n’est pas dans ta marque active · ouvre sa marque pour itérer depuis ce commentaire.' };
    const liste = { cibles: [{ cle: 'creation:a1', type: 'creation', id: 'a1', libelle: 'Lot 1 · Création 1' }], peutCommenter: true, mentionnables: [],
      commentaires: [base('k0', [], null, true), base('k1', sans(R.ouvert), ouvert, true), base('k2', sans(R.autreMarque), fermeG, false)] };
    const activite = renderToStaticMarkup(avecSpatial(<OngletActivite projectId="p1" journal={{ ok: false, message: 'Journal indisponible.' }} commentaires={{ ok: true, liste } as never} />));
    const note = (id: string, resultats: ResultatFil[], iterer: unknown, marqueActive: boolean) => ({
      id, noeud: 'creation:v1', libelleNoeud: 'Création 1', auteur: 'Anne', quand: '09/11/2026 · 10:00', texte: `Note ${id}`, modifie: null, anciens: [], resolu: null,
      gestes, rowVersion: 1, segments: [{ type: 'texte', texte: `Note ${id}` }], iterer, hypothese: null, resultats, ...vide(regle('note', resultats, marqueActive)), hypotheses: [],
    });
    const notes = [note('n0', [], null, true), note('n1', sans(R.ouvert), { ...ouvert, libelle: 'Itérer depuis cette note' }, true), note('n2', sans(R.autreMarque), { ...fermeG, libelle: 'Itérer depuis cette note' }, false)];
    const ctl = { projectId: 'p1', vue: { peutEcrire: true, notes, mentionnables: [] }, erreur: null, retour: null, enCours: null, horsLigne: false, geste: () => {} } as unknown as ControleNotes;
    const sansNoeud = renderToStaticMarkup(avecSpatial(<NotesSansNoeud notes={notes as never} ctl={ctl} />));
    const avant = readFileSync(join(__dirname, 'fixtures/fils-sans-confirmee-avant.html'), 'utf8');
    const html = `${activite}\n${sansNoeud}\n`;
    expect(html.length, 'le rendu d’un fil sans résultat confirmé a changé de taille').toBe(avant.length);
    expect(html, 'le rendu d’un fil sans résultat confirmé a changé').toBe(avant);
  });
});
