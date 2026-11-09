// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 5 quater V5 · Jarvis mesuré sur ses vraies réponses, « Tester » et
 * « Corriger le texte » · base RÉELLE (pglite, migrations du dépôt), pages
 * RÉELLES rendues et montées · on lit le DOM et ce qui est écrit.
 *
 *  · l'écran de mesure (`/admin/jarvis-mesure`) · chiffres justes sur un semis
 *    de réponses connues, aucune réponse d'un autre espace lue ni affichée,
 *    aucun nom de marque d'un autre espace, exemples de la personne seulement,
 *    aucun appel au modèle, aucune ligne de dépense, refusé hors Admin+ ·
 *    rapide sur 500 réponses réalistes ;
 *  · « Tester » et « Corriger le texte » sous une réponse (lot joint sur
 *    `/jarvis`, panneau d'un projet) · présents seulement quand c'est sûr ·
 *    l'écran d'arrivée (fiche du projet, atelier Textes) pré-rempli · rien
 *    d'écrit, de généré ni d'envoyé avant le clic ;
 *  · autre marque, autre projet, adresse forgée · la même phrase, rien d'ailleurs.
 * 0 $ · fournisseur simulé, le faux fournisseur compte tout appel qui sortirait.
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
  BORNE_MESURE_JARVIS, REFUS_GESTE_JARVIS, lienCorrigerJarvis, lienJarvisContexte, lienTesterJarvis, MESURE_TEMPS_MESURE_JARVIS,
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
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import TextesSpatial from '../app/(spatial)/sp/studio/projets/[id]/textes/page';
import MesureJarvisSpatial from '../app/(spatial)/sp/admin/jarvis-mesure/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const S = { P1: '', P3: '', fil1: '', fil3: '', testee: '', libre: '', libTestee: '', libLibre: '', adTestee: '', L1: '', V2: '', L2: '', v3: '' };
const fondatrice = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(number: number, goal: string, brandId = ids.brandA1) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return b!.id;
}
async function verdict(adId: string, v: 'winner' | 'loser') {
  await db.insert(schema.verdicts).values({
    adId, workspaceId: ids.wsA, computed: v, validated: v, status: 'validated', comparable: true,
    metricsAgg: { spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6 },
  });
}
async function filProjet(projectId: string, brandId: string, user = ids.ua) {
  const [c] = await db.insert(schema.jarvisConversations).values({ workspaceId: ids.wsA, brandId, userId: user, projectId, titre: 'Fil du projet' }).returning({ id: schema.jarvisConversations.id });
  return c!.id;
}
let horloge = Date.now() - 86_400_000;
async function message(o: { contenu: string; ws?: string; brandId?: string; user?: string; conversationId?: string | null; role?: 'assistant' | 'user' }) {
  horloge += 1000;
  const [m] = await db.insert(schema.jarvisMessages).values({
    workspaceId: o.ws ?? ids.wsA, brandId: o.brandId ?? ids.brandA1, userId: o.user ?? ids.ua, conversationId: o.conversationId ?? null,
    role: o.role ?? 'assistant', content: o.contenu, createdAt: new Date(horloge),
  }).returning({ id: schema.jarvisMessages.id });
  return m!.id;
}
async function variantes(projectId: string, n: number, brandOwner = 'ua' as const) {
  const job = await lancerLot(db, ctxDe(ids, brandOwner), projectId, KEYFRAMES(n));
  await executer(db, job);
  const s = await sortiesDuJob(db, job);
  const out: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    const v = await creerVariante(ctxDe(ids, brandOwner), { assetId: s[`keyframe:s${i}`]! });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    out.push(v.variante.id);
  }
  return out;
}

