// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * UX V5 · l'Accueil sur les VRAIES données · garde de RENDU sur une vraie base
 * (pglite, migrations réelles).
 *
 * On rend la vraie page `/dashboard` (vraies actions, vraies gardes, vraies
 * requêtes) et on LIT le HTML, pour quatre profils :
 *  · propriétaire Plus · gagnante ARBITRÉE prouvée affichée avec sa métrique,
 *    sa période et sa source ; piste relative, verdict non arbitré et perdante
 *    jamais ; phrase « N choses » = somme des sources réelles ; tuiles et KPI
 *    réels ; CTA vers les bonnes routes ;
 *  · membre Plus · mêmes gagnantes, ni fiche marque ni import (droits admin) ;
 *  · membre Core · pas d'Adsmap · le bloc DIT pourquoi, aucun chiffre d'Adsmap ;
 *  · lecteur · ni bloc, ni tuile, ni KPI.
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
  for (const k of ['wsP', 'wsC', 'wsV', 'bP', 'bC', 'bV', 'uo', 'um', 'uv', 'uc', 'ue', 'adG', 'adR', 'adN', 'adL', 'adT1', 'adT2']) h.ids[k] = randomUUID();
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
import { surtitreAccueil, lienIterationStudio } from '@tiktrends/core';
import Dashboard from '../app/(app)/dashboard/page';

const I = h.ids;
const JOUR = 86_400_000;

