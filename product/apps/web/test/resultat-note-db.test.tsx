// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Le résultat de l'itération sous la NOTE qui l'a fait naître (suite du lot 11
 * V5) · base RÉELLE (pglite, migrations du dépôt), VRAIES actions (gardes
 * relues · session, rôle, marque active, portée de marque), VRAIE page du
 * canvas de lignée rendue (« La lignée en liste », « Notes sans nœud ») puis
 * MONTÉE (le détail du nœud, ouvert par l'indicateur de notes) · on lit le DOM
 * et ce qui est écrit.
 *
 *  · note → « Itérer depuis cette note » (la vraie action, provenance relue) →
 *    « en test » → lot conclu · confirmée, infirmée, sans conclusion · la
 *    pastille, le chiffre clé et « Voir le lot #n » · dans le détail du nœud,
 *    dans la liste et dans « Notes sans nœud » · rien sans itération ;
 *  · note de brief → « Formuler une hypothèse » (la vraie action, origine
 *    relue) → le statut de SA carte, de « À formuler » à « Conclue » ;
 *  · rien n'est écrit pour l'afficher (lignes identiques avant / après) ;
 *  · une provenance d'un autre projet, ou d'une ad d'une autre marque, n'est
 *    jamais rattachée · autre marque active · le lien fermé avec sa raison ·
 *    Résultats fermé · rien ;
 *  · ÉGALITÉ · le rendu des commentaires est, octet pour octet, celui d'avant
 *    la généralisation (capture faite sur main avant le changement,
 *    `fixtures/commentaires-resultat-avant.html`) · et la note rend le MÊME
 *    résultat que le commentaire, seuls les attributs de lecture nomment le fil.
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 * Aucune date « à venir » · les lots sont lancés il y a 30 jours, le lot « en
 * diffusion » il y a 2 jours, par rapport à l'horloge réelle.
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
import { PHRASE_ITERATION_EN_TEST, RAISON_HYPOTHESES_AUTRE_MARQUE, RAISON_LOT_AUTRE_MARQUE, lireOrigineHypothese, lireProvenanceNote, variablesDuPlan, type TestedVariable } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { lireNotesLignee, noterNoeudLignee } from '../app/actions/studios/notes-lignee';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import { OngletActivite } from '../spatial/vues/projet/OngletActivite';
import { ResultatsFil } from '../spatial/vues/projet/ResultatsFil';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
type Cle = 'C' | 'I' | 'S' | 'T' | 'O';
const CLES: readonly Cle[] = ['C', 'I', 'S', 'T', 'O'];
const S = {
  P1: '', P2: '', v1: '', varA2: '',
  variantes: {} as Record<Cle, string>, gagnantes: {} as Record<Cle, string>, notes: {} as Record<Cle, string>, iterations: {} as Record<Cle, string>,
  lots: {} as Record<'C' | 'I' | 'S' | 'T' | 'H', { id: string; n: number }>,
  nRien: '', nBrief: '', nP2: '', hyp: '', conceptA1: '',
};
const proprietaire = (o: Partial<SessionTest> = {}): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus', ...o });
const admise: Record<string, TestedVariable> = {};

async function chaine(brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
let numero = 20;
async function lot(brandId: string, goal: string, joursDepuisLancement = 30) {
  numero += 1;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId, number: numero, goal, status: 'testing', launchedAt: new Date(Date.now() - joursDepuisLancement * 86_400_000) }).returning({ id: schema.batches.id });
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
async function variantes(projectId: string, n: number) {
  const job = await lancerLot(db, ctxDe(ids, 'ua'), projectId, KEYFRAMES(n));
  await executer(db, job);
  const s = await sortiesDuJob(db, job);
  const out: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: s[`keyframe:s${i}`]! });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    out.push(v.variante.id);
  }
  return out;
}
async function noter(projectId: string, noeud: string, texte: string) {
  const r = await noterNoeudLignee({ projectId, noeud, texte });
  if (!r.ok) throw new Error(`noter ${JSON.stringify(r)}`);
  return r.notes.find((n) => n.texte === texte && n.noeud === noeud)!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  await db.update(schema.users).set({ name: 'Anne Propriétaire' }).where(eq(schema.users.id, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · cinq créations retenues, testées, gagnantes arbitrées (une itération par gagnante).
  const p1 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · résultat sous la note' });
  S.P1 = p1.projectId; S.v1 = p1.versionId;
  const vs = [...await variantes(S.P1, 4), ...await variantes(S.P1, 1)];
  for (const [i, k] of CLES.entries()) {
    S.variantes[k] = vs[i]!;
    const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: vs[i]!, saisie: saisieTest() });
    if (!l.ok) throw new Error(`rattacher ${l.code}`);
    await verdict(l.lien.adsmapAdId, 'winner');
    S.gagnantes[k] = l.lien.adsmapAdId;
  }
  // ── P2 (A1) · un AUTRE projet de la même marque, une note sur une création.
  S.P2 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Autre projet A1' })).projectId;
  const [q] = await variantes(S.P2, 1);

  // ── Résultats (A1) · une référence (6 sur 12).
  S.conceptA1 = await chaine(ids.brandA1, 'Crème');
  const R = await lot(ids.brandA1, 'Référence de la marque');
  await remplir(S.conceptA1, R.id, [...Array(6).fill('winner'), ...Array(6).fill('loser')], 'R');
  const plan = variablesDuPlan((await iterationPlanAction()).view!.rows);
  for (const k of CLES) {
    const choix = plan[S.gagnantes[k]];
    if (!choix) throw new Error('préalable · une gagnante du projet n’est pas dans le plan d’itération');
    admise[S.gagnantes[k]] = choix.options.find((o) => o.admise)!.variable;
  }

  // ── Les notes · par la VRAIE action, sur les nœuds de la lignée relue.
  for (const k of CLES) S.notes[k] = await noter(S.P1, `creation:${S.variantes[k]}`, `Il faudrait essayer une autre accroche · piste ${k}.`);
  S.nRien = await noter(S.P1, `resultat:${S.variantes.C}`, 'Rien à itérer ici, la création tient.');
  S.nBrief = await noter(S.P1, `brief:${S.v1}`, 'Si on montre la texture en gros plan, alors le taux de clic monte, parce que le concurrent le fait.');
  S.nP2 = await noter(S.P2, `creation:${q}`, 'Une note d’un autre projet.');
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

let root: Root | null = null;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const lignee = async (projectId = S.P1) => ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve(LIGNEE) });
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
async function rendue() { const html = renderToStaticMarkup(avecSpatial(await lignee())); return { d: dom(html), html }; }
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
const creation = (k: Cle) => `creation:${S.variantes[k]}`;
/** La note dans un panneau · `liste:<nœud>`, `detail:<nœud>` ou `sans-noeud`. */
const note = (d: ParentNode, lieu: string, noteId: string) => d.querySelector(`[data-notes-panneau="${lieu}"] [data-note="${noteId}"]`);
const resultats = (n: Element | null) => n?.querySelector('[data-resultats-note]') ?? null;
function lu(n: Element | null) {
  return [...(n?.querySelectorAll('[data-resultat-note]') ?? [])].map((r) => ({
    statut: r.getAttribute('data-resultat-note'), pastille: r.querySelector('.pill')?.textContent ?? '',
    chiffre: r.querySelector('[data-chiffre-resultat]')?.textContent ?? null, lien: r.querySelector('a[data-lien-lot]')?.getAttribute('href') ?? null,
  }));
}
async function codeDe(adId: string) {
  const [a] = await db.select({ c: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId));
  return a!.c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function iterer(k: Cle, valeur: string) {
  const parentAdId = S.gagnantes[k];
  const r = await creerIterationChoisieAction({
    parentAdId, variable: admise[parentAdId]!, valeur, hypothese: `Si on change ${valeur}, alors le coût par achat baisse, parce que la note l’a vu.`,
    note: { noteId: S.notes[k], projetId: S.P1 },
  });
  if (!r.ok) throw new Error(`itérer ${r.error}`);
  expect(r.provenance, 'la provenance « Note de la lignée » n’est pas posée').toBe('note');
  return r.adId;
}
/** Toutes les lignes que l'affichage pourrait toucher · comparées en entier avant / après. */
async function lignes() {
  const t = async (x: unknown) => (await db.select().from(x as typeof schema.ads)).map((l) => JSON.stringify(l)).sort();
  return {
    notes: await t(schema.studioLineageNotes), ads: await t(schema.ads), verdicts: await t(schema.verdicts), lots: await t(schema.batches),
    notifications: await t(schema.notifications), audit: await t(schema.studioAuditEvents), aretes: await t(schema.iterationEdges),
    depense: await t(schema.aiSpend), credits: await t(schema.creditLedger),
  };
}

/* ───────────────────────────── 1 · « en test » ───────────────────────────── */

describe('le résultat d’une itération née d’une note · calculé depuis la conclusion de son lot, sous la note d’origine', () => {
  it('note sans itération · rien · itérations créées par la VRAIE action, hors lot · « en test » dans la liste, aucun statut ni chiffre', async () => {
    const avant = await rendue();
    for (const k of CLES) expect(resultats(note(avant.d, `liste:${creation(k)}`, S.notes[k])), `un résultat sans itération (${k})`).toBeNull();

    for (const k of CLES) S.iterations[k] = await iterer(k, `Une accroche douleur, piste ${k}`);
    const [ad] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, S.iterations.C));
    expect(lireProvenanceNote(ad!.s)).toEqual({ noteId: S.notes.C, projetId: S.P1 });

    const { d, html } = await rendue();
    expect(resultats(note(d, `liste:resultat:${S.variantes.C}`, S.nRien)), 'un résultat sur la note sans itération').toBeNull();
    for (const k of CLES) {
      const r = resultats(note(d, `liste:${creation(k)}`, S.notes[k]));
      expect(lu(note(d, `liste:${creation(k)}`, S.notes[k])).map((x) => x.statut), `l’itération de ${k} n’est pas « en test »`).toEqual(['en_test']);
      expect(r!.textContent).toMatch(new RegExp(`^Itération en test ${await codeDe(S.iterations[k])} · ${PHRASE_ITERATION_EN_TEST}$`));
    }
    expect(html, 'un statut avant la conclusion').not.toMatch(/Itération (confirmée|infirmée|sans conclusion)|data-chiffre-resultat|data-lien-lot/);
  });
});

