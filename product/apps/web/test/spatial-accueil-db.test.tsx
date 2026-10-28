// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * Spatial · l'Accueil sur les VRAIES données · garde de RENDU sur une vraie base
 * (pglite, migrations réelles). Portée de `uxv5-accueil-db`, `accueil-roles-rendu`
 * et `sec-accueil-assistant-rendu` (l'ancien Accueil V5 est retiré · `/dashboard`
 * est exclusif Spatial).
 *
 * On rend la vraie page Spatial `/dashboard` (vraies actions, vraies gardes,
 * vraies requêtes) et on LIT le HTML, pour cinq profils :
 *  · propriétaire Plus · gagnante ARBITRÉE prouvée affichée avec sa métrique,
 *    sa période et sa source ; piste relative, verdict non arbitré et perdante
 *    jamais ; phrase « N choses » = somme des sources réelles ; tuiles et KPI
 *    réels ; CTA vers les bonnes routes ;
 *  · membre Plus · mêmes gagnantes, ni fiche marque ni import (droits admin) ;
 *  · membre Core · pas d'Adsmap · le bloc DIT pourquoi, aucun chiffre d'Adsmap ;
 *  · lecteur · ni bloc, ni KPI, ni assistant (SEC-03), et la raison dite ;
 *  · membre Starter · Jarvis fermé par l'offre · l'assistant, prix dit avant l'envoi.
 * Plus l'état vide honnête, la marque absente, aucune écriture, aucun
 * avertissement React.
 */

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  requetes: [] as string[],
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsP', 'wsC', 'wsV', 'bP', 'bC', 'bV', 'uo', 'um', 'uv', 'uc', 'ue', 'adG', 'adR', 'adN', 'adL', 'adT1', 'adT2', 'wsS', 'us']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  type Client = { query: (t: unknown, ...r: unknown[]) => Promise<unknown>; transaction: (cb: (tx: Client) => Promise<unknown>) => Promise<unknown> };
  const espionner = (c: Client) => { const q = c.query.bind(c); c.query = (t, ...r) => { h.requetes.push(String(t)); return q(t, ...r); }; };
  const client = (db as unknown as { session: { client: Client } }).session.client;
  espionner(client);
  const tr = client.transaction.bind(client);
  client.transaction = (cb) => tr((tx) => { espionner(tx); return cb(tx); });
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import { db, schema } from '@tiktrends/db';
import { surtitreSpatialAccueil } from '@tiktrends/core';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';

const I = h.ids;
const JOUR = 86_400_000;

type Qui = 'uo' | 'um' | 'uv' | 'uc' | 'ue' | 'us';
function sess(qui: Qui): SessionTest {
  const ws = qui === 'uc' ? I.wsC! : qui === 'ue' ? I.wsV! : qui === 'us' ? I.wsS! : I.wsP!;
  const role = qui === 'uo' ? 'owner' : qui === 'uv' ? 'client_viewer' : 'member';
  const plan = qui === 'uc' ? 'core' : qui === 'us' ? 'starter' : 'plus';
  return { user: { id: I[qui]!, email: `${qui}@accueil.test`, name: qui === 'uo' ? 'Camille Martin' : null }, workspaceId: ws, workspaceName: 'Espace', role, plan, equipe: null };
}
const MARQUE: Record<string, { id: string; name: string }> = {};