function sess(qui: 'uo' | 'um' | 'uv' | 'uc' | 'ue'): SessionTest {
  const ws = qui === 'uc' ? I.wsC! : qui === 'ue' ? I.wsV! : I.wsP!;
  const role = qui === 'uo' ? 'owner' : qui === 'uv' ? 'client_viewer' : 'member';
  const plan = qui === 'uc' ? 'core' : 'plus';
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
  ]);
  await db.insert(schema.users).values(['uo', 'um', 'uv', 'uc', 'ue'].map((q) => ({ id: I[q]!, email: `${q}@accueil.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsP!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsP!, userId: I.um!, role: 'member' },
    { workspaceId: I.wsP!, userId: I.uv!, role: 'client_viewer' }, { workspaceId: I.wsC!, userId: I.uc!, role: 'member' },
    { workspaceId: I.wsV!, userId: I.ue!, role: 'member' },
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

async function accueil(qui: 'uo' | 'um' | 'uv' | 'uc' | 'ue', marque: { id: string; name: string } | null) {
  h.session = sess(qui);
  h.marque = marque;
  const html = renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve({}) }));
  const d = document.createElement('div');
  d.innerHTML = html;
  // Aucun avertissement React (clé, imbrication), aucune source de l'Accueil en panne silencieuse.
  expect(erreurs.map((e) => String(e[0])), 'avertissement React pendant le rendu de l’Accueil').toEqual([]);
  expect(alertes.map((e) => String(e[0])).filter((m) => m.includes('[accueil]')), 'une source de l’Accueil est tombée en panne').toEqual([]);
  return { html, d, texte: d.textContent ?? '' };
}
const tuiles = (d: HTMLElement) => [...d.querySelectorAll('[data-accueil-tuiles] a')].map((a) => [a.getAttribute('data-tuile'), a.getAttribute('href')]);
const kpi = (d: HTMLElement) => [...d.querySelectorAll('[data-kpi]')].map((k) => [k.getAttribute('data-kpi'), k.querySelector('dd')?.textContent, k.querySelectorAll('dd')[1]?.textContent]);

describe('Accueil V5 · propriétaire Plus · données réelles', () => {
  it('en-tête · date du serveur · marque, « Bonjour <prénom> », phrase = somme des sources réelles', async () => {
    const { d } = await accueil('uo', MARQUE.P!);
    expect(d.querySelector('[data-accueil-surtitre]')?.textContent).toBe(surtitreAccueil({ maintenant: new Date(), marque: 'Neva' }));
    expect(d.querySelector('h1')?.textContent).toBe('Bonjour Camille');
    const p = d.querySelector('[data-accueil-attente]')!;
    expect(p?.textContent, 'la phrase ne somme pas les sources réelles (1 gagnante + 3 non vues + 1 notification hors veille)')
      .toBe('5 choses t’attendent : 1 gagnante à itérer, 3 nouvelles pubs chez tes concurrents suivis et 1 notification non lue.');
    expect([...p.querySelectorAll('[data-attente]')].map((e) => e.getAttribute('data-source')?.length ?? 0).every((n) => n > 0), 'un compteur sans source').toBe(true);
    expect(p.querySelector('[data-attente="veille"]')?.getAttribute('href')).toBe('/saved?onglet=nouveautes');
  });

  it('prochaines itérations · SEULE la gagnante arbitrée prouvée, avec métrique, période et source', async () => {
    const { d, texte } = await accueil('uo', MARQUE.P!);
    const cartes = [...d.querySelectorAll('[data-accueil-iterations] [data-iteration]')];
    expect(cartes.map((c) => c.getAttribute('data-iteration')), 'une gagnante non prouvée (relative, non arbitrée, perdante) s’affiche').toEqual([I.adG]);
    for (const t of ['Piste relative', 'Pas arbitré', 'Perdante arbitrée']) expect(texte, `verdict non prouvé affiché · ${t}`).not.toContain(t);
    const c = cartes[0]!;
    expect(c.querySelector('h3')?.textContent).toBe('Plongeon gagnant · v1');
    expect(c.querySelector('[data-verdict]')?.textContent).toBe('Gagnante');
    expect(c.querySelector('[data-lot]')?.textContent).toBe('Lot #1 conclu');
    expect(c.textContent).toContain('Apprentissage validé');
    expect(c.querySelector('[data-mesure] b')?.textContent?.replace(/\s/g, ' ')).toBe('1,8 %');
    expect(c.querySelector('[data-periode]')?.textContent).toBe('sur 7 jours de diffusion · mesuré le 10 oct. 2026 · Meta · synchro Adsmap');
    expect(c.querySelector('[data-garde]')?.textContent).toBe('Garde · l’accroche, l’angle et l’offre');
    expect(c.querySelector('[data-change]')?.textContent).toMatch(/^Change · /);
    expect(texte, 'un devis inventé').not.toMatch(/Devis/);
    // Les CTA · Itérer vers la préparation (brief repris, rien de généré), la boucle et les Suites.
    expect(c.querySelector('a[data-iterer]')?.getAttribute('href'), 'Itérer ne mène pas à la préparation du projet').toBe(lienIterationStudio(I.adG!));
    expect(d.querySelector('a[data-voir-boucle]')?.getAttribute('href')).toBe('/adsmap');
    expect(d.querySelector('a[data-autres-iterations]')?.getAttribute('href')).toBe('/adsmap/suites');
  });

  it('tuiles · les cinq, fiche marque avec le VRAI manque ; KPI · sources réelles et période', async () => {
    const { d } = await accueil('uo', MARQUE.P!);
    expect(tuiles(d)).toEqual([
      ['nouveau', '/studio/projets/nouveau'], ['veille', '/veille'], ['jarvis', '/jarvis'], ['importer', '/adsmap/import'],
      ['fiche', `/brands/${I.bP}?tab=overview#profil`],
    ]);
    expect(d.querySelector('[data-tuile="fiche"]')?.textContent, 'le manque de la fiche n’est pas le vrai').toContain('10 éléments à compléter · la promesse (USP), l’audience…');
    expect(kpi(d), 'un KPI ne reflète pas sa source').toEqual([
      ['projets', '2', 'dans les marques de ta portée · à ce jour'],
      ['sauvegardees', '3', '1 collection · au total'],
      ['nouveautes', '3', '1 concurrent suivi · ces 7 derniers jours'],
      ['enTest', '2', 'lot #2 · en ce moment'],
    ]);
  });

  it('l’existant reste, plus bas · projets, pilotage, marques, analyse, assistant, exemple, onglet Analytics', async () => {
    const { html, d } = await accueil('uo', MARQUE.P!);
    const ordre = ['data-accueil-entete', 'data-accueil-iterations', 'data-accueil-tuiles', 'data-accueil-kpi', 'data-accueil-projets="liste"', 'data-accueil-pilotage', 'aria-label="Tes marques"', 'Analyser &amp; décider', 'Demande à l’assistant', 'Données de démonstration']
      .map((m) => [m, html.indexOf(m)] as const);
    for (const [m, i] of ordre) expect(i, `bloc absent · ${m}`).toBeGreaterThan(-1);
    for (let k = 1; k < ordre.length; k++) expect(ordre[k - 1]![1], `${ordre[k - 1]![0]} doit précéder ${ordre[k]![0]}`).toBeLessThan(ordre[k]![1]);
    expect(d.querySelector('nav[aria-label="Vues de l’accueil"] a[href="/dashboard?vue=analytics"]'), 'l’onglet Analytics a disparu').not.toBeNull();
  });
});

