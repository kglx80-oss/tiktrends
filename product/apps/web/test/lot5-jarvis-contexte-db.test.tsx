// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 5 V5 · Jarvis EN CONTEXTE · base RÉELLE (pglite, migrations du dépôt),
 * pages RÉELLES rendues et montées · on lit le DOM et ce qui est écrit, jamais
 * la présence d'un appel. Le modèle est un faux fournisseur à la frontière HTTP
 * (`lot19b-mock-fournisseur`) · il compte ce qui lui ARRIVE.
 *
 *  · chaque point d'entrée (fiche d'un lot, tableau des hypothèses · page et
 *    carte, en-tête d'un projet) porte le lien vers `/jarvis` avec SON type et
 *    SON identifiant ;
 *  · `/jarvis` ouvert par ce lien · le contexte relu s'affiche (ce que Jarvis
 *    recevra), la question est PRÉPARÉE dans le champ · RIEN n'est envoyé :
 *    aucune requête au modèle, aucun message, aucune conversation, aucune
 *    dépense, aucune trace, aucun appel réseau du navigateur ;
 *  · un identifiant d'une autre marque, d'un autre espace, inconnu ou mal
 *    formé · refusé par la même phrase, rien de l'objet à l'écran ; à l'envoi
 *    la route refuse aussi (404), sans réservation ni appel ;
 *  · le prix annoncé avant l'envoi est le même, avec ou sans contexte ;
 *  · l'envoi, sur un clic seulement, part avec `{ type, id }` · la consigne
 *    reçue par le modèle porte le contexte relu par le serveur.
 * 0 $ · fournisseur simulé, aucun appel externe.
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
  REFUS_CONTEXTE_JARVIS, TITRE_BLOC_CONTEXTE_JARVIS, TITRE_BLOC_CONCEPT_JARVIS, annonceConversationJarvis, lienJarvisContexte,
  contenuVide, empreinteContenu, SCHEMA_VERSION_CONTENU, type ContenuVersion,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { briefCanonique } from './l4c-harnais';