async function ad(ws: string, brand: string, titre: string, o: { id: string; batchId?: string | null; platform?: 'meta' | 'tiktok' }) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  await db.insert(schema.ads).values({ id: o.id, workspaceId: ws, conceptId: c!.id, variantCode: 'v1', batchId: o.batchId ?? null, platform: o.platform ?? 'meta' });
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([
    { id: I.wsP!, name: 'Espace Plus', plan: 'plus' }, { id: I.wsC!, name: 'Espace Core', plan: 'core' }, { id: I.wsV!, name: 'Espace vide', plan: 'plus' },
    { id: I.wsS!, name: 'Espace Starter', plan: 'starter' },
  ]);
  await db.insert(schema.users).values(['uo', 'um', 'uv', 'uc', 'ue', 'us'].map((q) => ({ id: I[q]!, email: `${q}@accueil.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsP!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsP!, userId: I.um!, role: 'member' },
    { workspaceId: I.wsP!, userId: I.uv!, role: 'client_viewer' }, { workspaceId: I.wsC!, userId: I.uc!, role: 'member' },
    { workspaceId: I.wsV!, userId: I.ue!, role: 'member' }, { workspaceId: I.wsS!, userId: I.us!, role: 'member' },
  ]);
  await db.insert(schema.brands).values([
    // Fiche partielle · la description seule (et les personas que le semis Adsmap pose) · dix manques réels.
    { id: I.bP!, workspaceId: I.wsP!, name: 'Neva', description: 'Maillots pour enfants' },
    { id: I.bC!, workspaceId: I.wsC!, name: 'Core', description: 'x' },
    { id: I.bV!, workspaceId: I.wsV!, name: 'Vide' },
  ]);
  MARQUE.P = { id: I.bP!, name: 'Neva' }; MARQUE.C = { id: I.bC!, name: 'Core' }; MARQUE.V = { id: I.bV!, name: 'Vide' };

  // Lots · #1 conclu (analysé), #2 en test.
  const [lot1] = await db.insert(schema.batches).values({ workspaceId: I.wsP!, brandId: I.bP!, number: 1, status: 'analyzed' }).returning();
  const [lot2] = await db.insert(schema.batches).values({ workspaceId: I.wsP!, brandId: I.bP!, number: 2, status: 'testing' }).returning();

  // La gagnante PROUVÉE · arbitrée, comparable, métriques synchronisées.
  await ad(I.wsP!, I.bP!, 'Plongeon gagnant', { id: I.adG!, batchId: lot1!.id });
  // Une gagnante NON comparable (import) · une prometteuse relative, jamais une victoire.
  await ad(I.wsP!, I.bP!, 'Piste relative', { id: I.adR! });
  // Un verdict gagnant CALCULÉ, pas arbitré.
  await ad(I.wsP!, I.bP!, 'Pas arbitré', { id: I.adN! });
  // Une perdante arbitrée.
  await ad(I.wsP!, I.bP!, 'Perdante arbitrée', { id: I.adL! });
  // Deux variantes du lot #2 en test.
  await ad(I.wsP!, I.bP!, 'En test un', { id: I.adT1!, batchId: lot2!.id });
  await ad(I.wsP!, I.bP!, 'En test deux', { id: I.adT2!, batchId: lot2!.id });
  await db.insert(schema.verdicts).values([
    { adId: I.adG!, workspaceId: I.wsP!, computed: 'winner', validated: 'winner', status: 'validated', comparable: true,
      metricsAgg: { ctr: 0.018, hookRate: 0.27, purchases: 0, spend: 140, daysElapsed: 7, syncedAt: '2026-10-10T08:00:00Z' } },
    { adId: I.adR!, workspaceId: I.wsP!, computed: null, validated: 'winner', status: 'validated', comparable: false, metricsAgg: null },
    { adId: I.adN!, workspaceId: I.wsP!, computed: 'winner', validated: null, status: 'computed', comparable: true, metricsAgg: { ctr: 0.05, daysElapsed: 3 } },
    { adId: I.adL!, workspaceId: I.wsP!, computed: 'loser', validated: 'loser', status: 'validated', comparable: true, failedStage: 'hook', metricsAgg: { hookRate: 0.1, daysElapsed: 7 } },
  ]);
  await db.insert(schema.learnings).values({ workspaceId: I.wsP!, brandId: I.bP!, adId: I.adG!, scope: 'ad', statement: 'Le format court tient.', status: 'validated' });

  // Veille · trois sauvegardes (une collection), un concurrent suivi, des nouveautés.
  await db.insert(schema.savedAds).values([
    { workspaceId: I.wsP!, brandId: I.bP!, platform: 'meta', externalId: 's1', snapshot: {}, folder: 'Été' },
    { workspaceId: I.wsP!, brandId: I.bP!, platform: 'meta', externalId: 's2', snapshot: {}, folder: 'Été' },
    { workspaceId: I.wsP!, brandId: I.bP!, platform: 'meta', externalId: 's3', snapshot: {} },
  ]);
  const [fb] = await db.insert(schema.followedBrands).values({ workspaceId: I.wsP!, brandId: I.bP!, platform: 'meta', name: 'Ploufy' }).returning();
  const ev = (o: { il: number; vu: boolean }) => ({
    workspaceId: I.wsP!, followedBrandId: fb!.id, platform: 'meta', advertiserName: 'Ploufy', snapshot: {},
    createdAt: new Date(Date.now() - o.il * JOUR), seenAt: o.vu ? new Date() : null,
  });
  // 3 non vues (dont 1 ancienne de 10 jours) · 3 de moins de 7 jours (dont 1 vue).
  await db.insert(schema.brandTrackerEvents).values([ev({ il: 1, vu: false }), ev({ il: 2, vu: false }), ev({ il: 3, vu: true }), ev({ il: 10, vu: false })]);

  // Notifications du propriétaire · 1 non lue comptée ; la veille (déjà comptée) et la lue, non.
  await db.insert(schema.notifications).values([
    { workspaceId: I.wsP!, userId: I.uo!, type: 'ticket_reply', title: 'Réponse du support' },
    { workspaceId: I.wsP!, userId: I.uo!, type: 'tracker', title: '2 nouvelles pubs' },
    { workspaceId: I.wsP!, userId: I.uo!, type: 'system', title: 'Lue', readAt: new Date() },
  ]);

  // Deux projets actifs dans la marque.
  for (const t of ['Projet été', 'Projet rentrée']) {
    await db.insert(schema.studioProjects).values({ workspaceId: I.wsP!, brandId: I.bP!, kind: 'ads', title: t, ownerId: I.uo! });
  }
});

let erreurs: unknown[][] = [];
let alertes: unknown[][] = [];
beforeEach(() => {
  erreurs = []; alertes = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erreurs.push(a); });
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { alertes.push(a); });
});
afterEach(() => { vi.restoreAllMocks(); h.marque = null; });

async function accueil(qui: Qui, marque: { id: string; name: string } | null, params: Record<string, string> = {}) {
  h.session = sess(qui);
  h.marque = marque;
  const html = renderToStaticMarkup(await AccueilSpatial({ searchParams: Promise.resolve(params) }));
  const d = document.createElement('div');
  d.innerHTML = html;
  // Aucun avertissement React (clé, imbrication), aucune source de l'Accueil en panne silencieuse.
  expect(erreurs.map((e) => String(e[0])), 'avertissement React pendant le rendu de l’Accueil').toEqual([]);
  expect(alertes.map((e) => String(e[0])).filter((m) => m.includes('[accueil')), 'une source de l’Accueil est tombée en panne').toEqual([]);
  return { html, d, texte: d.textContent ?? '' };
}
const raccourcis = (d: HTMLElement) => [...d.querySelectorAll('nav[aria-label="Raccourcis"] a')].map((a) => [a.getAttribute('data-route'), a.getAttribute('href')]);
const kpi = (d: HTMLElement) => [...d.querySelectorAll('[data-kpi]')].map((k) => [k.getAttribute('data-kpi'), k.querySelector('.v')?.textContent, k.querySelector('.d')?.textContent, k.getAttribute('href')]);
const liens = (d: HTMLElement) => [...d.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!);

describe('Spatial · Accueil · propriétaire Plus · données réelles', () => {
  it('en-tête · date du serveur · marque, « Bonjour <prénom> », phrase = somme des sources réelles, onglets Accueil · Analytics', async () => {
    const { d } = await accueil('uo', MARQUE.P!);
    expect(d.querySelector('h1')?.textContent).toBe('Bonjour Camille');
    expect(d.textContent).toContain(surtitreSpatialAccueil({ maintenant: new Date(), marque: 'Neva' }));
    expect(d.querySelector('.lead2')?.textContent, 'la phrase ne somme pas les sources réelles (1 gagnante + 3 non vues + 1 notification hors veille)')
      .toBe('5 choses t’attendent : 1 gagnante à itérer, 3 nouvelles pubs chez tes concurrents suivis et 1 notification non lue.');
    expect([...d.querySelectorAll('nav.subnav a')].map((a) => [a.getAttribute('href'), a.textContent])).toEqual([['/dashboard', 'Accueil'], ['/dashboard?vue=analytics', 'Analytics']]);
    expect(d.querySelector('[role="note"]'), 'une note de rôle pour le propriétaire').toBeNull();
  });

  it('quoi itérer · SEULE la gagnante arbitrée prouvée, avec sa mesure, sa période et sa source', async () => {
    const { d, texte } = await accueil('uo', MARQUE.P!);
    const cartes = [...d.querySelectorAll('#suggestions article')];
    expect(cartes.map((c) => c.querySelector('h3 + p, strong')?.textContent)).toEqual(['Plongeon gagnant · v1']);
    for (const t of ['Piste relative', 'Pas arbitré', 'Perdante arbitrée']) expect(texte, `verdict non prouvé affiché · ${t}`).not.toContain(t);
    expect(cartes[0]!.textContent).toContain('sur 7 jours de diffusion · mesuré le 10 oct. 2026 · Meta · synchro Adsmap');
    expect(cartes[0]!.textContent).toContain('Garde · l’accroche, l’angle et l’offre');
  });

  it('raccourcis · fiche marque avec le VRAI manque ; KPI · sources réelles, période et destination', async () => {
    const { d } = await accueil('uo', MARQUE.P!);
    expect(raccourcis(d).map((r) => r[0])).toEqual(['nouveau', 'formats', 'forfaits', 'importer', 'marque']);
    expect(d.querySelector('nav[aria-label="Raccourcis"] a[data-route="marque"]')?.getAttribute('href')).toBe(`/brands/${I.bP}?tab=overview#profil`);
    expect(d.querySelector('nav[aria-label="Raccourcis"] a[data-route="marque"]')?.textContent).toContain('10 éléments à compléter');
    expect(kpi(d), 'un KPI ne reflète pas sa source').toEqual([
      ['projets', '2', 'dans les marques de ta portée · à ce jour', '/studio/projets?toutes=1'],
      ['sauvegardees', '3', '1 collection · au total', '/saved'],
      ['nouveautes', '3', '1 concurrent suivi · ces 7 derniers jours', '/saved?onglet=nouveautes'],
      ['enTest', '2', 'lot #2 · en ce moment', '/adsmap'],
    ]);
  });

  it('Jarvis ouvert · sa barre tient lieu d’assistant (aucun second champ)', async () => {
    const { d } = await accueil('uo', MARQUE.P!);
    expect(d.querySelector('#jhome')).not.toBeNull();
    expect(d.querySelector('[data-section="assistant"]')).toBeNull();
  });
});