describe('Accueil V5 · membre Plus', () => {
  it('la gagnante prouvée et « Itérer » · ni fiche marque, ni import (réservés aux admins)', async () => {
    const { d } = await accueil('um', MARQUE.P!);
    expect([...d.querySelectorAll('[data-iteration]')].map((c) => c.getAttribute('data-iteration'))).toEqual([I.adG]);
    expect(d.querySelector('a[data-iterer]')?.getAttribute('href')).toBe(lienIterationStudio(I.adG!));
    expect(tuiles(d).map((t) => t[0])).toEqual(['nouveau', 'veille', 'jarvis']);
    expect(d.querySelector('[data-accueil-attente]')?.textContent).toBe('4 choses t’attendent : 1 gagnante à itérer et 3 nouvelles pubs chez tes concurrents suivis.');
  });
});

describe('Accueil V5 · membre Core · pas d’Adsmap', () => {
  it('le bloc dit POURQUOI, aucun chiffre d’Adsmap, pas d’import', async () => {
    const { d, texte } = await accueil('uc', MARQUE.C!);
    const offre = d.querySelector('[data-iterations-etat="offre"]');
    expect(offre, 'le refus d’offre ne dit pas pourquoi (bloc muet ou absent)').not.toBeNull();
    expect(offre!.textContent).toContain('à partir de l’offre Plus');
    expect(d.querySelector('[data-iteration]')).toBeNull();
    expect(texte).not.toContain('Plongeon gagnant');
    expect(tuiles(d).map((t) => t[0])).toEqual(['nouveau', 'veille', 'jarvis']);
    // Sans concurrent suivi, aucune « nouveauté » · sans Adsmap, aucune « variante en test ».
    expect(kpi(d).map((k) => k[0])).toEqual(['projets', 'sauvegardees']);
    const phrase = d.querySelector('[data-accueil-attente]')?.textContent ?? '';
    expect(phrase).toBe('Rien ne t’attend pour l’instant.');
    expect(phrase, 'un chiffre sans donnée dans la phrase').not.toMatch(/\d/);
  });
});

describe('Accueil V5 · lecteur', () => {
  it('ni itérations, ni tuiles, ni KPI · aucun test de l’espace ne fuit', async () => {
    const { d, texte } = await accueil('uv', MARQUE.P!);
    expect(d.querySelector('[data-accueil-iterations]'), 'bloc Adsmap montré à un lecteur').toBeNull();
    expect(d.querySelector('[data-accueil-tuiles]'), 'tuiles d’action pour un lecteur').toBeNull();
    expect(d.querySelector('[data-accueil-kpi]'), 'KPI pour un lecteur').toBeNull();
    for (const t of ['Plongeon gagnant', 'Piste relative', 'Projet été']) expect(texte).not.toContain(t);
    expect(d.querySelector('h1')?.textContent).toMatch(/^Bonjour /);
    expect(d.querySelector('[data-accueil-attente]')?.textContent ?? '', 'un chiffre sans donnée pour le lecteur').not.toMatch(/\d/);
  });
});

describe('Accueil V5 · états honnêtes', () => {
  it('aucun test conclu · état vide, lien vers Résultats, KPI à 0 réels, aucune nouveauté inventée', async () => {
    const { d } = await accueil('ue', MARQUE.V!);
    const v = d.querySelector('[data-iterations-etat="vide"]')!;
    expect(v?.textContent).toContain('Aucun test conclu pour l’instant');
    expect(v.querySelector('a')?.getAttribute('href')).toBe('/adsmap');
    expect(d.querySelector('[data-iteration]')).toBeNull();
    expect(kpi(d)).toEqual([
      ['projets', '0', 'dans les marques de ta portée · à ce jour'],
      ['sauvegardees', '0', 'aucune collection · au total'],
      ['enTest', '0', 'aucun lot en test · en ce moment'],
    ]);
  });

  it('sans marque active · le bloc dit quoi faire, aucune carte', async () => {
    const { d } = await accueil('uo', null);
    expect(d.querySelector('[data-iterations-etat="sans-marque"]')?.textContent).toContain('Choisis une marque active');
    expect(d.querySelector('[data-iteration]')).toBeNull();
    expect(d.querySelector('[data-tuile="fiche"]'), 'fiche marque sans marque active').toBeNull();
  });

  it('une visite n’écrit RIEN', async () => {
    h.requetes = [];
    for (const [q, m] of [['uo', MARQUE.P], ['um', MARQUE.P], ['uv', MARQUE.P], ['uc', MARQUE.C], ['ue', MARQUE.V]] as const) await accueil(q, m!);
    expect(h.requetes.filter((t) => /^\s*select\b/i.test(t)).length, 'le journal ne voit pas les requêtes').toBeGreaterThan(20);
    expect(h.requetes.filter((t) => /^\s*(insert|update|delete|truncate|alter|create|drop)\b/i.test(t)), 'la visite de l’Accueil envoie une écriture').toEqual([]);
  });
});