/** Tout ce qu'une ouverture pourrait écrire · comparé avant / après, plus les appels au modèle. */
async function traces() {
  const n = async (t: unknown) => (await db.select().from(t as typeof schema.ads)).length;
  return {
    modele: mock.recues.length,
    depense: await n(schema.aiSpend), credits: await n(schema.creditLedger), ads: await n(schema.ads), messages: await n(schema.jarvisMessages),
    liens: await n(schema.studioTestLinks), versions: await n(schema.studioProjectVersions), jobs: await n(schema.studioJobs), runs: await n(schema.studioPromptRuns),
  };
}

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée du faux fournisseur.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  // La porte Admin+ RÉELLE (`porteAdmin` · admin de l'espace ET fondateur) · `ua` est fondatrice par l'environnement.
  process.env.FOUNDER_EMAILS = 'ua@studios.test';
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));

  // ── P1 (A1) · deux variantes · l'une rattachée à un test (gagnante), l'autre libre (sans test).
  S.P1 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · essai Jarvis' })).projectId;
  [S.testee, S.libre] = await variantes(S.P1, 2) as [string, string];
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: S.testee, saisie: saisieTest() });
  if (!l.ok) throw new Error(`rattacher ${l.code}`);
  S.adTestee = l.lien.adsmapAdId;
  await verdict(S.adTestee, 'winner');
  S.fil1 = await filProjet(S.P1, ids.brandA1);
  // ── P3 (A2) · une variante d'une AUTRE marque · jamais désignable depuis A1.
  S.P3 = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'SECRET_PROJET_A2' })).projectId;
  S.v3 = (await variantes(S.P3, 1))[0]!;
  S.fil3 = await filProjet(S.P3, ids.brandA2);

  // ── L1 (A1) · V1 = la pub Adsmap de la variante testée de P1 (rangée dans le lot), V2 · une pub sans projet Studio.
  S.L1 = await lot(3, 'Accroche douleur ou bénéfice ?');
  await db.update(schema.ads).set({ batchId: S.L1, variantCode: 'V1' }).where(eq(schema.ads.id, S.adTestee));
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Crème');
  const [v2] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: c1, batchId: S.L1, variantCode: 'V2', status: 'done', hypothesis: 'Si on teste V2, alors le coût baisse.', testedVariable: 'hook' }).returning({ id: schema.ads.id });
  S.V2 = v2!.id;
  await verdict(S.V2, 'loser');

  h.session = fondatrice(); h.marque = ids.brandA1;
  const r = await chargerProjet(h.session as never, S.P1);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  S.libTestee = r.props.creations.variantes.find((v) => v.id === S.testee)!.libelle;
  S.libLibre = r.props.creations.variantes.find((v) => v.id === S.libre)!.libelle;
}, 240_000);
afterAll(async () => { await mock.fermer(); delete process.env.FOUNDER_EMAILS; });

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
let root: Root | null = null;
const fetchOrigine = globalThis.fetch;
beforeEach(() => { h.session = fondatrice(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; globalThis.fetch = fetchOrigine; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
}
async function saisir(sel: string, valeur: string) {
  const el = document.querySelector<HTMLInputElement>(sel)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, valeur);
  await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
}
/** Une réponse de Jarvis sous un lot joint · envoyée par le VRAI écran (route remplacée à la frontière), relue dans le fil affiché. */
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
  globalThis.fetch = fetchOrigine;
  const [m] = await db.select({ id: schema.jarvisMessages.id }).from(schema.jarvisMessages).where(eq(schema.jarvisMessages.content, reponse));
  return m!.id;
}
const essai = (cle: string) => document.querySelector<HTMLElement>(`[data-essai-jarvis] [data-geste-jarvis="${cle}"]`);
const raison = (cle: string) => document.querySelector(`[data-essai-jarvis] [data-raison-geste="${cle}"]`)?.textContent ?? null;
const mesure = async (sp: Record<string, string> = {}) => renderToStaticMarkup(avecSpatial((await MesureJarvisSpatial({ searchParams: Promise.resolve(sp) })) as ReactElement));
const ns = (d: ParentNode): Record<string, number> => Object.fromEntries([...d.querySelectorAll('[data-cause]')].map((x) => [x.getAttribute('data-cause'), Number(x.querySelector('[data-n]')!.textContent)]));