describe('Spatial · Accueil · membre Plus', () => {
  it('la gagnante prouvée · ni fiche marque, ni import (réservés aux admins), et la raison dite', async () => {
    const { d, texte } = await accueil('um', MARQUE.P!);
    expect(texte).toContain('Plongeon gagnant · v1');
    expect(raccourcis(d).map((r) => r[0])).toEqual(['nouveau', 'formats']);
    for (const admin of ['/brands/new', '/adsmap/import', '/adsmap/lots', '/connections']) expect(liens(d), `lien admin ${admin} proposé au membre`).not.toContain(admin);
    expect(d.querySelector('[role="note"]')?.textContent).toContain('ne comprend pas la gestion des marques');
    expect(d.querySelector('.lead2')?.textContent).toBe('4 choses t’attendent : 1 gagnante à itérer et 3 nouvelles pubs chez tes concurrents suivis.');
  });
});

describe('Spatial · Accueil · membre Core · pas d’Adsmap', () => {
  it('le bloc dit POURQUOI, aucun chiffre d’Adsmap, pas d’import', async () => {
    const { d, texte } = await accueil('uc', MARQUE.C!);
    expect(d.querySelector('#suggestions')?.textContent).toContain('à partir de l’offre Plus');
    expect(texte).not.toContain('Plongeon gagnant');
    expect(raccourcis(d).map((r) => r[0])).toEqual(['nouveau', 'formats']);
    // Sans concurrent suivi, aucune « nouveauté » · sans Adsmap, aucune « variante en test ».
    expect(kpi(d).map((k) => k[0])).toEqual(['projets', 'sauvegardees']);
    expect(d.querySelector('.lead2')?.textContent).toBe('Rien ne t’attend pour l’instant.');
  });
});

