// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Du commentaire à l'itération, et la duplication dite partout · base RÉELLE
 * (pglite, migrations du dépôt), VRAIES actions (gardes relues · session, rôle,
 * marque active), VRAIES pages rendues et montées · on lit le DOM et ce qui
 * est écrit.
 *
 *  · « Itérer depuis ce commentaire » · présent seulement sur un commentaire
 *    de création testée (ouvert ET résolu) · fermé avec sa raison sur une pub
 *    perdante · absent sur une version, une création non testée ;
 *  · l'écran Itérer s'ouvre pré-rempli · la pub de la création, le texte du
 *    commentaire en hypothèse, la variable SEULEMENT si le texte la désigne
 *    sûrement · rien de créé avant le clic, créé au clic avec la provenance
 *    « Commentaire » (JSON de source, identifiants seuls) ;
 *  · le bilan « D'où viennent les hypothèses qui gagnent » la lit à part ;
 *  · commentaire d'un autre projet, d'une autre marque, d'une version, mal
 *    formé · la même phrase de refus, rien de l'autre côté · l'action appelée
 *    en direct avec une provenance forgée ne pose rien ;
 *  · duplication · la source dit « Dupliqué en « … » » avec le lien, la lignée
 *    relie les deux projets (catégorie « Copie », dans la légende) · une
 *    duplication ancienne (sans `copieDe`) · rien d'inventé, la copie le dit.
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 * Aucune date « à venir » · l'ordre est explicite ou indifférent.
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
  LIBELLE_ITERER_COMMENTAIRE, NOTE_COMMENTAIRE_PROVENANCE, NOTE_COPIE_SANS_LIEN, RAISON_COMMENTAIRE_NON_GAGNANTE, REFUS_GESTE_COMMENTAIRE, VOCABULAIRE_VARIABLES, LIBELLE_CHOIX_VARIABLE,
  lienIterationCommentaire, lireProvenanceCommentaire, variablesDuPlan, type TestedVariable,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { creerProjet as creerProjetDepot } from '../lib/studios/depot';