/* ───────────────────────────── l'écran de mesure ───────────────────────────── */

describe('lot 5 quater · l’écran de mesure · la règle rejouée sur les réponses stockées, en lecture seule', () => {
  it('chiffres justes sur un semis connu · exemples de la personne seulement, anonymisés · rien d’un autre espace · aucun appel, aucune dépense', async () => {
    // Le semis · 3 sûres, 2 sans conseil, 2 négations, 1 hors liste, 2 plusieurs, 1 pub ambiguë (dont 4 d'un autre membre · deux causes de même effectif ne s'échangeraient pas en silence) · un message de la personne (rôle « user ») et l'espace B ne comptent pas.
    for (const [contenu, user] of [
      ['La V1 gagne. Teste une nouvelle accroche, plus directe.', ids.ua],
      ['La V1 gagne. Teste une nouvelle accroche, chez Marque B1 secrète on voit ça sur https://concurrent.fr/promo.', ids.ua],
      ['Pour la V3, ajoute un témoignage client filmé.', ids.ur],
      ['La V1 gagne nettement · 18 € par achat contre 31 €.', ids.ua],
      ['SECRET_AUTRE_MEMBRE · le lot est trop jeune.', ids.ur],
      ['Ne change pas l’accroche, elle fonctionne.', ids.ua],
      ['Garde l’offre et ne change pas le format, il gagne.', ids.ur],
      ['Teste une nouvelle couleur de fond, plus chaude.', ids.ua],
      ['Teste une nouvelle accroche et une autre offre.', ids.ua],
      ['Change la musique et le format.', ids.ur],
      ['Teste une nouvelle accroche sur la V1 ou sur la V2.', ids.ua],
    ] as const) await message({ contenu, user, brandId: contenu.startsWith('Change') ? ids.brandA2 : ids.brandA1 });
    await message({ contenu: 'Teste une accroche, dit la personne.', role: 'user' });
    // Une réponse de l'espace B portée par la MÊME personne · lue par erreur, elle s'afficherait parmi ses exemples.
    await db.insert(schema.jarvisMessages).values({ workspaceId: ids.wsB, brandId: ids.brandB1, userId: ids.ua, role: 'assistant', content: 'SECRET_ESPACE_B · Teste une nouvelle accroche.' });

    const avant = await traces();
    const d = dom(await mesure());
    const html = d.innerHTML;
    expect(html, 'aucune réponse d’un autre espace').not.toContain('SECRET_ESPACE_B');
    expect(ns(d), 'une réponse, une cause').toEqual({ sure: 3, aucun_conseil: 2, negation: 2, hors_liste: 1, plusieurs: 2, pub_ambigue: 1 });
    const kpis = d.querySelector('.akpis')!.textContent!;
    expect(kpis).toContain('Réponses lues11');
    expect(kpis, 'rien de sûr · 8 sur 11').toContain('72.7 %');
    expect(d.querySelector('[data-comparaison]')!.textContent).toContain('Trop peu de réponses pour comparer au banc (11 sur 30 au moins)');
    const exemples = [...d.querySelectorAll('[data-exemple]')];
    expect(exemples, 'seules les réponses de la personne qui lit').toHaveLength(7);
    expect(html, 'un autre membre est compté, jamais montré').not.toContain('SECRET_AUTRE_MEMBRE');
    expect(html, 'aucun nom de marque d’un autre espace').not.toContain('Marque B1 secrète');
    expect(html, 'aucune adresse').not.toContain('concurrent.fr');
    expect(html).toContain('[marque]');
    expect(html, 'pas de tiret cadratin').not.toContain('—');
    expect(d.querySelectorAll('main button, main form, main input, main select, main textarea').length + [...d.querySelectorAll('button, form, input, textarea')].filter((x) => !x.closest('header, nav, .astrip')).length, 'lecture seule · aucun bouton ni formulaire').toBe(0);
    expect(await traces(), 'aucune écriture, aucun appel au modèle, aucune dépense').toEqual(avant);
  });

  it('le filtre et la pagination · les liens portent la cause, une cause forgée est ignorée', async () => {
    const d = dom(await mesure({ cause: 'sure' }));
    expect([...d.querySelectorAll('[data-exemple]')].map((x) => x.getAttribute('data-exemple'))).toEqual(['sure', 'sure']);
    expect(d.querySelector('[data-cause="negation"] a')!.getAttribute('href')).toBe('/admin/jarvis-mesure?cause=negation');
    expect(dom(await mesure({ cause: '<script>' })).querySelectorAll('[data-exemple]')).toHaveLength(7);
  });

  it('refusé hors Admin+ · AVANT toute lecture · une propriétaire non fondatrice, une fondatrice simple membre', async () => {
    for (const [nom, s] of [
      ['propriétaire non fondatrice', session(ids, 'ur', { role: 'owner', plan: 'plus' })],
      ['fondatrice, simple membre', session(ids, 'ua', { role: 'member', plan: 'plus' })],
      ['sans session', null],
    ] as const) {
      h.session = s as SessionTest | null;
      await expect(MesureJarvisSpatial({ searchParams: Promise.resolve({}) }), nom).rejects.toThrow(/REDIRECT \/(dashboard|login)/);
    }
  });

  it('rapide et borné · 500 réponses réalistes lues, règle et rendu sous le plafond large, les plus anciennes au-delà de la borne ignorées', async () => {
    const corps = 'Voici ma lecture du lot. Les chiffres viennent de tes résultats Meta des quatorze derniers jours, la dépense suffit pour lire un écart. '.repeat(4);
    const conseils = ['Teste une nouvelle accroche sur la V1.', 'La V1 gagne nettement.', 'Teste une accroche et une offre.', 'Ajoute un témoignage client.', 'Ne change pas l’offre.'];
    const lignes = Array.from({ length: BORNE_MESURE_JARVIS + 20 }, (_, i) => ({
      workspaceId: ids.wsA, brandId: ids.brandA1, userId: i % 2 ? ids.ua : ids.ur, role: 'assistant',
      content: `${corps}${conseils[i % conseils.length]}\n\nPoints de vigilance · la fréquence monte, surveille la fatigue créative.`, createdAt: new Date(horloge + (i + 1) * 1000),
    }));
    for (let i = 0; i < lignes.length; i += 100) await db.insert(schema.jarvisMessages).values(lignes.slice(i, i + 100));
    const avant = await traces();
    const t0 = performance.now();
    const d = dom(await mesure());
    const ms = performance.now() - t0;
    console.info(`[mesure Jarvis · page] ${BORNE_MESURE_JARVIS} réponses · ${Math.round(ms)} ms (consigné · ${MESURE_TEMPS_MESURE_JARVIS.pageMs.join(' à ')} ms)`);
    expect(d.querySelector('.akpis')!.textContent, 'la borne, et l’écran le dit').toContain(`Réponses lues${BORNE_MESURE_JARVIS}les ${BORNE_MESURE_JARVIS} plus récentes`);
    expect(Object.values(ns(d)).reduce((a, b) => a + b, 0)).toBe(BORNE_MESURE_JARVIS);
    expect(d.querySelector('[data-page="suivante"]')?.getAttribute('href'), 'paginé').toBe('/admin/jarvis-mesure?page=2');
    expect(ms, 'plafond large, machine partagée').toBeLessThan(4000);
    expect(await traces()).toEqual(avant);
  });
});