describe('Spatial · Accueil · lecteur (client en lecture)', () => {
  it('ni itérations, ni KPI, ni création, ni Jarvis, ni assistant (SEC-03) · la raison est dite', async () => {
    const { d, texte } = await accueil('uv', MARQUE.P!);
    expect(d.querySelector('#suggestions'), 'bloc Adsmap montré à un lecteur').toBeNull();
    expect(d.querySelector('[data-section="kpi"]'), 'KPI pour un lecteur').toBeNull();
    for (const t of ['Plongeon gagnant', 'Piste relative', 'Projet été']) expect(texte).not.toContain(t);
    for (const mort of ['/studio/projets/nouveau', '/brands/new', '/adsmap', '/jarvis', '/connections']) expect(liens(d), `lien vers ${mort} proposé au client en lecture`).not.toContain(mort);
    expect(d.querySelector('#jhome'), 'Jarvis proposé à un lecteur').toBeNull();
    expect(d.querySelector('[data-section="assistant"]'), 'l’assistant est proposé à un rôle que le serveur refuse').toBeNull();
    expect(texte).not.toContain('Pose ta question');
    expect(d.querySelector('[role="note"]')?.textContent).toContain('Ton rôle dans cet espace ne comprend pas la création');
    expect(d.querySelector('h1')?.textContent).toMatch(/^Bonjour /);
  });
});