/* ───────────────────────────── 2 · les lots se concluent ───────────────────────────── */

describe('les lots se concluent · confirmée, infirmée, sans conclusion · dans la liste, dans le détail du nœud et dans « Notes sans nœud »', () => {
  it('« La lignée en liste » · la pastille, le chiffre clé et « Voir le lot #n » · « en test » tant que son lot ne l’est pas · rien n’est écrit pour l’afficher', async () => {
    const c = await chaine(ids.brandA1, 'Crème itérée');
    const C = await lot(ids.brandA1, 'Itération C'); const I = await lot(ids.brandA1, 'Itération I'); const Sx = await lot(ids.brandA1, 'Itération S');
    const T = await lot(ids.brandA1, 'Itération T · en diffusion', 2);
    Object.assign(S.lots, { C, I, S: Sx, T });
    await remplir(c, C.id, ['winner', 'winner', 'winner', 'winner'], 'C');
    await remplir(c, I.id, ['loser', 'loser', 'loser', 'loser'], 'I');
    await remplir(c, Sx.id, ['winner', 'loser', 'loser'], 'S');
    for (const [k, l] of [['C', C.id], ['I', I.id], ['S', Sx.id], ['T', T.id], ['O', C.id]] as const) await db.update(schema.ads).set({ batchId: l, status: 'done' }).where(eq(schema.ads.id, S.iterations[k]));
    // Le verdict de l'itération C manque encore · son lot n'est pas conclu · « en test ».
    await verdict(S.iterations.I, 'loser'); await verdict(S.iterations.S, 'winner'); await verdict(S.iterations.O, 'winner');
    const encore = await rendue();
    expect(lu(note(encore.d, `liste:${creation('C')}`, S.notes.C)).map((x) => x.statut), 'un statut avant la conclusion du lot C').toEqual(['en_test']);
    await verdict(S.iterations.C, 'winner');

    const avant = await lignes();
    const { d } = await rendue();
    const [c1] = lu(note(d, `liste:${creation('C')}`, S.notes.C));
    expect([c1!.statut, c1!.pastille, c1!.lien], 'la note C ne dit pas « Itération confirmée » et son lot').toEqual(['confirmee', 'Itération confirmée', `/adsmap/lots/${C.id}`]);
    expect(c1!.chiffre).toMatch(new RegExp(`^${await codeDe(S.iterations.C)} · lot #${C.n} · 6 gagnantes sur 6 variantes tranchées \\(\\d+ % à 100 %\\) · la marque, \\d+ sur \\d+ dans ses autres lots \\(\\d+ % à \\d+ %\\)$`));
    const [i1] = lu(note(d, `liste:${creation('I')}`, S.notes.I));
    expect([i1!.statut, i1!.pastille, i1!.lien]).toEqual(['infirmee', 'Itération infirmée', `/adsmap/lots/${I.id}`]);
    expect(i1!.chiffre).toMatch(new RegExp(`^${await codeDe(S.iterations.I)} · lot #${I.n} · 0 gagnante sur 5 variantes tranchées`));
    const [s1] = lu(note(d, `liste:${creation('S')}`, S.notes.S));
    expect([s1!.statut, s1!.pastille, s1!.lien]).toEqual(['sans_conclusion', 'Itération sans conclusion', `/adsmap/lots/${Sx.id}`]);
    expect(s1!.chiffre).toMatch(new RegExp(`^${await codeDe(S.iterations.S)} · lot #${Sx.n} · 2 gagnantes sur 4 variantes tranchées`));
    expect(lu(note(d, `liste:${creation('T')}`, S.notes.T)).map((x) => x.statut), 'le lot en diffusion · encore en test').toEqual(['en_test']);
    expect(resultats(note(d, `liste:resultat:${S.variantes.C}`, S.nRien))).toBeNull();
    // Afficher n'a rien écrit · le statut n'est ni posé ni recopié sur la note.
    expect(await lignes(), 'afficher la lignée a écrit').toEqual(avant);
    expect(JSON.stringify(avant.notes), 'un statut recopié sur une note').not.toMatch(/confirm|infirm|conclusion/);
  });

  it('le détail du nœud · monté, ouvert par l’indicateur de notes · la même pastille, le même chiffre, le même lien que la liste', async () => {
    const liste = await rendue();
    await monter(await lignee());
    const statuts: Array<string | null> = [];
    for (const k of ['C', 'I', 'S', 'T'] as const) {
      await cliquer(document.querySelector(`[data-ouvrir-notes="${creation(k)}"]`), `l’indicateur de notes de ${k}`);
      await vi.waitFor(() => expect(note(document, `detail:${creation(k)}`, S.notes[k]), `la note de ${k} n’est pas dans le détail`).toBeTruthy());
      const detail = note(document, `detail:${creation(k)}`, S.notes[k]);
      expect(lu(detail), `le détail de ${k} ne dit pas ce que dit la liste`).toEqual(lu(note(liste.d, `liste:${creation(k)}`, S.notes[k])));
      expect(resultats(detail)!.textContent).toBe(resultats(note(liste.d, `liste:${creation(k)}`, S.notes[k]))!.textContent);
      statuts.push(...lu(detail).map((x) => x.statut));
    }
    expect(statuts, 'le détail du nœud ne dit pas les quatre issues').toEqual(['confirmee', 'infirmee', 'sans_conclusion', 'en_test']);
  });

  it('« Notes sans nœud » · la variante retirée, sa note reste lisible et dit le résultat de son itération', async () => {
    await db.delete(schema.studioTestLinks).where(eq(schema.studioTestLinks.variantId, S.variantes.O));
    await db.delete(schema.studioVariants).where(eq(schema.studioVariants.id, S.variantes.O));
    const { d } = await rendue();
    expect(note(d, `liste:${creation('O')}`, S.notes.O), 'le nœud retiré est encore dans la liste').toBeNull();
    const n = note(d, 'sans-noeud', S.notes.O);
    expect(n, 'la note du nœud retiré n’est pas dans « Notes sans nœud »').toBeTruthy();
    const [o1] = lu(n);
    expect([o1!.statut, o1!.pastille, o1!.lien]).toEqual(['confirmee', 'Itération confirmée', `/adsmap/lots/${S.lots.C.id}`]);
  });
});