/* ───────────────────────────── « Tester » et « Corriger le texte » · un lot joint ───────────────────────────── */

describe('lot 5 quater · sous une réponse avec un lot joint · présents seulement quand c’est sûr', () => {
  it('« Tester » la V1 (déjà en test) · le lot d’essai de SON projet, elle présélectionnée · rien d’écrit avant le clic', async () => {
    const id = await demander(lienJarvisContexte('lot', S.L1)!, 'La V1 l’emporte. Teste-la contre une nouvelle accroche plus directe.');
    const t = essai('tester');
    expect(t?.tagName, '« Tester » est un lien').toBe('A');
    expect(t!.getAttribute('href')).toBe(lienTesterJarvis(S.P1, { type: 'lot', id: S.L1 }, id));
    expect(document.querySelector('[data-essai-jarvis] [data-effet-geste="tester"]')?.textContent).toContain('Lot d’essai avec V1');
    expect(essai('corriger'), 'aucune correction conseillée').toBeNull();
    const avant = await traces();
    const href = t!.getAttribute('href')!;
    await monter((await ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(href)) })) as ReactElement);
    expect(document.querySelector('[data-note-jarvis]')?.textContent).toContain('Préparé depuis Jarvis · V1 a déjà son test');
    expect(document.querySelector(`[data-essai-variante="${S.testee}"]`)?.getAttribute('aria-pressed'), 'la variante présélectionnée').toBe('true');
    expect(document.querySelector(`[data-essai-variante="${S.libre}"]`)?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-essai-variable="accroche"]')?.getAttribute('aria-pressed'), 'l’accroche que Jarvis désigne').toBe('true');
    expect(document.querySelector('[data-plan-essai]'), 'aucun plan préparé sans le clic').toBeNull();
    expect(await traces(), 'rien d’écrit, aucun appel').toEqual(avant);
  });

  it('« Corriger le texte » de la V1 · l’atelier Textes de SON projet, la consigne et le texte cité dans le champ · rien d’écrit, rien de généré', async () => {
    const id = await demander(lienJarvisContexte('lot', S.L1)!, 'La V1 gagne. Reformule l’accroche de la V1 : « Dormez enfin, sans pilule ».');
    const c = essai('corriger');
    expect(c?.getAttribute('href')).toBe(lienCorrigerJarvis(S.P1, { type: 'lot', id: S.L1 }, id));
    const avant = await traces();
    await monter((await TextesSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(c!.getAttribute('href')!)) })) as ReactElement);
    expect(document.querySelector('[data-zone="ecrire-main"] textarea')?.textContent ?? (document.querySelector('[data-zone="ecrire-main"] textarea') as HTMLTextAreaElement).value).toBe('Dormez enfin, sans pilule');
    expect(document.querySelector('[data-consigne-jarvis]')?.textContent).toBe('Consigne de Jarvis · Reformule l’accroche de la V1 : « Dormez enfin, sans pilule ».');
    expect(document.querySelector('[role="group"][aria-label="Type du texte écrit à la main"] [aria-pressed="true"]')?.textContent, 'le type de texte').toBe('Hook');
    expect(document.querySelector('[data-zone="ecrire-ia"] [data-cout="texte"]')?.textContent, 'l’écriture IA garde son prix annoncé avant le clic').toBeTruthy();
    expect(document.querySelector('[data-confirmation="ecrire"]'), 'rien d’armé').toBeNull();
    expect(await traces(), 'rien d’écrit, rien de généré').toEqual(avant);
  });

  it('rien de sûr · la V2 (sans projet Studio) · aucun lien, la phrase dit pourquoi · une analyse · rien du tout', async () => {
    await demander(lienJarvisContexte('lot', S.L1)!, 'Teste la V2 sur une autre audience.');
    expect(essai('tester')).toBeNull();
    expect(raison('tester')).toBe('Tester · Jarvis parle de V2, qui n’est pas une gagnante arbitrée de ce contexte · rien n’est présélectionné, choisis la pub puis la variable.');
    await demander(lienJarvisContexte('lot', S.L1)!, 'Bravo, la V1 coûte deux fois moins par achat.');
    expect(document.querySelector('[data-essai-jarvis]'), 'la réponse ne parle ni de test ni de texte').toBeNull();
    expect(document.querySelector('[data-gestes-jarvis]'), 'préalable · les gestes du lot sont là').toBeTruthy();
  });
});