describe('Spatial · Accueil · membre Starter · Jarvis fermé par l’offre', () => {
  it('l’assistant de l’ancien Accueil · le prix d’une question dit AVANT l’envoi, un libellé persistant', async () => {
    const { d } = await accueil('us', null);
    expect(d.querySelector('#jhome'), 'Jarvis proposé hors de son offre').toBeNull();
    const a = d.querySelector('[data-section="assistant"]');
    expect(a, 'l’assistant n’est plus proposé au membre Starter').not.toBeNull();
    expect(a!.querySelector('h2')?.textContent).toBe('Demande à l’assistant');
    expect(a!.querySelector('[data-prix="assistant"]')?.textContent).toMatch(/^(1 crédit par question, débité à l’envoi|L’assistant s’active dès que la clé IA)/);
    const champ = a!.querySelector('input')!;
    expect(a!.querySelector(`label[for="${champ.id}"]`)?.textContent, 'le champ n’a pas de libellé persistant').toBe('Ta question à l’assistant');
  });
});

describe('Spatial · Accueil · états honnêtes', () => {
  it('aucun test conclu · état vide, lien vers Résultats, KPI à 0 réels, aucune nouveauté inventée', async () => {
    const { d } = await accueil('ue', MARQUE.V!);
    const v = d.querySelector('#suggestions')!;
    expect(v?.textContent).toContain('Aucun test conclu pour l’instant');
    expect(v.querySelector('a')?.getAttribute('href')).toBe('/adsmap');
    expect(kpi(d).map((k) => [k[0], k[1], k[2]])).toEqual([
      ['projets', '0', 'dans les marques de ta portée · à ce jour'],
      ['sauvegardees', '0', 'aucune collection · au total'],
      ['enTest', '0', 'aucun lot en test · en ce moment'],
    ]);
  });

  it('sans marque active · le bloc dit quoi faire, aucune carte, aucune fiche marque', async () => {
    const { d } = await accueil('uo', null);
    expect(d.querySelector('#suggestions')?.textContent).toContain('Choisis une marque active');
    expect(d.querySelector('#suggestions article')).toBeNull();
    expect(d.querySelector('a[data-route="marque"]'), 'fiche marque sans marque active').toBeNull();
  });

  it('une visite n’écrit RIEN', async () => {
    h.requetes = [];
    for (const [q, m] of [['uo', MARQUE.P], ['um', MARQUE.P], ['uv', MARQUE.P], ['uc', MARQUE.C], ['ue', MARQUE.V], ['us', null]] as const) await accueil(q, m ?? null);
    expect(h.requetes.filter((t) => /^\s*select\b/i.test(t)).length, 'le journal ne voit pas les requêtes').toBeGreaterThan(20);
    expect(h.requetes.filter((t) => /^\s*(insert|update|delete|truncate|alter|create|drop)\b/i.test(t)), 'la visite de l’Accueil envoie une écriture').toEqual([]);
  });
});
