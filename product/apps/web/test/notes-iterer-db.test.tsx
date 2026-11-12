// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 11 V5 · des NOTES de la lignée à l'hypothèse et à l'itération, et les
 * mentions dans les notes · base RÉELLE (pglite, migrations du dépôt), VRAIES
 * actions (gardes relues · session, rôle, marque active, portée de marque,
 * capacités), VRAIES vues (canvas de lignée rendu puis monté, écran Itérer,
 * page Hypothèses) · on lit le DOM et ce qui est écrit.
 *
 *  · le geste « Itérer depuis cette note » · présent seulement sur une note de
 *    création / résultat dont la variante a une pub testée (fermé avec sa raison
 *    sur une perdante, absent sans test et sur un brief) · « Formuler une
 *    hypothèse » seulement sur un brief / une hypothèse ;
 *  · l'écran Itérer EXISTANT, pré-rempli (pub, texte, variable seulement si
 *    sûre) · rien créé avant le clic · la provenance « Note de la lignée »
 *    relue, posée seulement quand la note désigne la pub de départ ;
 *  · le formulaire d'hypothèse EXISTANT, pré-rempli, la note citée · rien
 *    écrit avant le clic · la provenance relue ;
 *  · mentions · stockées par IDENTIFIANT dans `history`, notifiées UNE fois,
 *    l'auteur jamais, un membre hors marque ou d'un autre espace ignoré ;
 *  · une note d'un autre projet ou d'une autre marque dans l'adresse · refus
 *    sans fuite, rien de présélectionné, rien de posé.
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 * Aucune date « à venir » · l'ordre est explicite ou indifférent.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios & Record<'um' | 'uk', string>, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), um: u(), uk: u() };
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