import { commenterProjet, resoudreCommentaire } from '../app/actions/studios/activite';
import { dupliquerProjet } from '../app/actions/studios/projets';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const S = {
  P1: '', P2: '', P3: '', gagnante: '', perdante: '', sansTest: '', adGagnante: '', adP3: '', v1P1: '',
  kG: '', kVague: '', kResolu: '', kPerdante: '', kSansTest: '', kVersion: '', kP2: '', kA2: '',
  X: [] as string[], LJ: '', copie: '', ancienne: '',
};
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let admise: TestedVariable;
const terme = (v: TestedVariable) => VOCABULAIRE_VARIABLES[v][0]!;
const TEXTE_G = () => `Sur cette création, il faudrait changer ${terme(admise)} · le reste tient bien.`;
const TEXTE_VAGUE = 'Le produit paraît un peu petit sur cette création, à surveiller.';

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(number: number, goal: string) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return b!.id;
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
  const out: Array<{ variante: string; asset: string }> = [];
  for (let i = 1; i <= n; i += 1) {
    const v = await creerVariante(ctxDe(ids, 'ua'), { assetId: s[`keyframe:s${i}`]! });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    out.push({ variante: v.variante.id, asset: s[`keyframe:s${i}`]! });
  }
  return out;
}
async function rattacher(variantId: string, v: 'winner' | 'loser') {
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId, saisie: saisieTest() });
  if (!l.ok) throw new Error(`rattacher ${l.code}`);
  await verdict(l.lien.adsmapAdId, v);
  return l.lien.adsmapAdId;
}
async function commenter(projectId: string, cible: 'creation' | 'version', cibleId: string, texte: string) {
  const r = await commenterProjet({ projectId, cible, cibleId, texte });
  if (!r.ok) throw new Error(`commenter ${JSON.stringify(r)}`);
  return r.commentaires.find((c) => c.texte === texte)!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;

  // ── P1 (A1) · trois créations retenues · une gagnante arbitrée, une perdante, une sans test.
  const p1 = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · commentaires' });
  S.P1 = p1.projectId;
  const [g, p, n] = await variantes(S.P1, 3) as [{ variante: string; asset: string }, { variante: string; asset: string }, { variante: string; asset: string }];
  S.gagnante = g.asset; S.perdante = p.asset; S.sansTest = n.asset;
  S.adGagnante = await rattacher(g.variante, 'winner');
  await rattacher(p.variante, 'loser');
  const [v1] = await db.select({ id: schema.studioProjectVersions.id }).from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, S.P1));
  S.v1P1 = v1!.id;
  // ── P2 (A1) · un AUTRE projet de la même marque · une création commentée, sans test.
  S.P2 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Autre projet A1' })).projectId;
  const [q] = await variantes(S.P2, 1);
  // ── P3 (A2) · une AUTRE marque · une gagnante commentée · jamais lisible depuis A1.
  S.P3 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' })).projectId;
  const [r3] = await variantes(S.P3, 1);
  S.adP3 = await rattacher(r3!.variante, 'winner');

  // ── Résultats (A1) · des gagnantes au plan, pour les appels forgés · et le lot où les itérations sont mesurées.
  const c = await chaine(ids.wsA, ids.brandA1, 'Crème');
  const L = await lot(3, 'Gagnantes de la marque');
  for (const code of ['V1', 'V2', 'V3', 'V4', 'V5']) {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: c, batchId: L, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
    await verdict(a!.id, 'winner');
    S.X.push(a!.id);
  }
  S.LJ = await lot(7, 'Itérations mesurées');

  const plan = await iterationPlanAction();
  const choix = variablesDuPlan(plan.view!.rows)[S.adGagnante];
  if (!choix) throw new Error('préalable · la gagnante du projet n’est pas dans le plan d’itération');
  admise = choix.options.find((o) => o.admise && o.variable !== choix.defaut && VOCABULAIRE_VARIABLES[o.variable].length)!.variable;

  // ── Les commentaires · par la VRAIE action, dans l'ordre (aucune date « à venir »).
  S.kG = await commenter(S.P1, 'creation', S.gagnante, TEXTE_G());
  S.kVague = await commenter(S.P1, 'creation', S.gagnante, TEXTE_VAGUE);
  S.kResolu = await commenter(S.P1, 'creation', S.gagnante, `Décidé en revue · on teste ${terme(admise)} au prochain lot.`);
  S.kPerdante = await commenter(S.P1, 'creation', S.perdante, 'Il faudrait changer l’accroche de celle-ci aussi.');
  S.kSansTest = await commenter(S.P1, 'creation', S.sansTest, 'Il faudrait changer l’accroche, pas encore testée.');
  S.kVersion = await commenter(S.P1, 'version', S.v1P1, 'Il faudrait changer l’accroche du brief.');
  S.kP2 = await commenter(S.P2, 'creation', q!.asset, 'Il faudrait changer l’accroche ici.');
  h.marque = ids.brandA2;
  S.kA2 = await commenter(S.P3, 'creation', r3!.asset, 'SECRET_COMMENTAIRE_A2 · il faudrait changer l’accroche.');
  h.marque = ids.brandA1;
  const [k] = await db.select({ rv: schema.studioComments.rowVersion }).from(schema.studioComments).where(eq(schema.studioComments.id, S.kResolu));
  const res = await resoudreCommentaire({ commentId: S.kResolu, rowVersion: k!.rv, resolu: true });
  if (!res.ok) throw new Error(JSON.stringify(res));
}, 240_000);

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
async function traces() {
  const n = async (t: unknown) => (await db.select().from(t as typeof schema.ads)).length;
  return {
    ads: await n(schema.ads), aretes: await n(schema.iterationEdges), commentaires: await n(schema.studioComments),
    depense: await n(schema.aiSpend), credits: await n(schema.creditLedger), jobs: await n(schema.studioJobs), versions: await n(schema.studioProjectVersions),
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
async function saisir(sel: string, valeur: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const iterer = (sp: Record<string, string>) => IterationSpatiale({ searchParams: Promise.resolve(sp) });
async function activite(projectId: string) {
  const r = await chargerProjet(h.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return dom(renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="activite" />)));
}
const geste = (d: ParentNode, k: string) => d.querySelector(`[data-commentaire="${k}"] [data-geste="iterer-commentaire"]`);
const lignee = async (projectId: string) => renderToStaticMarkup(avecSpatial(await ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve({ disposition: 'libre', graphe: 'lignee' }) })));
const attr = (x: string, nom: string) => [...x.matchAll(new RegExp(`${nom}="([^"]*)"`, 'g'))].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&gt;/g, '>'));
const categories = (x: string) => Object.fromEntries([...x.matchAll(/data-lien="([^"]*)" data-categorie="([^"]*)"/g)].map((m) => [m[1]!.replace(/&gt;/g, '>'), m[2]]));
const phrasesJournal = (d: ParentNode) => [...d.querySelectorAll('[data-entrees-journal] .ev')].map((e) => e.querySelector('[data-phrase]')?.textContent ?? '');