import { avecSpatial } from './spatial/fournisseur';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';
import { regimeSession } from '../lib/credits-appels';
import { POST } from '../app/api/jarvis/chat/route';
import JarvisSpatial from '../app/(spatial)/sp/jarvis/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const ids = h.ids;
const S = { L1: '', L2: '', L3: '', V1: '', V2: '', H1: '', H2: '', P1: '', P2: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
const HYPO_A1 = 'Si on ouvre sur la preuve clinique, alors le coût par achat baisse, parce que la peur de l’irritation tombe.';

async function chaine(ws: string, brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function lot(ws: string, brandId: string, number: number, goal: string) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * 86_400_000) }).returning({ id: schema.batches.id });
  return b!.id;
}
async function ad(ws: string, conceptId: string, batchId: string | null, code: string, hypothesis: string, verdict: 'winner' | 'loser' | null) {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId, batchId, variantCode: code, status: batchId ? 'done' : 'draft', hypothesis, testedVariable: 'hook' }).returning({ id: schema.ads.id });
  if (verdict) await db.insert(schema.verdicts).values({ adId: a!.id, workspaceId: ws, computed: verdict, validated: verdict, status: 'validated', comparable: true, metricsAgg: { spend: 120, impressions: 18000, purchases: verdict === 'winner' ? 12 : 3, cpa: verdict === 'winner' ? 10 : 40, reason: verdict === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' } });
  return a!.id;
}
async function projet(brandId: string, titre: string) {
  const contenu: ContenuVersion = { ...contenuVide(), brief: briefCanonique({ objective: 'Faire acheter la crème' }) as ContenuVersion['brief'] };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId, kind: 'image', title: titre, ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return p!.id;
}

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => 'Réponse simulée du faux fournisseur.');
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  const c1 = await chaine(ids.wsA, ids.brandA1, 'Sérum');
  S.L1 = await lot(ids.wsA, ids.brandA1, 3, 'Affirmation ou question ?');
  S.V1 = await ad(ids.wsA, c1, S.L1, 'V1', HYPO_A1, 'winner');
  S.V2 = await ad(ids.wsA, c1, S.L1, 'V2', 'Si on pose une question, alors on retient, parce que la curiosité accroche.', 'loser');
  S.H1 = await ad(ids.wsA, c1, null, 'V3', 'Si on montre la texture, alors on rassure, parce que le toucher se voit.', null);
  const c2 = await chaine(ids.wsA, ids.brandA2, 'Concept secret A2');
  S.L2 = await lot(ids.wsA, ids.brandA2, 7, 'SECRET_LOT_A2');
  S.H2 = await ad(ids.wsA, c2, S.L2, 'V1', 'HYPOTHESE_SECRETE_A2', 'winner');
  const c3 = await chaine(ids.wsB, ids.brandB1, 'Concept secret B1');
  S.L3 = await lot(ids.wsB, ids.brandB1, 1, 'SECRET_LOT_B1');
  await ad(ids.wsB, c3, S.L3, 'V1', 'HYPOTHESE_SECRETE_B1', 'loser');
  S.P1 = await projet(ids.brandA1, 'Crème hiver');
  S.P2 = await projet(ids.brandA2, 'PROJET_SECRET_A2');
}, 240_000);
afterAll(async () => { await mock.fermer(); });

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const rendre = async (el: Promise<unknown> | unknown) => dom(renderToStaticMarkup(avecSpatial((await el) as ReactElement)));
const pageJarvis = (href: string) => JarvisSpatial({ searchParams: Promise.resolve(Object.fromEntries(new URL(`http://x${href}`).searchParams)) });
const lienDe = (d: ParentNode, type: string) => [...d.querySelectorAll<HTMLAnchorElement>(`[data-demander-jarvis="${type}"]`)].map((a) => a.getAttribute('href')!);

async function traces() {
  const n = (rows: unknown[]) => rows.length;
  return {
    modele: mock.recues.length,
    messages: n(await db.select({ id: schema.jarvisMessages.id }).from(schema.jarvisMessages)),
    conversations: n(await db.select({ id: schema.jarvisConversations.id }).from(schema.jarvisConversations)),
    depense: n(await db.select({ id: schema.aiSpend.id }).from(schema.aiSpend)),
    credits: n(await db.select({ id: schema.creditLedger.id }).from(schema.creditLedger)),
    runs: n(await db.select({ id: schema.studioPromptRuns.id }).from(schema.studioPromptRuns)),
  };
}

let root: Root | null = null;
const fetchOrigine = globalThis.fetch;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; globalThis.fetch = fetchOrigine; });
async function monter(el: ReactElement) {
  document.body.innerHTML = '<div id="app"></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
}
const champ = () => document.querySelector<HTMLInputElement>('#jin')!;

/* ───────────────────────────── points d'entrée ───────────────────────────── */

describe('lot 5 · chaque point d’entrée porte le bon lien', () => {
  it('fiche d’un lot · « Demander à Jarvis » joint CE lot', async () => {
    const d = await rendre(LotSpatial({ params: Promise.resolve({ id: S.L1 }) }));
    expect(lienDe(d, 'lot'), 'lien de la fiche du lot').toEqual([`/jarvis?contexte=lot&id=${S.L1}`]);
  });

  it('hypothèses · la page (question de la maquette) et chaque carte (SON ad)', async () => {
    const d = await rendre(HypothesesSpatial({ searchParams: Promise.resolve({}) }));
    expect(lienDe(d, 'resultats'), 'lien de la page').toEqual([lienJarvisContexte('resultats', 'hypotheses', 'Quelle variante tester ensuite ?')]);
    const cartes = lienDe(d, 'hypothese').map((u) => new URL(`http://x${u}`).searchParams.get('id'));
    expect(cartes, 'une carte par ad de la marque').toEqual(expect.arrayContaining([S.V1, S.V2, S.H1]));
    expect(cartes, 'rien d’une autre marque').not.toContain(S.H2);
    for (const a of d.querySelectorAll('[data-demander-jarvis="hypothese"]')) expect(a.getAttribute('aria-label')).toMatch(/^Demander à Jarvis · /);
  });

  it('en-tête d’un projet · joint CE projet', async () => {
    const d = await rendre(ProjetSpatial({ params: Promise.resolve({ id: S.P1 }), searchParams: Promise.resolve({}) }));
    expect(lienDe(d, 'projet'), 'lien de l’en-tête du projet').toEqual([`/jarvis?contexte=projet&id=${S.P1}`]);
  });
});

