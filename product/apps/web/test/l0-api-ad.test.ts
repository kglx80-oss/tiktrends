import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Chantier L0 · #125 · `GET /api/ad/[id]` n'écrit rien (BASE-03), prouvé au RÉSULTAT.
 *
 * On appelle le VRAI handler contre une vraie base Postgres (pglite,
 * migrations du dépôt) dont chaque instruction est espionnée. Attendu · ZÉRO
 * instruction d'écriture, et des lignes identiques avant / après.
 *
 * Reproduits avant correctif (audit L0-C, preuve locale du chantier) :
 *  - le GET réécrivait `generations.input` (mesure de la scène) et
 *    `generations.output.renders` (index des rendus) ;
 *  - `?r=` libre · une clé, un rendu, un objet et une entrée de plus par valeur.
 *
 * L'écriture déplacée est exercée comme COMMANDE · `rattraperMesures`,
 * explicite et idempotente.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return {
    ws: randomUUID(), ws2: randomUUID(), owner: randomUUID(), viewer: randomUUID(),
    brand: randomUUID(), brandAutre: randomUUID(),
    pubSansMesure: randomUUID(), pubMesuree: randomUUID(), pubIndexee: randomUUID(), pubAutreEspace: randomUUID(),
  };
});
const espion = vi.hoisted(() => ({ actif: false, ecritures: [] as string[] }));
const h = vi.hoisted(() => ({
  session: null as unknown,
  rendus: [] as Array<{ light: unknown; width?: number; height?: number }>,
  s3: true,
  objets: new Map<string, number>(),
  puts: [] as string[],
  heads: [] as string[],
}));

/** Une instruction qui modifie la base · le reste (select, with … select) est une lecture. */
const ECRITURE = /\binsert\s+into\b|\bupdate\s+"?[a-z_]+"?\s+set\b|\bdelete\s+from\b|\btruncate\b|\bmerge\s+into\b/i;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { PGlite } = await import('@electric-sql/pglite');
  const proto = PGlite.prototype as unknown as { query: (sql: string, ...rest: unknown[]) => Promise<unknown> };
  const query = proto.query;
  proto.query = function (this: unknown, sql: string, ...rest: unknown[]) {
    if (espion.actif && ECRITURE.test(sql)) espion.ecritures.push(sql.replace(/\s+/g, ' ').slice(0, 160));
    return query.call(this, sql, ...rest);
  };
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
// La composition satori est remplacée · on garde la recette qu'on lui donne.
vi.mock('../lib/ad-render', () => ({
  RENDER_VERSION: 9,
  renderAdPng: async (r: { light: unknown; width?: number; height?: number }) => {
    h.rendus.push({ light: r.light, width: r.width, height: r.height });
    return new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer;
  },
}));
// Bucket simulé · PUT signé et lecture publique partagent le même magasin.
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  const cfg = { endpoint: 's3.local.test', region: 'gra', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', publicBaseUrl: 'https://cdn.local.test' };
  return {
    ...actual,
    storageFromEnv: () => (h.s3 ? cfg : null),
    putObject: async (_c: unknown, key: string, bytes: Buffer) => { h.puts.push(key); h.objets.set(key, bytes.length); return actual.publicUrlFor(cfg, key); },
  };
});
// La mesure lit des pixels · on lui sert une scène fabriquée, sans réseau.
vi.mock('@tiktrends/integrations/src/safe-fetch', async () => {
  const sharp = (await import('sharp')).default;
  const body = await sharp({ create: { width: 24, height: 30, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
  return { safeFetch: async () => ({ body, contentType: 'image/png', url: 'https://scene.test/x.png' }) };
});

import { db, schema, eq } from '@tiktrends/db';
import { cleObjetRendu, _oublierPresents } from '../lib/ad-store';

const owner = () => ({ user: { id: ids.owner, email: 'owner@l0.test', name: null }, workspaceId: ids.ws, workspaceName: 'L0', role: 'owner', plan: 'plus', equipe: null });
const viewer = () => ({ user: { id: ids.viewer, email: 'viewer@l0.test', name: null }, workspaceId: ids.ws, workspaceName: 'L0', role: 'client_viewer', plan: 'plus', equipe: null });
const recette = (titre: string, extra: Record<string, unknown> = {}) => ({ template: 'problem_solution', accent: '#E4572E', headline: titre, cta: 'Voir', sceneUrl: 'https://scene.test/x.png', width: 1080, height: 1350, ...extra });

/** Empreinte des lignes qu'une lecture pourrait toucher. */
async function empreinte(): Promise<string> {
  const g = await db.select({ id: schema.generations.id, input: schema.generations.input, output: schema.generations.output, status: schema.generations.status })
    .from(schema.generations).orderBy(schema.generations.id);
  return JSON.stringify({ g });
}

/** Lance une lecture sous espion · rend les instructions d'écriture vues. */
async function sousEspion<T>(f: () => Promise<T>): Promise<{ r: T; ecritures: string[] }> {
  espion.ecritures = []; espion.actif = true;
  try {
    const r = await f();
    // Laisse partir ce qui serait « fire and forget » (void …) avant de regarder.
    await new Promise((ok) => setTimeout(ok, 30));
    return { r, ecritures: [...espion.ecritures] };
  } finally { espion.actif = false; }
}

async function chargerRoute() {
  return (await import('../app/api/ad/[id]/route')).GET;
}
async function get(id: string, query = '') {
  const GET = await chargerRoute();
  return GET(new Request(`http://local/api/ad/${id}${query}`), { params: Promise.resolve({ id }) });
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: ids.ws, name: 'L0', plan: 'plus', creditsBalance: 100 }, { id: ids.ws2, name: 'Autre', plan: 'plus' }]);
  await db.insert(schema.users).values([{ id: ids.owner, email: 'owner@l0.test' }, { id: ids.viewer, email: 'viewer@l0.test' }]);
  await db.insert(schema.workspaceMembers).values([{ workspaceId: ids.ws, userId: ids.owner, role: 'owner' }, { workspaceId: ids.ws, userId: ids.viewer, role: 'client_viewer' }]);
  await db.insert(schema.brands).values([
    { id: ids.brand, workspaceId: ids.ws, name: 'Neva' },
    { id: ids.brandAutre, workspaceId: ids.ws2, name: 'Autre' },
  ]);
  await db.insert(schema.generations).values([
    // Composée avant la mesure · pas de clé `light`, pas de sortie.
    { id: ids.pubSansMesure, brandId: ids.brand, kind: 'ad', status: 'completed', input: recette('Sans mesure') },
    { id: ids.pubMesuree, brandId: ids.brand, kind: 'ad', status: 'completed', input: recette('Mesurée', { light: null }), output: {} },
    // Rendu noté par l'ancien index · doit rester servi, en lecture seule.
    { id: ids.pubIndexee, brandId: ids.brand, kind: 'ad', status: 'completed', input: recette('Indexée', { light: null }), output: { renders: {} } },
    { id: ids.pubAutreEspace, brandId: ids.brandAutre, kind: 'ad', status: 'completed', input: recette('Ailleurs') },
  ]);
});