/* ───────────────────────────── le panneau d'un projet ───────────────────────────── */

describe('lot 5 quater · le panneau Jarvis d’un projet · « Tester » une variante sans test ouvre SON rattachement', () => {
  it('la réponse nomme la variante libre · le lien · la fiche s’ouvre sur Créations, le formulaire de rattachement ouvert, la variable cochée · rien d’envoyé', async () => {
    const id = await message({ contenu: `Teste l’${S.libLibre.toLowerCase()} avec une nouvelle accroche.`, conversationId: S.fil1 });
    const props = (await chargerProjet(h.session as never, S.P1));
    if (!props.ok) throw new Error('fiche');
    await monter(<Projet {...props.props} />);
    const t = document.querySelector('aside.jpanel [data-gestes-projet] [data-geste-jarvis="tester"]');
    expect(t?.getAttribute('href')).toBe(lienTesterJarvis(S.P1, { type: 'projet', id: S.P1 }, id));
    expect(t!.getAttribute('data-variante')).toBe(S.libre);
    const avant = await traces();
    await monter((await ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(t!.getAttribute('href')!)) })) as ReactElement);
    expect(document.querySelector('[data-ptab="crea"]')?.getAttribute('aria-pressed'), 'l’onglet Créations').toBe('true');
    const f = document.querySelector(`[data-formulaire-test="${S.libre}"]`);
    expect(f, 'le rattachement de CETTE variante est ouvert').toBeTruthy();
    expect(document.querySelectorAll('[data-formulaire-test]')).toHaveLength(1);
    expect(f!.querySelector<HTMLSelectElement>('select')?.value, 'la variable que Jarvis désigne').toBe('hook');
    expect(document.querySelector('[data-note-jarvis]')?.textContent).toContain('prête à être rattachée à un test · la variable que Jarvis désigne est cochée');
    expect(await traces(), 'rien n’est rattaché sans le clic').toEqual(avant);
  });

  it('« Corriger le texte » dans le panneau · le lien vers l’atelier Textes du projet', async () => {
    const id = await message({ contenu: `Réécris le CTA de l’${S.libLibre.toLowerCase()}, il est trop vague.`, conversationId: S.fil1 });
    const props = await chargerProjet(h.session as never, S.P1);
    if (!props.ok) throw new Error('fiche');
    await monter(<Projet {...props.props} />);
    expect(document.querySelector('aside.jpanel [data-gestes-projet] [data-geste-jarvis="corriger"]')?.getAttribute('href')).toBe(lienCorrigerJarvis(S.P1, { type: 'projet', id: S.P1 }, id));
    await monter((await TextesSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(lienCorrigerJarvis(S.P1, { type: 'projet', id: S.P1 }, id)!)) })) as ReactElement);
    expect(document.querySelector('[data-note-jarvis]')?.textContent).toContain('Jarvis ne cite aucun texte corrigé · écris-le d’après la consigne');
    expect((document.querySelector('[data-zone="ecrire-main"] textarea') as HTMLTextAreaElement).value, 'aucun texte inventé').toBe('');
    expect(document.querySelector('[role="group"][aria-label="Type du texte écrit à la main"] [aria-pressed="true"]')?.textContent).toBe('CTA');
  });

  it('une réponse qui ne parle ni de test ni de texte · aucun de ces gestes (le panneau d’avant)', async () => {
    await message({ contenu: 'Ton brief manque d’une cible précise. La direction artistique est solide.', conversationId: S.fil1 });
    const props = await chargerProjet(h.session as never, S.P1);
    if (!props.ok) throw new Error('fiche');
    await monter(<Projet {...props.props} />);
    expect(document.querySelector('aside.jpanel [data-essai-jarvis]')).toBeNull();
  });
});

