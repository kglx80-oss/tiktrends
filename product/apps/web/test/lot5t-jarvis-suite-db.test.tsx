// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 5 ter V5 · Jarvis, la suite · base RÉELLE (pglite, migrations du dépôt),
 * pages RÉELLES rendues et montées · on lit le DOM et ce qui est écrit.
 *
 *  · le panneau Jarvis d'un PROJET (PC E35, E38) · « Créer l'itération » sous
 *    la dernière réponse SEULEMENT quand elle désigne sûrement une variante
 *    gagnante du projet · le reste du panneau (puces, patch, devis) inchangé ·
 *    Itérer s'ouvre pré-rempli (variante, variable admise) · rien de créé
 *    avant le clic ;
 *  · « Autre variable » (RJ G07) · la variable SUIVANTE admise, lien vers
 *    Itérer qui la coche · absente s'il n'y en a pas, et la phrase dit pourquoi ;
 *  · « Pourquoi ? » · la question dans le champ, rien d'envoyé, aucune dépense ;
 *  · autre marque, autre projet, autre personne, fil principal · la même
 *    phrase, aucun pré-choix, rien de l'autre côté.
 * 0 $ · fournisseur et stockage simulés, route remplacée à la frontière du
 * navigateur, le faux fournisseur compte tout appel qui sortirait.
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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/jarvis', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/jarvis', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import {
  LIBELLE_CHOIX_VARIABLE, RAISON_AUTRE_SANS_PUB, REFUS_GESTE_JARVIS, VARIABLE_LABEL, VOCABULAIRE_VARIABLES, VARIABLES_ECRAN,
  annonceConversationJarvis, lienIterationJarvis, lienJarvisContexte, variablesDuPlan, type ChoixVariablesIteration, type TestedVariable,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import JarvisSpatial from '../app/(spatial)/sp/jarvis/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { iterationPlanAction } from '../app/actions/adsmap-iterate';
import { regimeSession } from '../lib/credits-appels';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const S = {
  P1: '', P2: '', P3: '', fil1: '', fil2: '', fil3: '', gagnante: '', perdante: '', adGagnante: '', adP3: '', libGagnante: '', libPerdante: '',
  L1: '', V1: '', L5: '', X1: '', X2: '', L6: '', bout: '',
};
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
/** Pour la variante gagnante du projet et pour V1 · une variable ADMISE hors défaut du plan (avec du vocabulaire). */
let admiseProjet: TestedVariable;
let admiseV1: TestedVariable;
let choixV1: ChoixVariablesIteration;

const terme = (v: TestedVariable) => VOCABULAIRE_VARIABLES[v][0]!;

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
async function ad(conceptId: string, batchId: string | null, code: string, v: 'winner' | 'loser' | null) {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId, batchId, variantCode: code, status: 'done', hypothesis: `Si on teste ${code}, alors le coût par achat baisse.`, testedVariable: 'hook' }).returning({ id: schema.ads.id });
  if (v) await verdict(a!.id, v);
  return a!.id;
}
/** Un fil Jarvis LIÉ à un projet (conversation `project_id`) · la personne et la marque du projet. */
async function filProjet(projectId: string, brandId: string, user = ids.ua) {
  const [c] = await db.insert(schema.jarvisConversations).values({ workspaceId: ids.wsA, brandId, userId: user, projectId, titre: 'Fil du projet' }).returning({ id: schema.jarvisConversations.id });
  return c!.id;
}
let horloge = Date.now();
async function message(o: { contenu: string; brandId?: string; user?: string; conversationId?: string | null }) {
  horloge += 1000;
  const [m] = await db.insert(schema.jarvisMessages).values({
    workspaceId: ids.wsA, brandId: o.brandId ?? ids.brandA1, userId: o.user ?? ids.ua, conversationId: o.conversationId ?? null,
    role: 'assistant', content: o.contenu, createdAt: new Date(horloge),
  }).returning({ id: schema.jarvisMessages.id });
  return m!.id;
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

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée du faux fournisseur.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));

  // ── P1 (A1) · deux variantes testées · une gagnante arbitrée, une perdante.
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · suite Jarvis' })).projectId;
  [S.gagnante, S.perdante] = await variantes(S.P1, 2) as [string, string];
  S.adGagnante = await rattacher(S.gagnante, 'winner');
  await rattacher(S.perdante, 'loser');
  S.fil1 = await filProjet(S.P1, ids.brandA1);
  // ── P2 (A1) · un AUTRE projet de la même marque, son propre fil.
  S.P2 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Autre projet A1' })).projectId;
  S.fil2 = await filProjet(S.P2, ids.brandA1);
  // ── P3 (A2) · un projet d'une AUTRE marque, une gagnante · jamais désignable depuis A1.
  S.P3 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' })).projectId;
  const [v3] = await variantes(S.P3, 1);
  S.adP3 = await rattacher(v3!, 'winner');
  S.fil3 = await filProjet(S.P3, ids.brandA2);

  // ── Résultats (A1) · L1 · V1 gagnante, V2 perdante · L5 · deux gagnantes (pub ambiguë).
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Crème');
  S.L1 = await lot(3, 'Affirmation ou question ?');
  S.V1 = await ad(c1, S.L1, 'V1', 'winner');
  await ad(c1, S.L1, 'V2', 'loser');
  const c5 = await chaine(ids.wsA, ids.brandA1, 'Baume');
  S.L5 = await lot(8, 'Deux gagnantes');
  S.X1 = await ad(c5, S.L5, 'V1', 'winner');
  S.X2 = await ad(c5, S.L5, 'V2', 'winner');
  // ── L6 · une gagnante au BOUT d'une lignée qui a changé deux fois chaque variable admise sauf la preuve · plus aucune suite.
  const c6 = await chaine(ids.wsA, ids.brandA1, 'Lignée longue');
  const usees = (VARIABLES_ECRAN as readonly TestedVariable[]).filter((v) => !['hook', 'offer', 'angle', 'desire', 'proof'].includes(v)).flatMap((v) => [v, v]);
  let parent = await ad(c6, null, 'R0', null);
  for (const [i, v] of usees.entries()) {
    const enfant = await ad(c6, null, `R${i + 1}`, null);
    await db.insert(schema.iterationEdges).values({ workspaceId: ids.wsA, parentAdId: parent, childAdId: enfant, changedVariable: v, mode: 'more' });
    parent = enfant;
  }
  S.L6 = await lot(9, 'Lignée épuisée');
  await db.update(schema.ads).set({ batchId: S.L6, variantCode: 'C9' }).where(eq(schema.ads.id, parent));
  await verdict(parent, 'winner');
  S.bout = parent;

  h.session = proprietaire(); h.marque = ids.brandA1;
  const plan = await iterationPlanAction();
  const tous = variablesDuPlan(plan.view!.rows);
  const autre = (adId: string) => {
    const c = tous[adId];
    if (!c) throw new Error(`préalable · ${adId} n’est pas dans le plan d’itération`);
    return c.options.find((o) => o.admise && o.variable !== c.defaut && VOCABULAIRE_VARIABLES[o.variable].length)!.variable;
  };
  admiseProjet = autre(S.adGagnante);
  admiseV1 = autre(S.V1);
  choixV1 = tous[S.V1]!;
  if (tous[S.bout]?.options.filter((o) => o.admise).map((o) => o.variable).join() !== 'proof') throw new Error(`préalable · la lignée épuisée n’admet que la preuve · ${JSON.stringify(tous[S.bout]?.options.filter((o) => o.admise).map((o) => o.variable))}`);
  // Les libellés RÉELS des variantes, tels que la fiche les écrit.
  const r = await chargerProjet(h.session as never, S.P1);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  S.libGagnante = r.props.creations.variantes.find((v) => v.id === S.gagnante)!.libelle;
  S.libPerdante = r.props.creations.variantes.find((v) => v.id === S.perdante)!.libelle;
}, 240_000);
afterAll(async () => { await mock.fermer(); });

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);