/* ───────────────────────────── 1 · le geste sur le commentaire ───────────────────────────── */

describe('« Itérer depuis ce commentaire » · seulement sur un commentaire de création testée, ouvert ou résolu', () => {
  it('la fiche rendue · un lien vers Itérer sur la gagnante (ouvert ET résolu) · fermé avec sa raison sur la perdante · absent sur une version, une création sans test · rien d’écrit', async () => {
    const avant = await traces();
    const d = await activite(S.P1);
    for (const k of [S.kG, S.kVague]) {
      const a = geste(d, k);
      expect(a?.tagName, `le geste du commentaire ${k} est un lien`).toBe('A');
      expect(a!.getAttribute('href')).toBe(lienIterationCommentaire({ commentaireId: k, projetId: S.P1 }));
      expect(a!.textContent).toBe(LIBELLE_ITERER_COMMENTAIRE);
    }
    // Le résolu se lit sous « Résolus » · la fiche montée, le filtre cliqué · même geste.
    expect(d.querySelector(`[data-commentaire="${S.kResolu}"]`), 'un résolu sous « Ouverts »').toBeNull();
    const r = await chargerProjet(h.session as never, S.P1);
    if (!r.ok) throw new Error('fiche');
    await monter(<Projet {...r.props} ongletInitial="activite" />);
    await cliquer(document.querySelector('[data-filtres-commentaires] button[data-filtre="resolus"]'), 'filtre Résolus');
    expect(document.querySelector(`[data-commentaire="${S.kResolu}"]`)?.getAttribute('data-resolu'), 'le commentaire résolu').toBe('oui');
    expect(geste(document, S.kResolu)?.getAttribute('href'), 'un commentaire résolu propose aussi le geste').toBe(lienIterationCommentaire({ commentaireId: S.kResolu, projetId: S.P1 }));
    // Perdante · fermé, la raison écrite à côté.
    const f = geste(d, S.kPerdante) as HTMLButtonElement;
    expect([f?.tagName, f?.getAttribute('aria-disabled')]).toEqual(['BUTTON', 'true']);
    expect(d.querySelector(`#${CSS.escape(f.getAttribute('aria-describedby')!)}`)?.textContent).toBe(RAISON_COMMENTAIRE_NON_GAGNANTE);
    // Une version, une création sans test · aucun geste.
    expect(geste(d, S.kSansTest), 'création sans test').toBeNull();
    expect(geste(d, S.kVersion), 'version').toBeNull();
    expect(await traces(), 'afficher la fiche a écrit').toEqual(avant);
  });

  it('marque active différente · le geste du projet est fermé et dit pourquoi', async () => {
    h.marque = ids.brandA2;
    const r = await chargerProjet(h.session as never, S.P1);
    const c = r.ok && r.props.activite!.commentaires.ok ? r.props.activite!.commentaires.liste.commentaires.find((x) => x.id === S.kG) : null;
    expect(c?.iterer).toMatchObject({ href: null, raison: 'Ce projet n’est pas dans ta marque active · ouvre sa marque pour itérer depuis ce commentaire.' });
  });
});

/* ───────────────────────────── 2 · l'écran Itérer, pré-rempli ───────────────────────────── */