import { db, schema, eq, and } from '@tiktrends/db';
import {
  LIBELLE_CHOIX_VARIABLE, LIBELLE_HYPOTHESE_NOTE, LIBELLE_ITERER_NOTE, NOTE_NOTE_PROVENANCE, RAISON_NOTE_AUTRE_MARQUE, RAISON_NOTE_NON_GAGNANTE,
  REFUS_GESTE_NOTE, REFUS_HYPOTHESE_NOTE, VOCABULAIRE_VARIABLES, lienHypotheseNote, lienIterationFil, lireMentions, lireOrigineHypothese,
  lireProvenanceCommentaire, lireProvenanceNote, provenanceDuTest, variablesDuPlan, type TestedVariable,
} from '@tiktrends/core';
import { chargerLots } from '../app/(spatial)/sp/adsmap/donnees';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { lireNotesLignee, modifierNoteLignee, noterNoeudLignee } from '../app/actions/studios/notes-lignee';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const NOM_ZOE = 'Zoé Martin';
const S = {
  P1: '', P2: '', P3: '', v1: '', varG: '', varP: '', varN: '', adGagnante: '', X: [] as string[],
  nG: '', nVague: '', nPerdante: '', nSansTest: '', nBrief: '', nHyp: '', nP2: '', nA2: '', nA2Brief: '',
};
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let admise: TestedVariable;
const terme = (v: TestedVariable) => VOCABULAIRE_VARIABLES[v][0]!;
const TEXTE_G = () => `Sur cette création, il faudrait changer ${terme(admise)} · le reste tient bien.`;
const TEXTE_VAGUE = 'Le résultat est correct, le produit paraît un peu petit, à surveiller.';
const TEXTE_BRIEF = 'Si on montre la texture en gros plan, alors le taux de clic monte, parce que le concurrent le fait.';
const TEXTE_HYP = 'L’hypothèse est trop large, à resserrer avant le prochain lot.';

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function verdict(adId: string, v: 'winner' | 'loser') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: v, status: 'validated', comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
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
async function rattacher(variantId: string, v: 'winner' | 'loser') {
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId, saisie: saisieTest() });
  if (!l.ok) throw new Error(`rattacher ${l.code}`);
  await verdict(l.lien.adsmapAdId, v);
  return l.lien.adsmapAdId;
}
async function noter(projectId: string, noeud: string, texte: string, mentions?: unknown) {
  const r = await noterNoeudLignee({ projectId, noeud, texte, ...(mentions !== undefined ? { mentions } : {}) });
  if (!r.ok) throw new Error(`noter ${JSON.stringify(r)}`);
  return r.notes.find((n) => n.texte === texte && n.noeud === noeud)!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  // `um` voit toutes les marques · `uk` est restreint à A2 (hors de la marque du projet) · `ub` est d'un autre espace.
  await db.insert(schema.users).values([{ id: ids.um, email: 'um@studios.test', name: NOM_ZOE }, { id: ids.uk, email: 'uk@studios.test', name: 'Karim Hors Marque' }]);
  await db.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.um, role: 'member' }, { workspaceId: ids.wsA, userId: ids.uk, role: 'member' }]);
  await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.uk, brandId: ids.brandA2 });
  await db.update(schema.users).set({ name: 'Anne Propriétaire' }).where(eq(schema.users.id, ids.ua));
  await db.update(schema.users).set({ name: 'Bob Autre Espace' }).where(eq(schema.users.id, ids.ub));
  await db.update(schema.users).set({ name: 'Rémi Restreint' }).where(eq(schema.users.id, ids.ur));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · trois créations retenues · une gagnante arbitrée, une perdante, une sans test.
  const p1 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · notes' });
  S.P1 = p1.projectId; S.v1 = p1.versionId;
  [S.varG, S.varP, S.varN] = await variantes(S.P1, 3) as [string, string, string];
  S.adGagnante = await rattacher(S.varG, 'winner');
  await rattacher(S.varP, 'loser');
  // ── P2 (A1) · un AUTRE projet de la même marque · une note sur une création.
  S.P2 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Autre projet A1' })).projectId;
  const [q] = await variantes(S.P2, 1);
  // ── P3 (A2) · une AUTRE marque · une gagnante annotée · jamais lisible depuis A1.
  const p3 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' });
  S.P3 = p3.projectId;
  const [r3] = await variantes(S.P3, 1);
  await rattacher(r3!, 'winner');

  // ── Résultats (A1) · des gagnantes au plan.
  const c = await chaine(ids.wsA, ids.brandA1, 'Crème');
  const [L] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: 3, goal: 'Gagnantes', status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  for (const code of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: c, batchId: L!.id, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, 'winner');
    S.X.push(a!.id);
  }
  const plan = await iterationPlanAction();
  const choix = variablesDuPlan(plan.view!.rows)[S.adGagnante];
  if (!choix) throw new Error('préalable · la gagnante du projet n’est pas dans le plan d’itération');
  admise = choix.options.find((o) => o.admise && o.variable !== choix.defaut && VOCABULAIRE_VARIABLES[o.variable].length)!.variable;

  // ── Les notes · par la VRAIE action, sur les nœuds de la lignée relue.
  S.nG = await noter(S.P1, `creation:${S.varG}`, TEXTE_G());
  S.nVague = await noter(S.P1, `resultat:${S.varG}`, TEXTE_VAGUE);
  S.nPerdante = await noter(S.P1, `creation:${S.varP}`, 'Il faudrait changer l’accroche de celle-ci aussi.');
  S.nSansTest = await noter(S.P1, `creation:${S.varN}`, 'Il faudrait changer l’accroche, pas encore testée.');
  S.nBrief = await noter(S.P1, `brief:${S.v1}`, TEXTE_BRIEF);
  S.nHyp = await noter(S.P1, `hypothese:${S.v1}`, TEXTE_HYP);
  S.nP2 = await noter(S.P2, `creation:${q}`, 'Il faudrait changer l’accroche ici.');
  h.marque = ids.brandA2;
  S.nA2 = await noter(S.P3, `creation:${r3}`, 'SECRET_NOTE_A2 · il faudrait changer l’accroche.');
  S.nA2Brief = await noter(S.P3, `brief:${p3.versionId}`, 'SECRET_BRIEF_A2 · si on change l’accroche, alors…');
  h.marque = ids.brandA1;
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
async function traces() {
  const n = async (t: unknown) => (await db.select().from(t as typeof schema.ads)).length;
  return {
    ads: await n(schema.ads), aretes: await n(schema.iterationEdges), concepts: await n(schema.concepts), notes: await n(schema.studioLineageNotes),
    notifications: await n(schema.notifications), depense: await n(schema.aiSpend), credits: await n(schema.creditLedger), jobs: await n(schema.studioJobs),
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
async function cliquer(el: Element | null, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
async function saisir(el: HTMLTextAreaElement | HTMLInputElement, valeur: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function touche(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const iterer = (sp: Record<string, string>) => IterationSpatiale({ searchParams: Promise.resolve(sp) });
const hypotheses = (sp: Record<string, string>) => HypothesesSpatial({ searchParams: Promise.resolve(sp) });
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const lignee = async (projectId = S.P1) => ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve(LIGNEE) });
/** La note dans « La lignée en liste » (le panneau de son nœud). */
const noteListe = (d: ParentNode, noeud: string, noteId: string) => d.querySelector(`[data-notes-panneau="liste:${noeud}"] [data-note="${noteId}"]`);
const gesteDe = (d: ParentNode, noeud: string, noteId: string, cle: 'iterer-note' | 'hypothese-note') => noteListe(d, noeud, noteId)?.querySelector(`[data-geste="${cle}"]`) ?? null;
async function notifs(u: string) {
  const N = schema.notifications;
  return db.select({ type: N.type, titre: N.title, corps: N.body, href: N.href }).from(N).where(eq(N.userId, u));
}
async function noteEnBase(id: string) {
  const [l] = await db.select().from(schema.studioLineageNotes).where(eq(schema.studioLineageNotes.id, id));
  return l!;
}

/* ───────────────────────────── 1 · les gestes sur les notes ───────────────────────────── */

describe('les gestes d’une note · le TYPE du nœud décide · rien n’est écrit pour les afficher', () => {
  it('le canvas de lignée rendu · « Itérer » sur la création et le résultat testés (liens), fermé sur la perdante, absent sans test · « Formuler une hypothèse » sur le brief et l’hypothèse', async () => {
    const avant = await traces();
    const d = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    for (const [noeud, k] of [[`creation:${S.varG}`, S.nG], [`resultat:${S.varG}`, S.nVague]] as const) {
      const a = gesteDe(d, noeud, k, 'iterer-note');
      expect(a?.tagName, `le geste de la note ${noeud} est un lien`).toBe('A');
      expect(a!.getAttribute('href')).toBe(lienIterationFil('note', { id: k, projetId: S.P1 }));
      expect(a!.textContent).toBe(LIBELLE_ITERER_NOTE);
      expect(gesteDe(d, noeud, k, 'hypothese-note'), 'une note de création formule une hypothèse').toBeNull();
    }
    const f = gesteDe(d, `creation:${S.varP}`, S.nPerdante, 'iterer-note') as HTMLButtonElement;
    expect([f?.tagName, f?.getAttribute('aria-disabled')]).toEqual(['BUTTON', 'true']);
    expect(d.querySelector(`#${CSS.escape(f.getAttribute('aria-describedby')!)}`)?.textContent).toBe(RAISON_NOTE_NON_GAGNANTE);
    expect(noteListe(d, `creation:${S.varN}`, S.nSansTest), 'la note sans test est là').toBeTruthy();
    expect(noteListe(d, `creation:${S.varN}`, S.nSansTest)!.querySelector('[data-geste-note]'), 'une création sans test propose un geste').toBeNull();
    for (const [noeud, k] of [[`brief:${S.v1}`, S.nBrief], [`hypothese:${S.v1}`, S.nHyp]] as const) {
      const a = gesteDe(d, noeud, k, 'hypothese-note');
      expect(a?.tagName, `le geste de la note ${noeud}`).toBe('A');
      expect([a!.getAttribute('href'), a!.textContent]).toEqual([lienHypotheseNote({ noteId: k, projetId: S.P1 }), LIBELLE_HYPOTHESE_NOTE]);
      expect(gesteDe(d, noeud, k, 'iterer-note'), 'une note de brief propose d’itérer').toBeNull();
    }
    expect(d.innerHTML, 'rien de l’autre marque').not.toMatch(/SECRET_/);
    expect(await traces(), 'afficher la lignée a écrit').toEqual(avant);
  });

  it('marque active différente · les gestes du projet sont fermés et disent pourquoi', async () => {
    h.marque = ids.brandA2;
    const r = await lireNotesLignee({ projectId: S.P1 });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const n = (id: string) => r.notes.find((x) => x.id === id)!;
    expect(n(S.nG).iterer).toEqual({ libelle: LIBELLE_ITERER_NOTE, href: null, raison: RAISON_NOTE_AUTRE_MARQUE });
    expect(n(S.nBrief).hypothese).toEqual({ libelle: LIBELLE_HYPOTHESE_NOTE, href: null, raison: 'Une hypothèse se range dans la marque active · ouvre d’abord cette marque.' });
  });
});

/* ───────────────────────────── 2 · l'écran Itérer, pré-rempli ───────────────────────────── */

describe('l’écran Itérer EXISTANT depuis une note · la pub du nœud, le texte en hypothèse, la variable seulement si sûre · rien avant le clic', () => {
  it('une note de résultat SANS variable sûre · la pub présélectionnée, AUCUNE variable cochée · rien de créé', async () => {
    const avant = await traces();
    await monter(await iterer(params(lienIterationFil('note', { id: S.nVague, projetId: S.P1 })!)));
    expect(pubChoisie(), 'la pub Adsmap de la variante annotée').toEqual([S.adGagnante]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain('La note ne désigne aucune variable sûrement');
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'aucune variable cochée').toEqual([]);
    await cliquer(document.querySelector(`[data-itvar="${admise}"]`), 'choisir une variable');
    expect((document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement).value, 'le texte de la note en hypothèse').toBe(TEXTE_VAGUE);
    expect(await traces(), 'rien de créé avant le clic').toEqual(avant);
  });

  it('une note qui désigne SÛREMENT une variable admise · cochée · créer au clic · l’itération porte la provenance « Note de la lignée », identifiants seuls', async () => {
    const avant = await traces();
    await monter(await iterer(params(lienIterationFil('note', { id: S.nG, projetId: S.P1 })!)));
    expect(pubChoisie()).toEqual([S.adGagnante]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain(`Variable désignée par la note · ${LIBELLE_CHOIX_VARIABLE[admise]}.`);
    expect(document.body.innerHTML, 'rien de l’autre marque').not.toMatch(/SECRET_/);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'la variable de la note').toEqual([admise]);
    expect((document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement).value, 'l’hypothèse proposée est la note').toBe(TEXTE_G());
    await saisir(document.querySelector('[data-champ="valeur"]') as HTMLInputElement, 'Une valeur nouvelle et précise');
    await saisir(document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement, `${TEXTE_G()} Si on le fait, le coût par achat baisse.`);
    expect(await traces(), 'rien de créé avant le clic').toEqual(avant);
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
    for (let i = 0; i < 50 && (await traces()).ads === avant.ads; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const [e] = await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, S.adGagnante));
    expect(e, 'une itération depuis la pub du nœud').toBeTruthy();
    const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, e!.childAdId));
    expect(lireProvenanceNote(enfant!.sourceRef), 'la provenance « Note de la lignée »').toEqual({ noteId: S.nG, projetId: S.P1 });
    expect(lireProvenanceCommentaire(enfant!.sourceRef), 'une provenance « Commentaire » posée').toBeNull();
    expect(JSON.stringify(enfant!.sourceRef), 'le texte de la note recopié dans la source').not.toContain('le reste tient bien');
    // Relue par la lecture des Résultats (celle du bilan) · elle compte dans « Note de la lignée ».
    const d = await chargerLots(ids.wsA, ids.brandA1);
    const lue = [...d.lots.flatMap((l) => l.ads), ...d.horsLot].find((a) => a.id === enfant!.id);
    expect(lue?.note, 'la lecture des Résultats ne relit pas la provenance').toEqual({ noteId: S.nG, projetId: S.P1 });
    expect(provenanceDuTest({ origine: lue!.origine, typeAd: lue!.typeAd, jarvis: lue!.jarvis, commentaire: lue!.commentaire, note: lue!.note })).toBe('note');
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.aretes - avant.aretes, apres.notes, apres.depense, apres.credits]).toEqual([1, 1, avant.notes, avant.depense, avant.credits]);
    // Le bilan par provenance dit « Note de la lignée » et ce qui y compte.
    const b = dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial({ searchParams: Promise.resolve({}) }))));
    expect(b.textContent).toContain('Note de la lignée');
    expect(b.querySelector('[data-note-note]')?.textContent).toBe(NOTE_NOTE_PROVENANCE);
  });
});