/** Tout ce qu'une ouverture pourrait écrire · comparé avant / après, plus les appels au modèle. */
async function traces() {
  const n = async (t: typeof schema.ads) => (await db.select().from(t)).length;
  return {
    modele: mock.recues.length,
    depense: await n(schema.aiSpend as never), credits: await n(schema.creditLedger as never),
    ads: await n(schema.ads), aretes: await n(schema.iterationEdges as never), messages: await n(schema.jarvisMessages as never),
    propositions: await n(schema.studioProposals as never), devis: await n(schema.studioQuotes as never), jobs: await n(schema.studioJobs as never),
    versions: await n(schema.studioProjectVersions as never),
  };
}

let root: Root | null = null;
const fetchOrigine = globalThis.fetch;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; globalThis.fetch = fetchOrigine; });
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
  const el = document.querySelector<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur);
  await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const pubChoisie = () => [...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'));
const iterer = (sp: Record<string, string>) => IterationSpatiale({ searchParams: Promise.resolve(sp) });

/** La fiche d'un projet, montée · la VRAIE lecture serveur (`chargerProjet`), le panneau Jarvis tel qu'il s'affiche. */
async function fiche(projectId = S.P1) {
  const r = await chargerProjet(h.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return r.props;
}
const gesteProjet = () => document.querySelector<HTMLAnchorElement>('aside.jpanel [data-gestes-projet] [data-geste-jarvis="iterer"]');

/* ───────────────────────────── PC E35 · le panneau d'un projet ───────────────────────────── */

describe('lot 5 ter · panneau Jarvis d’un projet · « Créer l’itération » seulement sur une variante désignée sûrement', () => {
  it('la réponse nomme la gagnante · le lien vers Itérer, le reste du panneau inchangé, rien d’écrit', async () => {
    const id = await message({ contenu: `L’${S.libGagnante.toLowerCase()} gagne nettement. Décline-la en testant ${terme(admiseProjet)}.`, conversationId: S.fil1 });
    const avant = await traces();
    const props = await fiche();
    await monter(<Projet {...props} />);
    const g = gesteProjet();
    expect(g?.getAttribute('href'), 'le geste du projet').toBe(lienIterationJarvis({ type: 'projet', id: S.P1 }, id));
    expect(g!.getAttribute('data-variante'), 'la variante désignée').toBe(S.gagnante);
    expect(document.querySelector('aside.jpanel [data-gestes-projet]')!.textContent).toContain(`Depuis ${S.libGagnante}`);
    // Le panneau SANS la liste des gagnantes · identique, à l'ajout près (puces, suggestion, patch, devis).
    const html = renderToStaticMarkup(avecSpatial(<Projet {...props} />));
    const sans = renderToStaticMarkup(avecSpatial(<Projet {...props} jarvis={{ ...props.jarvis, iteration: null }} />));
    const panneau = (x: string) => { const d = dom(x); d.querySelector('[data-gestes-projet]')?.remove(); return d.querySelector('aside.jpanel')!.outerHTML; };
    expect(panneau(html), 'le reste du panneau est inchangé').toBe(panneau(sans));
    expect(dom(html).querySelectorAll('aside.jpanel [data-gestes-projet]'), 'un seul geste, sous la dernière réponse').toHaveLength(1);
    expect(await traces(), 'aucune écriture, aucun appel à l’ouverture').toEqual(avant);
  });

  it('rien de sûr · la perdante, deux variantes, un brief · aucun geste', async () => {
    for (const contenu of [
      `L’${S.libPerdante.toLowerCase()} perd. Décline-la en testant ${terme(admiseProjet)}.`,
      `L’${S.libGagnante.toLowerCase()} et l’${S.libPerdante.toLowerCase()} se valent sur le coût par achat.`,
      'Ton brief manque d’une cible précise. La direction artistique est solide.',
    ]) {
      await message({ contenu, conversationId: S.fil1 });
      await monter(<Projet {...await fiche()} />);
      expect(document.querySelector('aside.jpanel p')?.textContent, `la réponse est affichée · ${contenu}`).toBeTruthy();
      expect(gesteProjet(), contenu).toBeNull();
    }
  });

  it('la seule gagnante ET un conseil · le geste · ouvert, Itérer pré-rempli · rien de créé avant le clic, créé au clic', async () => {
    const id = await message({ contenu: `Pour la prochaine itération, teste ${terme(admiseProjet)} sur ta gagnante.`, conversationId: S.fil1 });
    await monter(<Projet {...await fiche()} />);
    const href = gesteProjet()?.getAttribute('href');
    expect(href, 'la seule gagnante, avec un conseil').toBe(lienIterationJarvis({ type: 'projet', id: S.P1 }, id));
    const avant = await traces();
    globalThis.fetch = vi.fn(async () => { throw new Error('aucun appel réseau attendu'); }) as unknown as typeof fetch;
    await monter(await iterer(params(href!)));
    expect(document.querySelector('[data-note-jarvis]')?.textContent).toContain(`Variable proposée par Jarvis · ${LIBELLE_CHOIX_VARIABLE[admiseProjet]}.`);
    expect(pubChoisie(), 'la pub Adsmap de la variante gagnante').toEqual([S.adGagnante]);
    expect(document.body.innerHTML, 'la gagnante de l’autre marque').not.toContain(S.adP3);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'la variable conseillée, admise').toEqual([admiseProjet]);
    expect(await traces(), 'rien de créé avant le clic').toEqual(avant);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────── G07 · « Autre variable » ───────────────────────────── */

async function demander(href: string, reponse: string) {
  await monter((await JarvisSpatial({ searchParams: Promise.resolve(params(href)) })) as ReactElement);
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? '{}')) as { message: string; conversationId: string | null; brandId: string };
    if (u === '/api/jarvis/chat') {
      const base = { workspaceId: ids.wsA, brandId: b.brandId, userId: ids.ua, conversationId: b.conversationId };
      await db.insert(schema.jarvisMessages).values({ ...base, role: 'user', content: b.message });
      await db.insert(schema.jarvisMessages).values({ ...base, role: 'assistant', content: reponse, createdAt: new Date(Date.now() + 1000) });
    }
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(reponse)); c.close(); } }), { status: 200 });
  }) as unknown as typeof fetch;
  if (!document.querySelector<HTMLInputElement>('#jin')!.value) await saisir('#jin', 'Que me conseilles-tu ?');
  await act(async () => { document.querySelector<HTMLButtonElement>('#jform button[type="submit"]')!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  const [m] = await db.select({ id: schema.jarvisMessages.id }).from(schema.jarvisMessages).where(eq(schema.jarvisMessages.content, reponse));
  return m!.id;
}
const geste = (cle: string) => document.querySelector<HTMLElement>(`[data-gestes-jarvis] [data-geste-jarvis="${cle}"]`);

describe('lot 5 ter · « Autre variable » · la variable SUIVANTE admise, ou pourquoi il n’y en a pas', () => {
  it('une variable désignée · le lien nomme la suivante (le conseil du plan) · Itérer la coche, rien de créé', async () => {
    const suivante = choixV1.defaut!;
    expect([suivante !== admiseV1, choixV1.options.find((o) => o.variable === suivante)?.admise, suivante !== 'hook'], 'préalable · le conseil du plan est admis, jamais testé sur V1, et n’est pas celui de Jarvis').toEqual([true, true, true]);
    const id = await demander(lienJarvisContexte('lot', S.L1)!, `La V1 l’emporte. Je te conseille de tester ${terme(admiseV1)} sur la V1.`);
    const a = geste('autre');
    expect(a?.tagName, '« Autre variable » est un lien').toBe('A');
    expect(a!.getAttribute('href')).toBe(lienIterationJarvis({ type: 'lot', id: S.L1 }, id, { autre: true }));
    expect(a!.textContent, 'le nom de la suivante').toBe(`Autre variable · ${LIBELLE_CHOIX_VARIABLE[suivante]}`);
    const avant = await traces();
    await monter(await iterer(params(a!.getAttribute('href')!)));
    expect(pubChoisie(), 'la pub de départ').toEqual([S.V1]);
    expect(document.querySelector('[data-note-jarvis]')?.textContent).toContain(`Autre variable · ${LIBELLE_CHOIX_VARIABLE[suivante]}, à la place de ${VARIABLE_LABEL[admiseV1]} que Jarvis proposait.`);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    expect(coche(), 'la suivante, pas celle de Jarvis').toEqual([suivante]);
    expect(await traces(), 'rien de créé, aucun appel').toEqual(avant);
  });

  it('plus aucune suite (lignée épuisée) · le geste est absent, la phrase dit pourquoi', async () => {
    await demander(lienJarvisContexte('lot', S.L6)!, 'La C9 gagne encore. Teste une nouvelle preuve, un avant et après.');
    expect(geste('iterer')?.tagName, 'préalable · « Créer l’itération » ouvert').toBe('A');
    expect(geste('autre'), 'aucune suite · aucun lien').toBeNull();
    expect(document.querySelector('[data-raison-geste="autre"]')?.textContent).toBe('Autre variable · Aucune autre variable n’est admise pour C9 · les autres sont acquises, structurelles ou déjà essayées assez de fois.');
  });

  it('pas de pub de départ sûre (deux gagnantes) · absent, et dit pourquoi · aucune variable désignée · absent, sans phrase', async () => {
    await demander(lienJarvisContexte('lot', S.L5)!, `Teste ${terme(admiseV1)}.`);
    expect(geste('autre')).toBeNull();
    expect(document.querySelector('[data-raison-geste="autre"]')?.textContent).toBe(`Autre variable · ${RAISON_AUTRE_SANS_PUB}`);
    await demander(lienJarvisContexte('lot', S.L1)!, 'Bravo, la V1 coûte deux fois moins par achat.');
    expect(geste('autre')).toBeNull();
    expect(document.querySelector('[data-raison-geste="autre"]'), 'rien à proposer, rien à expliquer').toBeNull();
  });
});

/* ───────────────────────────── G07 · « Pourquoi ? » ───────────────────────────── */

describe('lot 5 ter · « Pourquoi ? » prépare la question · rien d’envoyé, aucune dépense, prix annoncé inchangé', () => {
  it('la question sur la pub de départ dans le champ · aucun appel, aucune écriture', async () => {
    await demander(lienJarvisContexte('lot', S.L1)!, `La V1 gagne. Décline-la : teste ${terme(admiseV1)}.`);
    const avant = await traces();
    const espion = vi.fn(async () => { throw new Error('aucun envoi attendu'); });
    globalThis.fetch = espion as unknown as typeof fetch;
    await cliquer(geste('pourquoi'), '« Pourquoi ? »');
    expect(document.querySelector<HTMLInputElement>('#jin')!.value).toBe(`Pourquoi la variante « V1 » a-t-elle gagné, et pourquoi changer ${VARIABLE_LABEL[admiseV1]} plutôt qu’une autre variable ? Appuie-toi sur ses chiffres.`);
    expect(document.activeElement?.id, 'le focus dans le champ').toBe('jin');
    expect(espion, 'rien n’est envoyé').not.toHaveBeenCalled();
    expect(await traces(), 'aucune ligne de dépense, aucun message').toEqual(avant);
    expect(document.querySelector('#jform button[type="submit"]')!.getAttribute('title'), 'le prix annoncé avant l’envoi, inchangé').toBe(annonceConversationJarvis(regimeSession(h.session as never)));
  });

  it('pas de pub sûre · « Pourquoi ? » fermé, sa raison écrite à côté, le champ intact', async () => {
    await demander(lienJarvisContexte('lot', S.L5)!, 'Les deux variantes se tiennent. Teste une accroche.');
    const b = geste('pourquoi')!;
    expect([b.tagName, b.getAttribute('aria-disabled')]).toEqual(['BUTTON', 'true']);
    expect(document.getElementById(b.getAttribute('aria-describedby')!)!.textContent).toBe('Pourquoi ? · Jarvis ne désigne aucune pub de départ sûre · « Pourquoi ? » porte sur une pub précise.');
    await cliquer(b, 'fermé');
    expect(document.querySelector<HTMLInputElement>('#jin')!.value).toBe('');
  });
});

/* ───────────────────────────── refus sans fuite ───────────────────────────── */

describe('lot 5 ter · autre marque, autre projet, autre personne, fil principal · la même phrase, rien d’ailleurs', () => {
  it('Itérer depuis un projet ou « Autre variable » hors portée · refus, aucun pré-choix, rien d’écrit', async () => {
    const t = `L’${'image 1 du lot 1'} gagne. Décline-la en testant ${terme(admiseProjet)}.`;
    const dansP1 = await message({ contenu: t, conversationId: S.fil1 });
    const dansP2 = await message({ contenu: `SECRET_P2 · ${t}`, conversationId: S.fil2 });
    const dansP3 = await message({ contenu: `SECRET_P3 · ${t}`, brandId: ids.brandA2, conversationId: S.fil3 });
    const principal = await message({ contenu: `SECRET_PRINCIPAL · ${t}` });
    const autrePersonne = await message({ contenu: `SECRET_UV · ${t}`, user: ids.uv, conversationId: S.fil1 });
    const lotA2 = await message({ contenu: 'SECRET_A2 · teste une accroche.', brandId: ids.brandA2 });
    // Un fil FORGÉ · une conversation de la marque A1 rattachée au projet de A2 · la réponse est « lisible », le projet ne l'est pas.
    const forge = await message({ contenu: `SECRET_FORGE · ${t}`, conversationId: await filProjet(S.P3, ids.brandA1) });
    const cas: Array<[string, Record<string, string>]> = [
      ['réponse d’un AUTRE projet de la marque', params(lienIterationJarvis({ type: 'projet', id: S.P1 }, dansP2)!)],
      ['réponse de P1, projet P2 désigné', params(lienIterationJarvis({ type: 'projet', id: S.P2 }, dansP1)!)],
      ['projet d’une autre marque', params(lienIterationJarvis({ type: 'projet', id: S.P3 }, dansP3)!)],
      ['projet d’une autre marque, réponse de P1', params(lienIterationJarvis({ type: 'projet', id: S.P3 }, dansP1)!)],
      ['réponse du fil principal', params(lienIterationJarvis({ type: 'projet', id: S.P1 }, principal)!)],
      ['réponse d’une autre personne', params(lienIterationJarvis({ type: 'projet', id: S.P1 }, autrePersonne)!)],
      ['fil forgé · conversation A1 rattachée au projet de A2', params(lienIterationJarvis({ type: 'projet', id: S.P3 }, forge)!)],
      ['« Autre variable » · réponse d’une autre marque', params(lienIterationJarvis({ type: 'lot', id: S.L1 }, lotA2, { autre: true })!)],
      ['« Autre variable » · valeur forgée', { ...params(lienIterationJarvis({ type: 'lot', id: S.L1 }, dansP1)!), autre: 'offer' }],
    ];
    for (const [nom, sp] of cas) {
      const avant = await traces();
      const html = renderToStaticMarkup(avecSpatial(await iterer(sp)));
      const d = dom(html);
      expect(d.querySelector('[data-note-jarvis]')?.textContent, nom).toBe(REFUS_GESTE_JARVIS);
      expect(d.querySelectorAll('[data-itad][aria-pressed="true"]'), `${nom} · aucune pub présélectionnée`).toHaveLength(0);
      expect(html, nom).not.toMatch(/SECRET/);
      expect(html, nom).not.toContain(S.adP3);
      expect(await traces(), nom).toEqual(avant);
    }
    // Le témoin · la MÊME réponse, dans SON projet · acceptée (le refus vient bien de la portée).
    const ok = dom(renderToStaticMarkup(avecSpatial(await iterer(params(lienIterationJarvis({ type: 'projet', id: S.P1 }, dansP1)!)))));
    expect(ok.querySelector('[data-note-jarvis]')?.textContent).not.toBe(REFUS_GESTE_JARVIS);
    expect([...ok.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'))).toEqual([S.adGagnante]);
  });

  it('la fiche d’un projet de A2 ne lit que SES gagnantes · jamais celle de A1', async () => {
    h.marque = ids.brandA2;
    await message({ contenu: `Décline l’image 1 du lot 1 en testant ${terme(admiseProjet)}.`, brandId: ids.brandA2, conversationId: S.fil3 });
    const p3 = await fiche(S.P3);
    expect(p3.jarvis.iteration?.candidats.map((c) => c.adId), 'la gagnante de SON projet').toEqual([S.adP3]);
    expect(JSON.stringify(p3)).not.toContain(S.adGagnante);
  });

  it('au clic seulement · « Créer l’itération » sur l’écran d’arrivée crée l’itération du projet', async () => {
    const id = await message({ contenu: `Décline l’${S.libGagnante.toLowerCase()} : teste ${terme(admiseProjet)}.`, conversationId: S.fil1 });
    await monter(await iterer(params(lienIterationJarvis({ type: 'projet', id: S.P1 }, id)!)));
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    const avant = await traces();
    await saisir('[data-champ="valeur"]', 'Une valeur nouvelle et précise');
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer');
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    const [e] = await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, S.adGagnante));
    expect(e?.changedVariable, 'au clic, l’itération porte la variable de la réponse').toBe(admiseProjet);
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.modele - avant.modele, apres.depense - avant.depense], 'une ad au clic, aucun appel, aucune dépense').toEqual([1, 0, 0]);
  });
});