beforeEach(() => {
  h.session = owner(); h.rendus = []; h.puts = []; h.heads = []; h.s3 = true;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') === 'HEAD') {
      h.heads.push(u);
      const key = u.replace('https://cdn.local.test/', '').split('/').map(decodeURIComponent).join('/');
      return new Response(null, { status: h.objets.has(key) ? 200 : 404 });
    }
    throw new Error(`réseau interdit en test · ${u}`);
  });
});

describe('GET /api/ad/[id] · une consultation n’écrit rien en base (#125)', () => {
  it('pub d’avant la mesure, cache vide · rendue SANS mesure, recette intacte, zéro écriture SQL', async () => {
    const avant = await empreinte();
    const { r, ecritures } = await sousEspion(() => get(ids.pubSansMesure, '?t=1'));
    expect(r.status).toBe(200);
    expect(r.headers.get('x-cache')).toBe('MISS');
    expect(ecritures, `écriture SQL pendant un GET de rendu :\n${ecritures.join('\n')}`).toEqual([]);
    expect(await empreinte(), 'une ligne a changé pendant la consultation').toBe(avant);
    const [g] = await db.select({ input: schema.generations.input }).from(schema.generations).where(eq(schema.generations.id, ids.pubSansMesure));
    expect('light' in (g!.input as object), 'la recette a été réécrite par la consultation (mesure rangée au GET)').toBe(false);
    expect(h.rendus.at(-1)?.light, 'la pub non mesurée doit se rendre sans mesure').toBeNull();
    expect(h.rendus.at(-1)?.width).toBe(432);
  });

  it('le PNG part dans le bucket sous sa clé DÉTERMINISTE · la ligne de la génération n’est pas touchée', async () => {
    const { ecritures } = await sousEspion(() => get(ids.pubMesuree, '?r=1:1'));
    expect(ecritures, `écriture SQL pendant un GET de rendu :\n${ecritures.join('\n')}`).toEqual([]);
    expect(h.puts.length, 'le rendu n’a pas été rangé dans le bucket').toBe(1);
    expect(h.puts[0]).toBe(cleObjetRendu(ids.pubMesuree, h.puts[0]!.split('/')[2]!.replace(/\.png$/, '')));
    expect(h.puts[0]).toMatch(new RegExp(`^renders/${ids.pubMesuree}/v9:${ids.pubMesuree}:1:1:f:[a-z0-9]+\\.png$`));
    const [g] = await db.select({ output: schema.generations.output }).from(schema.generations).where(eq(schema.generations.id, ids.pubMesuree));
    expect(g!.output, 'l’index des rendus a été écrit dans la génération').toEqual({});
  });

  it('après un redéploiement · l’objet déjà rangé est retrouvé par HEAD (302), sans recomposer ni écrire', async () => {
    vi.resetModules(); _oublierPresents(); // cache mémoire perdu, comme à une mise en ligne
    const { r, ecritures } = await sousEspion(() => get(ids.pubMesuree, '?r=1:1'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toMatch(/^https:\/\/cdn\.local\.test\/renders\//);
    expect(h.rendus.length, 'la pub a été recomposée alors que le bucket l’avait').toBe(0);
    expect(h.puts.length).toBe(0);
    expect(ecritures).toEqual([]);
  });

  it('l’ancien index `output.renders` est encore LU · 302 vers le rendu noté, rien d’écrit', async () => {
    const GET = await chargerRoute();
    // On note l'entrée exactement comme l'ancien code le faisait, pour la clé que le GET calculera.
    await GET(new Request(`http://local/api/ad/${ids.pubIndexee}?t=1`), { params: Promise.resolve({ id: ids.pubIndexee }) });
    const cle = h.puts.at(-1)!.split('/')[2]!.replace(/\.png$/, '');
    await db.update(schema.generations).set({ output: { renders: { [cle]: 'https://ancien.cdn.test/x.png' } } }).where(eq(schema.generations.id, ids.pubIndexee));
    vi.resetModules(); _oublierPresents(); h.puts = []; h.rendus = [];
    const { r, ecritures } = await sousEspion(() => get(ids.pubIndexee, '?t=1'));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://ancien.cdn.test/x.png');
    expect(ecritures).toEqual([]);
  });

  it('`?r=` inconnu → 400 · ni rendu, ni objet, ni écriture, ni nouvelle clé', async () => {
    for (const q of ['?r=zzz', '?r=zzz2', '?r=4:5x', '?r=16:9', '?t=2']) {
      const { r, ecritures } = await sousEspion(() => get(ids.pubMesuree, q));
      expect(r.status, `${q} doit être refusé`).toBe(400);
      expect(ecritures).toEqual([]);
    }
    expect(h.rendus.length, 'une valeur inconnue a déclenché une composition').toBe(0);
    expect(h.puts.length, 'une valeur inconnue a rangé un objet').toBe(0);
  });

  it('les ratios connus restent servis', async () => {
    for (const q of ['', '?t=1', '?r=4:5', '?r=1:1', '?r=9:16', '?r=9:16&t=1', '?t=0']) {
      const r = await get(ids.pubMesuree, q);
      expect([200, 302], `${q || '(sans paramètre)'} refusé à tort`).toContain(r.status);
    }
  });

  it('un lecteur client (client_viewer) ne déclenche aucune écriture non plus', async () => {
    h.session = viewer();
    const avant = await empreinte();
    const { r, ecritures } = await sousEspion(() => get(ids.pubSansMesure, '?r=9:16'));
    expect(r.status).toBe(200);
    expect(ecritures).toEqual([]);
    expect(await empreinte()).toBe(avant);
  });

  it('une pub d’un autre espace reste introuvable', async () => {
    const r = await get(ids.pubAutreEspace, '?t=1');
    expect(r.status).toBe(404);
  });
});

describe('La mesure des anciennes pubs vit derrière une COMMANDE explicite', () => {
  it('rattraperMesures · compte, mesure les seules recettes sans `light`, puis ne trouve plus rien', async () => {
    const { compterMesuresManquantes, rattraperMesures } = await import('../lib/scene-light');
    expect(await compterMesuresManquantes()).toBe(2); // la pub sans mesure + celle de l'autre espace
    const avantMesuree = await db.select({ input: schema.generations.input }).from(schema.generations).where(eq(schema.generations.id, ids.pubMesuree));
    const r1 = await rattraperMesures();
    expect(r1).toEqual({ candidates: 2, mesurees: 2, echecs: 0 });
    const [g] = await db.select({ input: schema.generations.input }).from(schema.generations).where(eq(schema.generations.id, ids.pubSansMesure));
    const input = g!.input as Record<string, unknown>;
    expect(input.light, 'la mesure n’a pas été rangée').toBeTruthy();
    expect(input.headline, 'la fusion a écrasé la recette').toBe('Sans mesure');
    const apresMesuree = await db.select({ input: schema.generations.input }).from(schema.generations).where(eq(schema.generations.id, ids.pubMesuree));
    expect(apresMesuree, 'une recette déjà mesurée (même en échec) a été réécrite').toEqual(avantMesuree);
    expect(await rattraperMesures(), 'rejouer la commande a encore écrit').toEqual({ candidates: 0, mesurees: 0, echecs: 0 });
    // Et la consultation en profite, sans rien écrire.
    h.rendus = [];
    const { ecritures } = await sousEspion(() => get(ids.pubSansMesure, '?r=4:5'));
    expect(ecritures).toEqual([]);
    expect(h.rendus.at(-1)?.light, 'la mesure rangée par la commande n’est pas utilisée au rendu').toBeTruthy();
  });
});