/* ───────────────────────────── 3 · le formulaire d'hypothèse, pré-rempli ───────────────────────────── */

describe('« Formuler une hypothèse » · le formulaire EXISTANT pré-rempli, la note citée · rien d’écrit avant le clic', () => {
  it('rendu · le formulaire ouvert, l’énoncé de la note repris partie par partie, la note citée · rien d’écrit', async () => {
    const avant = await traces();
    const d = dom(renderToStaticMarkup(avecSpatial(await hypotheses(params(lienHypotheseNote({ noteId: S.nBrief, projetId: S.P1 })!)))));
    const f = d.querySelector('[role="dialog"] [data-hypothese-note]');
    expect(f, 'le formulaire de la note n’est pas ouvert').toBeTruthy();
    const champ = (nom: string) => (f!.querySelector(`[name="${nom}"]`) as HTMLTextAreaElement).value;
    expect([champ('si'), champ('alors'), champ('parceQue')]).toEqual(['on montre la texture en gros plan', 'le taux de clic monte', 'le concurrent le fait']);
    const note = f!.querySelector('[data-note-source]')!.textContent!;
    expect(note).toContain(`Source · ta note sur « Brief · version 1 » · « ${TEXTE_BRIEF} »`);
    expect(note).toContain('Rien n’est enregistré sans ton clic sur « Ranger dans « À formuler » ».');
    expect(await traces(), 'afficher le formulaire a écrit').toEqual(avant);
  });

  it('monté · le focus dans le formulaire · ranger au clic · l’hypothèse porte la provenance « Note de la lignée » relue', async () => {
    const avant = await traces();
    await monter(await hypotheses(params(lienHypotheseNote({ noteId: S.nHyp, projetId: S.P1 })!)));
    const si = document.querySelector('[data-hypothese-note] textarea[name="si"]') as HTMLTextAreaElement;
    expect(si.value).toBe(TEXTE_HYP.replace(/\.$/, ''));
    expect(document.activeElement, 'le focus n’est pas dans le formulaire ouvert').toBe(si);
    await saisir(document.querySelector('[data-hypothese-note] textarea[name="alors"]') as HTMLTextAreaElement, 'le coût par achat baisse');
    expect(await traces(), 'rien d’écrit avant le clic').toEqual(avant);
    await act(async () => { (document.querySelector('[data-hypothese-note] form') as HTMLFormElement).requestSubmit(); });
    for (let i = 0; i < 50 && (await traces()).ads === avant.ads; i += 1) await attendre();
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.notes, apres.depense]).toEqual([1, avant.notes, avant.depense]);
    const [ad] = await db.select().from(schema.ads).where(eq(schema.ads.hypothesis, `Si ${TEXTE_HYP.replace(/\.$/, '')}, alors le coût par achat baisse.`));
    expect(ad, 'l’hypothèse rangée').toBeTruthy();
    expect(lireOrigineHypothese(ad!.sourceRef)).toEqual({ type: 'note', noeud: 'Hypothèse · version 1', noteId: S.nHyp, projetId: S.P1 });
    expect(JSON.stringify(ad!.sourceRef), 'le texte de la note recopié dans la source').not.toContain('resserrer');
    // Le formulaire fermé après le oui du serveur · la page dit « rangée » (pas « rien n’a été enregistré »), le focus sur cette phrase, rien à rouvrir.
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.querySelector('[data-hypothese-note-rangee]')?.textContent).toBe('Hypothèse rangée dans « À formuler » depuis la note.');
    expect(document.querySelector('[data-geste="rouvrir-hypothese-note"]'), 'rouvrir après un rangement créerait un doublon').toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-hypothese-note-rangee]'));
  });

  it('Annuler · rien d’écrit, la page le dit, le bouton qui rouvre reprend le focus · rouvert, le formulaire est le même', async () => {
    const avant = await traces();
    await monter(await hypotheses(params(lienHypotheseNote({ noteId: S.nBrief, projetId: S.P1 })!)));
    const annuler = [...document.querySelectorAll('[data-hypothese-note] button')].find((b) => b.textContent === 'Annuler');
    await cliquer(annuler ?? null, 'Annuler');
    await attendre();
    expect(document.querySelector('[data-hypothese-note-fermee]')?.textContent).toContain('rien n’a été enregistré');
    const rouvrir = document.querySelector('[data-geste="rouvrir-hypothese-note"]');
    expect(document.activeElement).toBe(rouvrir);
    await cliquer(rouvrir, 'rouvrir');
    await attendre();
    expect((document.querySelector('[data-hypothese-note] textarea[name="si"]') as HTMLTextAreaElement).value).toBe('on montre la texture en gros plan');
    expect(await traces(), 'annuler a écrit').toEqual(avant);
  });
});