describe('l’écran Itérer EXISTANT · la pub de la création, le commentaire en hypothèse, la variable seulement si sûre · rien avant le clic', () => {
  it('un commentaire SANS variable sûre · la pub présélectionnée, le texte en hypothèse, AUCUNE variable cochée (pas le défaut du plan) · rien de créé', async () => {
    const avant = await traces();
    await monter(await iterer(params(lienIterationCommentaire({ commentaireId: S.kVague, projetId: S.P1 })!)));
    expect(pubChoisie(), 'la pub Adsmap de la création commentée').toEqual([S.adGagnante]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain('ne désigne aucune variable sûrement');
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'aucune variable cochée').toEqual([]);
    await cliquer(document.querySelector(`[data-itvar="${admise}"]`), 'choisir une variable');
    expect((document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement).value, 'le texte du commentaire en hypothèse').toBe(TEXTE_VAGUE);
    expect(await traces(), 'rien de créé avant le clic').toEqual(avant);
  });

  it('un commentaire qui désigne SÛREMENT une variable admise · cochée · créer au clic · l’itération porte la provenance « Commentaire », identifiants seuls', async () => {
    const avant = await traces();
    await monter(await iterer(params(lienIterationCommentaire({ commentaireId: S.kG, projetId: S.P1 })!)));
    expect(pubChoisie()).toEqual([S.adGagnante]);
    expect(document.querySelector('[data-note-commentaire]')?.textContent).toContain(`Variable désignée par le commentaire · ${LIBELLE_CHOIX_VARIABLE[admise]}.`);
    expect(document.body.innerHTML, 'rien de l’autre marque').not.toMatch(/SECRET_/);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'la variable du commentaire').toEqual([admise]);
    const hyp = document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement;
    expect(hyp.value, 'l’hypothèse proposée est le commentaire').toBe(TEXTE_G());
    await saisir('[data-champ="valeur"]', 'Une valeur nouvelle et précise');
    await saisir('[data-champ="hypothese"]', `${TEXTE_G()} Si on le fait, le coût par achat baisse.`);
    expect(await traces(), 'rien de créé avant le clic').toEqual(avant);
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
    for (let i = 0; i < 50 && (await traces()).ads === avant.ads; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const [e] = (await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, S.adGagnante)));
    expect(e, 'une itération depuis la pub de la création').toBeTruthy();
    const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, e!.childAdId));
    expect(lireProvenanceCommentaire(enfant!.sourceRef), 'la provenance « Commentaire »').toEqual({ commentaireId: S.kG, projetId: S.P1 });
    expect(JSON.stringify(enfant!.sourceRef), 'le texte du commentaire recopié dans la source').not.toContain('le reste tient bien');
    expect([enfant!.testedVariable, enfant!.hypothesis]).toEqual([admise, `${TEXTE_G()} Si on le fait, le coût par achat baisse.`]);
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.aretes - avant.aretes, apres.commentaires, apres.depense, apres.credits]).toEqual([1, 1, avant.commentaires, avant.depense, avant.credits]);
    // Mesurée · rangée dans le lot des itérations, son verdict.
    await db.update(schema.ads).set({ batchId: S.LJ, status: 'done' }).where(eq(schema.ads.id, enfant!.id));
    await verdict(enfant!.id, 'winner');
  });
});

/* ───────────────────────────── 3 · refus sans fuite ───────────────────────────── */