/* ───────────────────────────── 3 · l'hypothèse née d'une note ───────────────────────────── */

describe('une note de brief → « Formuler une hypothèse » (la vraie action) · le statut de SA carte sous la note', () => {
  const hyp = (d: ParentNode) => note(d, `liste:brief:${S.v1}`, S.nBrief)?.querySelector('[data-hypotheses-note]') ?? null;
  it('rangée · « Hypothèse · À formuler », sa phrase, « Voir les hypothèses » · puis testée et conclue · « Conclue » « Confirmée », le chiffre et le lot', async () => {
    expect(hyp((await rendue()).d), 'un statut avant l’hypothèse').toBeNull();
    const r = await creerHypotheseAction({ source: { type: 'note', noteId: S.nBrief, projetId: S.P1 }, saisie: { si: 'on montre la texture en gros plan', alors: 'le taux de clic monte' } });
    expect([r.ok, r.provenance]).toEqual([true, 'note']);
    S.hyp = r.adId!;
    const [a] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, S.hyp));
    expect(lireOrigineHypothese(a!.s)).toMatchObject({ type: 'note', noteId: S.nBrief, projetId: S.P1 });

    const un = hyp((await rendue()).d)!;
    expect(un, 'l’hypothèse née de la note n’est pas dite').toBeTruthy();
    expect(un.querySelector('[data-hypothese-de-note]')!.getAttribute('data-hypothese-de-note')).toBe('formuler');
    expect(un.querySelector('[data-colonne-hypothese]')!.textContent).toBe('Hypothèse · À formuler');
    expect(un.querySelector('[data-texte-hypothese]')!.textContent).toBe('Si on montre la texture en gros plan, alors le taux de clic monte.');
    expect([un.querySelector('a[data-lien-hypothese]')?.textContent, un.querySelector('a[data-lien-hypothese]')?.getAttribute('href')]).toEqual(['Voir les hypothèses', '/adsmap/hypotheses']);
    expect(un.querySelector('[data-conclusion-hypothese]'), 'une conclusion avant le test').toBeNull();

    // Testée dans un lot conclu (4 gagnantes sur 4) · la carte passe en « Conclue » · le résultat est celui du lot.
    const H = await lot(ids.brandA1, 'Hypothèse de la note');
    S.lots.H = H;
    await remplir(S.conceptA1, H.id, ['winner', 'winner', 'winner'], 'H');
    await db.update(schema.ads).set({ batchId: H.id, status: 'done', testedVariable: 'hook' }).where(eq(schema.ads.id, S.hyp));
    await verdict(S.hyp, 'winner');
    const avant = await lignes();
    const deux = hyp((await rendue()).d)!;
    expect(deux.querySelector('[data-hypothese-de-note]')!.getAttribute('data-hypothese-de-note')).toBe('conclue');
    expect(deux.querySelector('[data-colonne-hypothese]')!.textContent).toBe('Hypothèse · Conclue');
    expect(deux.querySelector('[data-conclusion-hypothese]')!.textContent).toBe('Confirmée');
    expect(deux.querySelector('[data-chiffre-resultat]')!.textContent).toMatch(/^4 gagnantes sur 4 variantes tranchées \(\d+ % à 100 %\) · la marque, \d+ sur \d+ dans ses autres lots/);
    expect([deux.querySelector('a[data-lien-hypothese]')?.textContent, deux.querySelector('a[data-lien-hypothese]')?.getAttribute('href')]).toEqual([`Voir le lot #${H.n}`, `/adsmap/lots/${H.id}`]);
    expect(await lignes(), 'afficher le statut a écrit').toEqual(avant);
    // Une note d'hypothèse ne dit aucune itération · une note de création, aucune hypothèse.
    expect(resultats(note((await rendue()).d, `liste:brief:${S.v1}`, S.nBrief))).toBeNull();
    expect(note((await rendue()).d, `liste:${creation('C')}`, S.notes.C)!.querySelector('[data-hypotheses-note]')).toBeNull();
  });

  it('un projet où rien d’autre n’est né · la seule hypothèse de sa note de brief est dite', async () => {
    const v2 = (await db.select({ id: schema.studioProjectVersions.id }).from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, S.P2)))[0]!.id;
    const k = await noter(S.P2, `brief:${v2}`, 'Si on montre le flacon ouvert, alors le clic monte.');
    const r = await creerHypotheseAction({ source: { type: 'note', noteId: k, projetId: S.P2 }, saisie: { si: 'on montre le flacon ouvert', alors: 'le clic monte' } });
    expect([r.ok, r.provenance]).toEqual([true, 'note']);
    const d = dom(renderToStaticMarkup(avecSpatial(await lignee(S.P2))));
    expect(note(d, `liste:brief:${v2}`, k)?.querySelector('[data-colonne-hypothese]')?.textContent, 'l’hypothèse seule née d’une note n’est pas dite').toBe('Hypothèse · À formuler');
  });
});