/* ───────────────────────────── Jarvis ouvert, rien d'envoyé ───────────────────────────── */

describe('lot 5 · Jarvis s’ouvre avec le contexte et la question préparée · RIEN n’est envoyé', () => {
  const cas: Array<{ nom: string; href: () => string; libelle: RegExp; ligne: RegExp; question: RegExp }> = [
    { nom: 'lot', href: () => lienJarvisContexte('lot', S.L1)!, libelle: /^Lot #3 · Affirmation ou question \?$/, ligne: /Variante V1 · Accroche · « Si on ouvre sur la preuve clinique/, question: /^Sur le Lot #3 · Affirmation ou question \? · que faut-il retenir/ },
    { nom: 'hypothèse', href: () => lienJarvisContexte('hypothese', S.H1)!, libelle: /^Hypothèse · Si on montre la texture/, ligne: /hors lot/, question: /est-elle bien formulée et vérifiable/ },
    { nom: 'page Résultats', href: () => lienJarvisContexte('resultats', 'hypotheses', 'Quelle variante tester ensuite ?')!, libelle: /^Résultats · Hypothèses$/, ligne: /^Page Résultats · Hypothèses · 1 lot/, question: /^Quelle variante tester ensuite \?$/ },
    { nom: 'projet', href: () => lienJarvisContexte('projet', S.P1)!, libelle: /^Projet · Crème hiver$/, ligne: new RegExp(`^${TITRE_BLOC_CONCEPT_JARVIS}$`), question: /^Sur le projet « Crème hiver »/ },
  ];

  for (const c of cas) {
    it(`${c.nom} · contexte affiché, question dans le champ, aucune requête ni écriture`, async () => {
      h.session = proprietaire(); h.marque = ids.brandA1;
      const avant = await traces();
      const espion = vi.fn(async () => { throw new Error('aucun appel réseau attendu à l’ouverture'); });
      globalThis.fetch = espion as unknown as typeof fetch;
      const el = await pageJarvis(c.href());
      // Rendu serveur · ce que le navigateur reçoit.
      const d = dom(renderToStaticMarkup(avecSpatial(el as ReactElement)));
      expect(d.querySelector('[data-libelle-contexte]')?.textContent, 'contexte affiché').toMatch(c.libelle);
      expect([...d.querySelectorAll('[data-lignes-contexte] li')].map((l) => l.textContent).some((l) => c.ligne.test(l ?? '')), 'ce que Jarvis recevra').toBe(true);
      expect(d.querySelector<HTMLInputElement>('#jin')?.getAttribute('value'), 'question préparée').toMatch(c.question);
      expect(d.querySelector('[data-refus-contexte]'), 'aucun refus').toBeNull();
      // Monté · l'état client garde la question, et rien ne part tout seul.
      await monter(el as ReactElement);
      await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
      expect(espion, 'aucun appel réseau du navigateur').not.toHaveBeenCalled();
      expect(await traces(), 'aucun appel au modèle, aucun message, aucune conversation, aucune dépense, aucun crédit, aucune trace').toEqual(avant);
      expect(champ().value, 'question préparée, montée').toMatch(c.question);
    });
  }

  it('une puce de question PRÉPARE le champ, elle n’envoie rien', async () => {
    const avant = await traces();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await monter((await pageJarvis(lienJarvisContexte('lot', S.L1)!)) as ReactElement);
    const puce = [...document.querySelectorAll<HTMLButtonElement>('[data-contexte-joint] .chip')].find((b) => b.textContent?.startsWith('Pourquoi la V1'));
    expect(puce, 'puce de la gagnante').toBeTruthy();
    await act(async () => { puce!.click(); });
    expect(champ().value).toBe(puce!.textContent);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await traces()).toEqual(avant);
  });
});