/* ───────────────────────────── 4 · les mentions dans les notes ───────────────────────────── */

describe('les mentions dans une note · stockées par identifiant, notifiées une fois, l’auteur jamais, hors marque ignoré', () => {
  let kM = '';
  it('au clavier sur le canvas · « @ » ne propose que les membres qui voient le projet · Entrée choisit · posée, stockée par IDENTIFIANT, prévenue une fois', async () => {
    await monter(await lignee());
    const panneau = () => document.querySelector(`[data-notes-panneau="liste:creation:${S.varN}"]`)!;
    await cliquer(panneau().querySelector('[data-geste="ecrire-note"]'), 'écrire une note');
    const champ = panneau().querySelector('[data-champ="texte-note"]') as HTMLTextAreaElement;
    expect([champ.getAttribute('role'), champ.getAttribute('aria-autocomplete')]).toEqual(['combobox', 'list']);
    await saisir(champ, 'Vu avec @');
    const options = () => [...panneau().querySelectorAll('[data-liste-mentions] [role="option"]')].map((o) => o.textContent);
    expect(options(), 'la liste ne dit pas les membres qui voient le projet').toEqual(['@Rémi Restreint', `@${NOM_ZOE}`]);
    expect(panneau().innerHTML).not.toMatch(/Karim|Bob Autre|Anne Propri/);
    await saisir(champ, 'Vu avec @zo');
    await touche(champ, 'Enter');
    await attendre();
    expect(champ.value).toBe(`Vu avec @${NOM_ZOE} `);
    await saisir(champ, `${champ.value}<script>window.__note = 1</script> à revoir`);
    await act(async () => { (panneau().querySelector('[data-nouvelle-note]') as HTMLFormElement).requestSubmit(); });
    await attendre();
    const [l] = await db.select().from(schema.studioLineageNotes).where(and(eq(schema.studioLineageNotes.projectId, S.P1), eq(schema.studioLineageNotes.body, `Vu avec @${NOM_ZOE} <script>window.__note = 1</script> à revoir`)));
    expect(l, 'la note n’est pas écrite telle quelle').toBeTruthy();
    kM = l!.id;
    expect(l!.history, 'stockée par identifiant et place, la personne prévenue').toEqual([{ mentions: [{ id: ids.um, debut: 'Vu avec '.length, longueur: NOM_ZOE.length + 1 }], prevenus: [ids.um] }]);
    expect(JSON.stringify(l!.history)).not.toContain('Zoé');
    await vi.waitFor(() => expect(document.querySelector(`[data-note="${kM}"] [data-mention="${ids.um}"]`)?.textContent).toBe(`@${NOM_ZOE}`));
    expect(document.querySelector(`[data-note="${kM}"] script`)).toBeNull();
    expect((window as { __note?: number }).__note).toBeUndefined();
    expect(await notifs(ids.um)).toEqual([{ type: 'studio_note_mention', titre: 'On te mentionne dans une note de la lignée · Sérum · notes', corps: expect.stringContaining('Vu avec @Zoé'), href: `/studio/projets/${S.P1}?disposition=libre&graphe=lignee` }]);
    expect(await notifs(ids.ua), 'l’auteur prévenu').toEqual([]);
  });

  it('modifier · la mention tient, aucune seconde notification · retirée puis remise, jamais deux', async () => {
    const l = await noteEnBase(kM);
    const r1 = await modifierNoteLignee({ noteId: kM, rowVersion: l.rowVersion, texte: `Vu avec @${NOM_ZOE} · à revoir demain`, mentions: [ids.um] });
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    const l2 = await noteEnBase(kM);
    expect(lireMentions(l2.history, l2.body)).toEqual({ mentions: [{ id: ids.um, debut: 'Vu avec '.length, longueur: NOM_ZOE.length + 1 }], prevenus: [ids.um] });
    expect((l2.history as Array<{ texte?: string }>)[0]!.texte, 'l’ancien texte est gardé').toContain('à revoir');
    const r2 = await modifierNoteLignee({ noteId: kM, rowVersion: l2.rowVersion, texte: 'Plus personne ici.', mentions: [] });
    if (!r2.ok) throw new Error(JSON.stringify(r2));
    const l3 = await noteEnBase(kM);
    const r3 = await modifierNoteLignee({ noteId: kM, rowVersion: l3.rowVersion, texte: `Retour de @${NOM_ZOE}.`, mentions: [ids.um] });
    if (!r3.ok) throw new Error(JSON.stringify(r3));
    expect((await notifs(ids.um)).length, 'une mention qui tient prévient deux fois').toBe(1);
  });

  it('identifiants forgés · hors marque, autre espace, l’auteur, mal formés · ignorés · rien stocké, personne prévenu', async () => {
    const texte = '@Karim Hors Marque @Bob Autre Espace @Anne Propriétaire · forgé';
    const k = await noter(S.P1, `creation:${S.varN}`, texte, [ids.uk, ids.ub, ids.ua, 'pas-un-id', 42]);
    expect((await noteEnBase(k)).history, 'une mention forgée est stockée').toEqual([]);
    for (const q of ['uk', 'ub', 'ua'] as const) expect(await notifs(ids[q]), `${q} prévenu par une mention forgée`).toEqual([]);
    const d = dom(renderToStaticMarkup(avecSpatial(await lignee())));
    expect(noteListe(d, `creation:${S.varN}`, k)?.querySelector('[data-mention]'), 'une mention forgée affichée').toBeNull();
    expect(noteListe(d, `creation:${S.varN}`, k)?.querySelector('[data-texte-note]')?.textContent).toBe(texte);
  });
});