/* ───────────────────────────── 4 · portée ───────────────────────────── */

describe('la portée · une provenance d’un autre projet, une ad d’une autre marque · jamais rattachées · autre marque active · Résultats fermé', () => {
  it('une ad conclue qui nomme la note sous un AUTRE projet, une ad d’une AUTRE marque qui nomme la note et le projet, une note d’un autre projet · rien de plus sous la note', async () => {
    // Forgées dans les données (jamais par l'écran) · le serveur ne les poserait pas · la lecture ne doit pas les croire.
    const C = S.lots.C;
    const [faux] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: S.conceptA1, batchId: C.id, variantCode: 'FAUX1', status: 'done', hypothesis: 'Si autre projet, alors rien.', testedVariable: 'hook', sourceRef: { note: { noteId: S.notes.I, projetId: S.P2 } } }).returning({ id: schema.ads.id });
    await verdict(faux!.id, 'winner');
    const cA2 = await chaine(ids.brandA2, 'Crème A2');
    const LA2 = await lot(ids.brandA2, 'Lot A2');
    for (let i = 0; i < 4; i += 1) {
      const [x] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: cA2, batchId: LA2.id, variantCode: `SECRET_A2_${i}`, status: 'done', hypothesis: 'SECRET_A2', testedVariable: 'hook', sourceRef: i === 0 ? { note: { noteId: S.notes.I, projetId: S.P1 } } : {} }).returning({ id: schema.ads.id });
      await verdict(x!.id, 'winner');
    }
    const [p2] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: S.conceptA1, batchId: C.id, variantCode: 'FAUX2', status: 'done', hypothesis: 'Si note de P2, alors rien.', testedVariable: 'hook', sourceRef: { note: { noteId: S.nP2, projetId: S.P1 } } }).returning({ id: schema.ads.id });
    await verdict(p2!.id, 'winner');
    const { d, html } = await rendue();
    const i1 = lu(note(d, `liste:${creation('I')}`, S.notes.I));
    expect(i1.map((x) => x.statut), 'une itération forgée est rattachée à la note I').toEqual(['infirmee']);
    expect(html, 'une ad de l’autre marque est dite').not.toMatch(/SECRET_A2|FAUX/);
    expect(d.querySelectorAll('[data-resultat-note]').length, 'une itération de plus sous les notes de P1').toBe(5);
    const r = await lireNotesLignee({ projectId: S.P2 });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.notes.find((n) => n.id === S.nP2)!.resultats, 'la note de P2 dit une itération nommant P1').toEqual([]);
  });

  it('autre marque active · le résultat se dit, « Voir le lot » fermé avec sa raison · le lien de l’hypothèse aussi', async () => {
    h.marque = ids.brandA2;
    const { d } = await rendue();
    const n = note(d, `liste:${creation('C')}`, S.notes.C)!;
    expect(lu(n).map((x) => [x.statut, x.lien]), 'autre marque · le lien vers le lot est ouvert').toEqual([['confirmee', null]]);
    const b = n.querySelector('button[data-lien-lot]') as HTMLButtonElement;
    expect([b?.getAttribute('aria-disabled'), b?.textContent]).toEqual(['true', `Voir le lot #${S.lots.C.n}`]);
    expect(n.querySelector(`#${CSS.escape(b.getAttribute('aria-describedby')!)}`)?.textContent).toBe(RAISON_LOT_AUTRE_MARQUE);
    const hb = note(d, `liste:brief:${S.v1}`, S.nBrief)!.querySelector('button[data-lien-hypothese]') as HTMLButtonElement;
    expect([hb?.getAttribute('aria-disabled'), hb?.textContent], 'autre marque · le lien de l’hypothèse est ouvert').toEqual(['true', `Voir le lot #${S.lots.H.n}`]);
    expect(d.querySelector(`#${CSS.escape(hb.getAttribute('aria-describedby')!)}`)?.textContent).toBe(RAISON_LOT_AUTRE_MARQUE);
    expect(RAISON_HYPOTHESES_AUTRE_MARQUE).toMatch(/marque du projet/);
  });

  it('Résultats fermé à la personne · rien sous aucune note · ni itération, ni hypothèse', async () => {
    h.session = proprietaire({ plan: 'core' });
    const { d, html } = await rendue();
    expect(d.querySelector('[data-notes-panneau]'), 'les notes ne sont plus rendues').toBeTruthy();
    expect(d.querySelector('[data-resultats-note]'), 'Résultats fermé · un résultat est dit').toBeNull();
    expect(d.querySelector('[data-hypotheses-note]'), 'Résultats fermé · une hypothèse est dite').toBeNull();
    expect(html).not.toMatch(/Itération (confirmée|infirmée|sans conclusion|en test)|Hypothèse · (À formuler|Prête à tester|En test|Conclue)|data-lien-lot|data-lien-hypothese/);
  });
});