/* ───────────────────────────── refus sans fuite ───────────────────────────── */

describe('lot 5 quater · autre marque, autre projet, adresse forgée · la même phrase, rien de pré-rempli, rien d’ailleurs', () => {
  it('« Tester » et « Corriger le texte » hors portée', async () => {
    const t = `Teste l’${S.libLibre.toLowerCase()} et reformule son accroche : « SECRET_CITATION ».`;
    const dansP1 = await message({ contenu: t, conversationId: S.fil1 });
    const dansP3 = await message({ contenu: `SECRET_P3 · ${t}`, brandId: ids.brandA2, conversationId: S.fil3 });
    const principal = await message({ contenu: `SECRET_PRINCIPAL · ${t}` });
    const autrePersonne = await message({ contenu: `SECRET_UR · ${t}`, user: ids.ur, conversationId: S.fil1 });
    const projet = { type: 'projet' as const, id: S.P1 };
    const casTester: Array<[string, string, Record<string, string>]> = [
      ['réponse d’une autre marque', S.P1, params(lienTesterJarvis(S.P1, projet, dansP3)!)],
      ['projet d’une autre marque', S.P3, params(lienTesterJarvis(S.P3, { type: 'projet', id: S.P3 }, dansP3)!)],
      ['réponse du fil principal', S.P1, params(lienTesterJarvis(S.P1, projet, principal)!)],
      ['réponse d’une autre personne', S.P1, params(lienTesterJarvis(S.P1, projet, autrePersonne)!)],
      ['geste forgé', S.P1, { ...params(lienTesterJarvis(S.P1, projet, dansP1)!), geste: 'corriger' }],
      ['contexte forgé', S.P1, { ...params(lienTesterJarvis(S.P1, projet, dansP1)!), contexte: 'resultats', id: 'ensemble' }],
    ];
    for (const [nom, pid, sp] of casTester) {
      const avant = await traces();
      const html = renderToStaticMarkup(avecSpatial((await ProjetSpatial({ params: Promise.resolve({ id: pid }), searchParams: Promise.resolve(sp) })) as ReactElement));
      const d = dom(html);
      expect(d.querySelector('[data-note-jarvis]')?.textContent, nom).toBe(REFUS_GESTE_JARVIS);
      expect(d.querySelectorAll('[data-formulaire-test]'), `${nom} · rien d’ouvert`).toHaveLength(0);
      expect(d.querySelectorAll('[data-essai-variante][aria-pressed="true"]'), `${nom} · rien de présélectionné`).toHaveLength(0);
      // Le panneau Jarvis de la fiche montre la dernière réponse de SON fil (lecture d'avant) · aucune réponse refusée n'y entre.
      expect(html, nom).not.toMatch(/SECRET_(P3|PRINCIPAL|UR)/);
      expect(await traces(), nom).toEqual(avant);
    }
    for (const [nom, sp] of [
      ['réponse d’une autre marque', params(lienCorrigerJarvis(S.P1, projet, dansP3)!)],
      ['réponse d’une autre personne', params(lienCorrigerJarvis(S.P1, projet, autrePersonne)!)],
      ['projet P3 désigné depuis P1', params(lienCorrigerJarvis(S.P1, { type: 'projet', id: S.P3 }, dansP1)!)],
    ] as const) {
      const html = renderToStaticMarkup(avecSpatial((await TextesSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(sp) })) as ReactElement));
      const d = dom(html);
      expect(d.querySelector('[data-note-jarvis]')?.textContent, nom).toContain(REFUS_GESTE_JARVIS);
      expect(d.querySelector('[data-consigne-jarvis]'), nom).toBeNull();
      expect(html, nom).not.toMatch(/SECRET/);
    }
    // Le témoin · la MÊME réponse, dans SON projet · acceptée (le refus vient bien de la portée).
    const ok = dom(renderToStaticMarkup(avecSpatial((await TextesSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve(params(lienCorrigerJarvis(S.P1, projet, dansP1)!)) })) as ReactElement)));
    expect(ok.querySelector('[data-consigne-jarvis]')?.textContent).toContain('SECRET_CITATION');
  });
});