/* ───────────────────────────── 5 · refus sans fuite ───────────────────────────── */

describe('une note d’un autre projet, d’une autre marque, d’un autre nœud dans l’adresse · refus sans fuite, rien de posé', () => {
  it('Itérer · autre marque, autre projet, projet de l’adresse faux, note de brief, identifiant mal formé · la même phrase, aucun pré-choix', async () => {
    const avant = await traces();
    const cas: Array<[string, Record<string, string>]> = [
      ['autre marque', { note: S.nA2, projet: S.P3 }],
      ['autre marque sous le projet de la marque active', { note: S.nA2, projet: S.P1 }],
      ['autre projet', { note: S.nP2, projet: S.P1 }],
      ['projet de l’adresse faux', { note: S.nG, projet: S.P2 }],
      ['note de brief', { note: S.nBrief, projet: S.P1 }],
      ['mal formé', { note: 'pas-un-id', projet: S.P1 }],
    ];
    for (const [nom, sp] of cas) {
      const html = renderToStaticMarkup(avecSpatial(await iterer(sp)));
      const d = dom(html);
      expect(d.querySelector('[data-note-commentaire]')?.textContent, nom).toBe(REFUS_GESTE_NOTE);
      expect([...d.querySelectorAll('[data-itad][aria-pressed="true"]')].length, `${nom} · une pub présélectionnée`).toBe(0);
      expect(html, `${nom} · fuite`).not.toMatch(/SECRET_|SECRET_PROJET_A2/);
    }
    expect(await traces()).toEqual(avant);
  });

  it('Hypothèses · autre marque, autre projet, note de création · la même phrase, aucun formulaire, rien de l’autre marque', async () => {
    const avant = await traces();
    for (const [nom, sp] of [
      ['autre marque', { note: S.nA2Brief, projet: S.P3 }], ['autre marque sous le projet actif', { note: S.nA2Brief, projet: S.P1 }],
      ['autre projet', { note: S.nBrief, projet: S.P2 }], ['note de création', { note: S.nG, projet: S.P1 }], ['mal formé', { note: S.nBrief }],
    ] as Array<[string, Record<string, string>]>) {
      const html = renderToStaticMarkup(avecSpatial(await hypotheses(sp)));
      const d = dom(html);
      expect(d.querySelector('[data-hypothese-note-refus]')?.textContent, nom).toBe(REFUS_HYPOTHESE_NOTE);
      expect(d.querySelector('[data-hypothese-note]'), `${nom} · un formulaire pré-rempli`).toBeNull();
      expect(html, `${nom} · fuite`).not.toMatch(/SECRET_/);
    }
    expect(await traces()).toEqual(avant);
  });

  it('les actions appelées directement · une note forgée ne pose AUCUNE provenance (itération ordinaire, hypothèse « À la main »)', async () => {
    const variables = variablesDuPlan((await iterationPlanAction()).view!.rows);
    const admiseDe = (adId: string) => variables[adId]!.options.find((o) => o.admise)!.variable;
    const cas: Array<[string, string, unknown]> = [
      ['note relue mais pub d’une autre variante', S.X[0]!, { noteId: S.nG, projetId: S.P1 }],
      ['note d’une autre marque', S.X[1]!, { noteId: S.nA2, projetId: S.P3 }],
      ['projet de la demande faux', S.X[2]!, { noteId: S.nG, projetId: S.P2 }],
      ['note de brief', S.X[3]!, { noteId: S.nBrief, projetId: S.P1 }],
      ['mal formée', S.X[4]!, { noteId: 'Change l’accroche', projetId: S.P1 }],
    ];
    for (const [nom, parentAdId, note] of cas) {
      const r = await creerIterationChoisieAction({ parentAdId, variable: admiseDe(parentAdId), valeur: 'Une valeur nouvelle', hypothese: 'Si on change cette variable, alors le coût baisse, parce que la preuve rassure.', note });
      expect(r.ok, `${nom} · ${!r.ok ? r.error : ''}`).toBe(true);
      if (!r.ok) continue;
      expect(r.provenance ?? null, nom).toBeNull();
      const [a] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, r.adId));
      expect(lireProvenanceNote(a!.s), `${nom} · une provenance « Note de la lignée » posée`).toBeNull();
    }
    for (const source of [{ type: 'note' as const, noteId: S.nA2Brief, projetId: S.P3 }, { type: 'note' as const, noteId: S.nG, projetId: S.P1 }, { type: 'note' as const, noteId: S.nBrief, projetId: S.P2 }]) {
      const r = await creerHypotheseAction({ source, saisie: { si: 'on change l’accroche', alors: 'le clic monte' } });
      expect([r.ok, r.provenance], JSON.stringify(source)).toEqual([true, 'libre']);
    }
  });
});