describe('refus sans fuite · autre projet, autre marque, version, création sans test, mal formé · la même phrase, aucun pré-choix', () => {
  it('chaque adresse forgée · la phrase de refus, aucune pub cochée, rien du commentaire ni de l’autre marque, rien écrit', async () => {
    const avant = await traces();
    const cas: Array<[string, Record<string, string>]> = [
      ['commentaire d’un autre projet (adresse P2)', { commentaire: S.kG, projet: S.P2 }],
      ['commentaire de P2 dans l’adresse de P1', { commentaire: S.kP2, projet: S.P1 }],
      ['commentaire d’une autre marque', { commentaire: S.kA2, projet: S.P3 }],
      ['commentaire sur une version', { commentaire: S.kVersion, projet: S.P1 }],
      ['création sans test', { commentaire: S.kSansTest, projet: S.P1 }],
      ['mal formé', { commentaire: 'Change l’accroche', projet: S.P1 }],
    ];
    for (const [nom, sp] of cas) {
      const html = renderToStaticMarkup(avecSpatial(await iterer(sp)));
      const d = dom(html);
      expect(d.querySelector('[data-note-commentaire]')?.textContent, nom).toBe(REFUS_GESTE_COMMENTAIRE);
      expect([...d.querySelectorAll('[data-itad][aria-pressed="true"]')].length, `${nom} · une pub cochée`).toBe(0);
      expect(html, `${nom} · fuite`).not.toMatch(/SECRET_|il faudrait changer|le reste tient bien|pas encore testée/i);
    }
    // L'autre marque active · le commentaire de A1 ne se lit pas depuis A2.
    h.marque = ids.brandA2;
    const html = renderToStaticMarkup(avecSpatial(await iterer({ commentaire: S.kVague, projet: S.P1 })));
    expect(dom(html).querySelector('[data-note-commentaire]')?.textContent).toBe(REFUS_GESTE_COMMENTAIRE);
    expect(html).not.toContain('un peu petit');
    expect(await traces(), 'une ouverture refusée a écrit').toEqual(avant);
  });

  it('l’action appelée en direct avec une provenance forgée · l’itération naît, AUCUNE provenance (autre pub, autre projet, autre marque, version, mal formée) · le témoin relu, oui', async () => {
    const variables = variablesDuPlan((await iterationPlanAction()).view!.rows);
    const admiseDe = (adId: string) => variables[adId]!.options.find((o) => o.admise)!.variable;
    const creer = (parentAdId: string, commentaire: unknown) => creerIterationChoisieAction({ parentAdId, variable: admiseDe(parentAdId), valeur: 'Une valeur nouvelle', hypothese: 'Si on change cette variable, alors le coût baisse, parce que la preuve rassure.', commentaire });
    const cas: Array<[string, string, unknown]> = [
      ['commentaire relu mais pub d’une autre création', S.X[0]!, { commentaireId: S.kG, projetId: S.P1 }],
      ['projet de la demande qui n’est pas celui du commentaire', S.X[1]!, { commentaireId: S.kG, projetId: S.P2 }],
      ['commentaire d’une autre marque', S.X[2]!, { commentaireId: S.kA2, projetId: S.P3 }],
      ['commentaire sur une version', S.X[3]!, { commentaireId: S.kVersion, projetId: S.P1 }],
      ['mal formée', S.X[4]!, { commentaireId: 'Change l’accroche', projetId: S.P1 }],
    ];
    for (const [nom, parentAdId, commentaire] of cas) {
      const r = await creer(parentAdId, commentaire);
      expect(r.ok, `${nom} · ${!r.ok ? r.error : ''}`).toBe(true);
      if (!r.ok) continue;
      expect(r.provenance ?? null, nom).toBeNull();
      const [ad] = await db.select({ s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, r.adId));
      expect(lireProvenanceCommentaire(ad!.s), `${nom} · une provenance « Commentaire » posée`).toBeNull();
      await db.update(schema.ads).set({ batchId: S.LJ, status: 'done' }).where(eq(schema.ads.id, r.adId));
      await verdict(r.adId, 'loser');
    }
  });
});

/* ───────────────────────────── 4 · le bilan ───────────────────────────── */

describe('le bilan « D’où viennent les hypothèses qui gagnent » lit « Commentaire » à part · aucun seuil changé', () => {
  it('l’itération relue compte dans « Commentaire » · les forgées dans « Itération d’une gagnante » · la règle dit neuf provenances, six lues au plus', async () => {
    const d = dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial({ searchParams: Promise.resolve({}) }))));
    const b = d.querySelector<HTMLElement>('[aria-label="D’où viennent les hypothèses qui gagnent"]')!;
    const k = b.querySelector('[data-groupe-provenance="commentaire"]');
    expect(k, 'la provenance « Commentaire » n’est pas lue dans le bilan').toBeTruthy();
    expect(k!.textContent).toContain('Commentaire');
    expect(k!.textContent, 'la seule itération relue').toContain('1 variante tranchée');
    expect(b.querySelector('[data-groupe-provenance="iteration"]')!.textContent, 'les forgées, comptées ordinaires').toContain('5 variantes tranchées');
    expect(b.querySelector('[data-taux-general]')!.textContent).toContain('Commentaire');
    expect(b.querySelector('[data-note-commentaire]')!.textContent).toBe(NOTE_COMMENTAIRE_PROVENANCE);
    expect(b.textContent).toContain('10 provenances, 6 lues au plus à la fois, silence au-delà');
  });
});

/* ───────────────────────────── 5 · la duplication ───────────────────────────── */