/* ───────────────────────────── autre marque · refus sans fuite ───────────────────────────── */

describe('lot 5 · un identifiant hors de la marque active est refusé, sans fuite', () => {
  const refuses = () => [
    ['lot d’une autre marque du même espace', lienJarvisContexte('lot', S.L2)!],
    ['lot d’un autre espace', lienJarvisContexte('lot', S.L3)!],
    ['hypothèse d’une autre marque', lienJarvisContexte('hypothese', S.H2)!],
    ['projet d’une autre marque', lienJarvisContexte('projet', S.P2)!],
    ['identifiant inconnu', lienJarvisContexte('lot', '00000000-0000-4000-8000-000000000000')!],
    ['identifiant mal formé', `/jarvis?contexte=lot&id=${encodeURIComponent("' or 1=1")}`],
    ['type inconnu', `/jarvis?contexte=marque&id=${ids.brandA2}`],
  ] as const;

  it('à l’ouverture · la même phrase, aucun contexte, champ vide, rien de l’objet', async () => {
    for (const [nom, href] of refuses()) {
      const avant = await traces();
      const html = renderToStaticMarkup(avecSpatial((await pageJarvis(href)) as ReactElement));
      const d = dom(html);
      expect(d.querySelector('[data-refus-contexte]')?.textContent, nom).toBe(REFUS_CONTEXTE_JARVIS);
      expect(d.querySelector('[data-contexte-joint]'), nom).toBeNull();
      expect(d.querySelector('#jin')?.getAttribute('value') ?? '', nom).toBe('');
      for (const secret of ['SECRET_LOT_A2', 'SECRET_LOT_B1', 'HYPOTHESE_SECRETE_A2', 'HYPOTHESE_SECRETE_B1', 'PROJET_SECRET_A2', 'Concept secret']) expect(html, `${nom} · ${secret}`).not.toContain(secret);
      expect(await traces(), nom).toEqual(avant);
    }
  });

  it('à l’envoi · la route relit et refuse (404), sans réservation, sans appel, sans écriture', async () => {
    const corps = (contexte: unknown, brandId = ids.brandA1) => new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Analyse ce lot', conversationId: null, brandId, sources: ['fiche'], contexte }) });
    for (const [nom, contexte, marque] of [
      ['lot A2', { type: 'lot', id: S.L2 }, ids.brandA1], ['lot B1', { type: 'lot', id: S.L3 }, ids.brandA1], ['hypothèse A2', { type: 'hypothese', id: S.H2 }, ids.brandA1],
      ['projet A2', { type: 'projet', id: S.P2 }, ids.brandA1], ['mal formé', { type: 'lot', id: 'x' }, ids.brandA1], ['texte libre', 'lot', ids.brandA1],
      ['marque de l’écran ≠ marque active', { type: 'lot', id: S.L1 }, ids.brandA2],
    ] as const) {
      const avant = await traces();
      const res = await POST(corps(contexte, marque));
      expect(res.status, nom).toBe(404);
      const texte = await res.text();
      expect(JSON.parse(texte).error, nom).toBe(REFUS_CONTEXTE_JARVIS);
      expect(texte, nom).not.toMatch(/SECRET|Concept secret/);
      expect(await traces(), nom).toEqual(avant);
    }
  });
});

/* ───────────────────────────── prix · inchangé ───────────────────────────── */