/* ───────────────────────────── 5 · égalité ───────────────────────────── */

describe('égalité · la généralisation ne change RIEN au rendu des commentaires · la note rend le même résultat', () => {
  // Les résultats de la capture du noyau (ouvert, autre marque) · les mêmes entrées qu'avant la généralisation.
  const R = JSON.parse(readFileSync(join(__dirname, '../../../packages/core/test/fixtures/resultat-commentaire-avant.json'), 'utf8')) as { ouvert: never[]; autreMarque: never[] };
  const gestes = { modifier: { ok: true, raison: null }, resoudre: { ok: true, raison: null }, rouvrir: { ok: false, raison: 'x' } };
  const base = (id: string, resultats: unknown[]) => ({
    id, cible: { type: 'creation', id: 'a1', libelle: 'Lot 1 · Création 1' }, auteur: 'Anne', quand: '09/11/2026 · 10:00', texte: `Texte ${id}`,
    segments: [{ type: 'texte', texte: `Texte ${id}` }], modifie: null, resolu: null, gestes, iterer: null, resultats, rowVersion: 1,
  });
  it('l’onglet Activité, commentaires avec et sans résultats (conclus, en test, lien fermé) · strictement la capture de main', () => {
    const liste = { cibles: [{ cle: 'creation:a1', type: 'creation', id: 'a1', libelle: 'Lot 1 · Création 1' }], peutCommenter: true, mentionnables: [],
      commentaires: [base('k0', []), base('k1', R.ouvert), base('k2', R.autreMarque)] };
    const html = renderToStaticMarkup(avecSpatial(<OngletActivite projectId="p1" journal={{ ok: false, message: 'Journal indisponible.' }} commentaires={{ ok: true, liste } as never} />));
    const avant = readFileSync(join(__dirname, 'fixtures/commentaires-resultat-avant.html'), 'utf8');
    // Seul écart admis depuis la capture · « Mes mentions » pose l'ANCRE STABLE de chaque commentaire (`id`, focalisable par script) · une par commentaire, retirée avant la comparaison.
    const ANCRE = / id="commentaire-(k\d)" tabindex="-1"/g;
    expect([...html.matchAll(ANCRE)].map((m) => m[1]), 'l’ancre stable de chaque commentaire manque').toEqual(['k0', 'k1', 'k2']);
    const sansAncre = html.replace(ANCRE, '');
    expect(sansAncre.length, 'le rendu des commentaires a changé de taille').toBe(avant.length);
    expect(sansAncre, 'le rendu des commentaires a changé').toBe(avant);
  });
  it('le résultat sous une note · la même pastille, le même chiffre, le même lien, la même phrase « en test » · seul le nom du fil change', () => {
    for (const r of [R.ouvert, R.autreMarque]) {
      const commentaire = renderToStaticMarkup(avecSpatial(<ResultatsFil fil="commentaire" resultats={r} />));
      const noteHtml = renderToStaticMarkup(avecSpatial(<ResultatsFil fil="note" resultats={r} />));
      expect(noteHtml).toMatch(/data-resultats-note=""/);
      expect(noteHtml, 'le rendu de la note nomme le commentaire').not.toMatch(/commentaire/);
      expect(noteHtml.replace(/data-resultats-note/g, 'data-resultats-commentaire').replace(/data-resultat-note/g, 'data-resultat-commentaire').replace(/lot-resultat-note/g, 'lot-resultat-commentaire'))
        .toBe(commentaire);
    }
  });
});