describe('la duplication dite partout · le journal de la source, la lignée des deux · rien d’inventé pour une ancienne', () => {
  it('dupliquer · la source dit « Dupliqué en « … » » avec le lien vers la copie · la copie dit d’où elle vient', async () => {
    const r = await dupliquerProjet({ projectId: S.P1 });
    if (!r.ok) throw new Error(JSON.stringify(r));
    S.copie = r.projet.id;
    const [audit] = await db.select({ details: schema.studioAuditEvents.details }).from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, S.copie));
    expect(audit!.details, 'l’audit de la création de la copie').toEqual({ copieDe: { projectId: S.P1, versionId: r.source.versionId } });
    const d = await activite(S.P1);
    const e = [...d.querySelectorAll('[data-entrees-journal] .ev')].find((x) => x.querySelector('[data-phrase]')?.textContent?.startsWith('Dupliqué en'));
    expect(e?.querySelector('[data-phrase]')?.textContent).toBe('Dupliqué en « Copie de Sérum · commentaires »');
    expect(e?.querySelector('[data-detail]')?.textContent).toBe('Depuis la version 1 · la copie reprend la structure, sans générations, exports, tests ni mesures');
    expect(e?.querySelector('a')?.getAttribute('href')).toBe(`/studio/projets/${S.copie}`);
    expect(phrasesJournal(await activite(S.copie))).toEqual(['Projet créé par duplication']);
  });

  it('la lignée relie les deux projets · un trait « Copie » de chaque côté, déclaré dans la légende · aucun autre trait ajouté', async () => {
    const src = await lignee(S.P1);
    const cs = categories(src);
    expect(cs[`brief:${S.v1P1}>projet-copie:${S.copie}`], 'le trait de la source vers sa copie').toBe('copie');
    expect(Object.values(cs).filter((c) => c === 'copie')).toHaveLength(1);
    expect(attr(src, 'data-legende')).toContain('copie');
    expect(src).toContain('Copie · tirets longs · 1 lien');
    const [vc] = await db.select({ id: schema.studioProjectVersions.id }).from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, S.copie));
    const cop = await lignee(S.copie);
    expect(categories(cop)[`projet-source:${S.P1}>brief:${vc!.id}`], 'le trait de la copie vers sa source').toBe('copie');
    expect(attr(cop, 'data-carte')).toContain(`projet-source:${S.P1}`);
  });

  it('une duplication ANCIENNE (sans `copieDe`) · la source ne dit rien et sa lignée ne la relie pas · la copie dit que le lien n’est pas enregistré', async () => {
    const c = await creerProjetDepot(ctxDe(ids, 'ua'), { brandId: ids.brandA1, kind: 'image', title: 'Copie de Sérum · ancienne', raison: 'Copie de « Sérum · commentaires » (version 1) · structure seule, sans générations, exports, tests ni mesures' });
    if (!c.ok) throw new Error(JSON.stringify(c));
    S.ancienne = c.projet.id;
    const d = await activite(S.P1);
    expect(phrasesJournal(d).filter((p) => p.startsWith('Dupliqué')), 'une seule duplication relue · la nouvelle').toEqual(['Dupliqué en « Copie de Sérum · commentaires »']);
    expect(d.innerHTML).not.toContain(S.ancienne);
    expect(await lignee(S.P1)).not.toContain(S.ancienne);
    const a = await activite(S.ancienne);
    expect(a.querySelector('[data-entrees-journal] [data-detail]')?.textContent).toBe(`Copie de « Sérum · commentaires » (version 1) · structure seule, sans générations, exports, tests ni mesures · ${NOTE_COPIE_SANS_LIEN}`);
    expect(attr(await lignee(S.ancienne), 'data-carte').filter((x) => x.startsWith('projet-'))).toEqual([]);
  });

  it('une autre marque · la duplication d’un projet de A2 ne se lit pas depuis A1', async () => {
    h.marque = ids.brandA2;
    const r = await dupliquerProjet({ projectId: S.P3 });
    if (!r.ok) throw new Error(JSON.stringify(r));
    h.marque = ids.brandA1;
    // `ur` (membre restreint) ne voit pas A2 · ni le projet, ni sa copie.
    h.session = session(ids, 'ur', { plan: 'plus' });
    const x = await chargerProjet(h.session as never, S.P3).catch(() => null);
    expect(x && x.ok, 'A2 lisible par un membre restreint').toBeFalsy();
    expect(JSON.stringify(x ?? {})).not.toContain('SECRET_PROJET_A2');
  });
});