describe('lot 5 · le prix annoncé avant l’envoi ne change pas', () => {
  it('même annonce sous le champ et sur « Envoyer », avec ou sans contexte · et dite à côté du contexte', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const annonce = annonceConversationJarvis(regimeSession(h.session as never));
    const sans = await rendre(JarvisSpatial({ searchParams: Promise.resolve({}) }));
    const avec = await rendre(pageJarvis(lienJarvisContexte('lot', S.L1)!));
    for (const d of [sans, avec]) {
      expect(d.querySelector('#jform button[type="submit"]')?.getAttribute('title'), 'prix sur « Envoyer »').toBe(annonce);
      expect(d.textContent, 'prix sous le champ').toContain(annonce);
    }
    expect(avec.querySelector('[data-cout-contexte]')?.textContent).toBe(`Le contexte part avec ton message, au prix d’un message · ${annonce}`);
  });
});

/* ───────────────────────────── l'envoi · un clic, le corps envoyé ───────────────────────────── */

/**
 * Le SDK du modèle refuse de tourner sous jsdom · ici on lit ce que l'ÉCRAN
 * envoie (le corps exact de la requête, sur un clic seulement) ; la route
 * réelle qui le reçoit est éprouvée en Node par `lot5-jarvis-contexte-route-db.test.ts`.
 */
describe('lot 5 · l’envoi part sur un clic, avec { type, id } seulement', () => {
  const capture: Array<{ url: string; corps: Record<string, unknown> }> = [];
  const faux = () => {
    capture.length = 0;
    globalThis.fetch = (async (u: string, init?: RequestInit) => {
      capture.push({ url: u, corps: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('Réponse simulée.')); c.close(); } }), { status: 200 });
    }) as unknown as typeof fetch;
  };
  const envoyer = async () => {
    await act(async () => { document.querySelector<HTMLButtonElement>('#jform button[type="submit"]')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  };

  it('lot · un clic, une requête · la question préparée et le contexte désigné, jamais son texte', async () => {
    await monter((await pageJarvis(lienJarvisContexte('lot', S.L1)!)) as ReactElement);
    faux();
    expect(capture).toHaveLength(0);
    await envoyer();
    const chat = capture.filter((c) => c.url === '/api/jarvis/chat');
    expect(chat, 'une seule requête, sur le clic').toHaveLength(1);
    expect(chat[0]!.corps.contexte).toEqual({ type: 'lot', id: S.L1 });
    expect(String(chat[0]!.corps.message)).toMatch(/^Sur le Lot #3/);
    expect(chat[0]!.corps.brandId).toBe(ids.brandA1);
    expect(JSON.stringify(chat[0]!.corps), 'le texte du contexte ne part pas du navigateur').not.toContain(TITRE_BLOC_CONTEXTE_JARVIS);
  });

  it('retirer le contexte · le message suivant part sans lui', async () => {
    await monter((await pageJarvis(lienJarvisContexte('lot', S.L1)!)) as ReactElement);
    faux();
    const retirer = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Retirer le contexte'))!;
    await act(async () => { retirer.click(); });
    expect(document.querySelector('[data-contexte-joint]')).toBeNull();
    await envoyer();
    const chat = capture.filter((c) => c.url === '/api/jarvis/chat');
    expect(chat).toHaveLength(1);
    expect(chat[0]!.corps.contexte).toBeUndefined();
  });

  it('projet · sans fil lié, le message part sans conversation forcée · la route le rattache au projet', async () => {
    await monter((await pageJarvis(lienJarvisContexte('projet', S.P1)!)) as ReactElement);
    faux();
    await envoyer();
    const chat = capture.filter((c) => c.url === '/api/jarvis/chat');
    expect(chat).toHaveLength(1);
    expect(chat[0]!.corps.contexte).toEqual({ type: 'projet', id: S.P1 });
    expect(chat[0]!.corps.conversationId).toBeNull();
  });
});
