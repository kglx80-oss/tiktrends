// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * SSRF Shopify · relecture sécurité de main 62a341e3.
 *
 * 1 · `discoverShopify` (`apps/web/lib/shopify.ts`, import du catalogue public
 *     · `createBrandFromShopifyAction`, `syncShopifyProductsAction`) appelait
 *     un `fetch` BRUT · qui suit les redirections et ne regarde pas l'adresse
 *     résolue. Une boutique « publique » qui renvoie un 302 vers 127.0.0.1 ou
 *     169.254.169.254 (métadonnées du VPS) faisait relayer la réponse interne,
 *     enregistrée ensuite comme catalogue de la marque.
 * 2 · `adminGraphQL` (`packages/integrations/src/shopify-admin.ts` ·
 *     `connectShopifyAction`, `syncShopifyAction`, le worker de synchro)
 *     envoyait un POST portant le jeton Admin (`X-Shopify-Access-Token`) à
 *     `https://<domaine saisi>` · port compris, redirection 307 suivie (méthode,
 *     corps ET en-têtes conservés) · le jeton partait vers un service interne.
 *
 * Le faux réseau · de VRAIS serveurs HTTP locaux (`connection: 'close'`) ·
 * un « interne » qui COMPTE les requêtes reçues (et le jeton qu'on lui
 * présente), des « boutiques » qui redirigent vers lui ou vers l'adresse des
 * métadonnées, une boutique légitime. Un aiguillage remplace le DNS et le
 * routage (les noms `*.test` répondent par une adresse publique de
 * documentation, `interne.test` par 127.0.0.1) · il SUIT les redirections
 * quand l'appelant le demande (comme `fetch` par défaut), et rend le 3xx tel
 * quel en `redirect: 'manual'`. On lit le RÉSULTAT · le nombre de requêtes
 * reçues par l'interne, ce que la fonction renvoie, la ligne de `brands`.
 * 0 $ · aucun appel réseau réel.
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-ssrf-shopify-0123456789abcdef';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    marque: null as string | null,
    ids: { ws: u(), admin: u(), brand: u() },
    /** Adresse publique de documentation (TEST-NET-3) · ce que « le DNS » répond pour les boutiques. */
    publique: '203.0.113.10',
  };
});

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>();
  const lookup = async (host: string, opts?: unknown) => {
    // Le DNS et le routage disent la MÊME chose · `interne.test` (et sa variante www) est 127.0.0.1.
    if (host.replace(/^www\./, '') === 'interne.test') return [{ address: '127.0.0.1', family: 4 }];
    if (host.endsWith('.test')) return [{ address: h.publique, family: 4 }];
    return (actual.lookup as (h: string, o?: unknown) => Promise<unknown>)(host, opts);
  };
  return { ...actual, lookup, default: { ...actual, lookup } };
});
vi.mock('next/headers', () => ({
  cookies: async () => {
    const lire = (n: string) => (n === 'tt_session' ? h.jeton : n === 'tt_brand' ? h.marque : null);
    return { get: (n: string) => { const v = lire(n); return v ? { name: n, value: v } : undefined; }, getAll: () => [], has: (n: string) => !!lire(n), set: () => {}, delete: () => {} };
  },
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { shopifyAdminTest, shopifyCommerceSync } from '@tiktrends/integrations';
import { discoverShopify } from '../lib/shopify';
import { connectShopifyAction } from '../app/actions/connections';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

/* ─────────────────────────── le faux réseau ─────────────────────────── */

const interne = { requetes: [] as Array<{ methode: string; chemin: string; jeton: string | null }> };
const serveurs: Server[] = [];
const port: Record<'interne' | 'redirige' | 'meta' | 'legitime', number> = { interne: 0, redirige: 0, meta: 0, legitime: 0 };

const json = (res: ServerResponse, statut: number, corps: unknown) => {
  res.writeHead(statut, { 'content-type': 'application/json', connection: 'close' });
  res.end(JSON.stringify(corps));
};
const PRODUITS = [
  { handle: 'creme-de-jour', title: 'Crème de jour', body_html: '<p>Hydrate.</p>', vendor: 'Maison Légitime', variants: [{ price: '29.90' }], images: [{ src: 'https://cdn.exemple.test/creme.jpg' }] },
  { handle: 'serum', title: 'Sérum', vendor: 'Maison Légitime', variants: [{ price: '45.00' }] },
];

async function ecouter(nom: keyof typeof port, rep: (req: IncomingMessage, res: ServerResponse) => void): Promise<void> {
  const s = createServer((req, res) => { req.resume(); req.on('end', () => rep(req, res)); });
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', () => ok()));
  port[nom] = (s.address() as AddressInfo).port;
  serveurs.push(s);
}

/** Où va réellement un nom · le DNS et le routage du faux réseau. null · hors du faux réseau (refusé). */
function aiguiller(cible: URL): string | null {
  const hote = cible.hostname.replace(/^www\./, '');
  const vers = (p: number) => `http://127.0.0.1:${p}${cible.pathname}${cible.search}`;
  if (hote === 'interne.test' || hote === '169.254.169.254') return vers(port.interne);
  if (hote === '127.0.0.1' && Number(cible.port) === port.interne) return vers(port.interne);
  if (hote === 'boutique-redirige.test') return vers(port.redirige);
  if (hote === 'boutique-meta.test') return vers(port.meta);
  if (hote === 'boutique-legitime.test') return vers(port.legitime);
  return null;
}

/**
 * `fetch` du faux réseau · même contrat que le vrai : `redirect: 'manual'` rend
 * le 3xx ; sinon la redirection est SUIVIE (301/302/303 → GET sans corps,
 * 307/308 → même méthode, même corps, mêmes en-têtes), comme le fait `fetch`.
 */
const fetchReel = globalThis.fetch;
async function fauxFetch(entree: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  let cible = new URL(typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url);
  let options: RequestInit = { ...init };
  for (let saut = 0; saut < 20; saut++) {
    const reel = aiguiller(cible);
    if (!reel) throw new TypeError(`fetch failed · ${cible.host} hors du faux réseau`);
    const r = await fetchReel(reel, { ...options, redirect: 'manual' });
    if (r.status < 300 || r.status >= 400 || init.redirect === 'manual') return r;
    const loc = r.headers.get('location');
    if (!loc) return r;
    cible = new URL(loc, cible);
    if (r.status !== 307 && r.status !== 308) options = { ...options, method: 'GET', body: undefined };
  }
  throw new TypeError('trop de redirections');
}

beforeAll(async () => {
  await ecouter('interne', (req, res) => {
    interne.requetes.push({ methode: req.method ?? '', chemin: req.url ?? '', jeton: (req.headers['x-shopify-access-token'] as string | undefined) ?? null });
    // Ce qu'un service interne rendrait · s'il remonte dans un résultat, c'est une fuite.
    json(res, 200, { products: [{ handle: 'secret-interne', title: 'Donnée interne', variants: [{ price: '1' }] }], data: { shop: { name: 'Service interne', currencyCode: 'XXX' } } });
  });
  await ecouter('redirige', (req, res) => {
    res.writeHead(req.method === 'POST' ? 307 : 302, { location: `http://127.0.0.1:${port.interne}/vol${req.url ?? ''}`, connection: 'close' });
    res.end();
  });
  await ecouter('meta', (_req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/', connection: 'close' });
    res.end();
  });
  await ecouter('legitime', (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'POST' && u.pathname === '/admin/api/2024-10/graphql.json') {
      if (req.headers['x-shopify-access-token'] !== 'shpat_legitime') return json(res, 401, {});
      return json(res, 200, { data: { shop: { name: 'Boutique Légitime', currencyCode: 'EUR' }, orders: { edges: [] } } });
    }
    if (u.pathname === '/products.json') return json(res, 200, { products: u.searchParams.get('page') === '1' ? PRODUITS : [] });
    return json(res, 404, {});
  });
  vi.stubGlobal('fetch', fauxFetch);

  await db!.insert(schema.workspaces).values({ id: h.ids.ws, name: 'Espace', plan: 'core' });
  await db!.insert(schema.users).values({ id: h.ids.admin, email: 'admin@ssrf.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: h.ids.ws, userId: h.ids.admin, role: 'admin' });
  await db!.insert(schema.brands).values({ id: h.ids.brand, workspaceId: h.ids.ws, name: 'Marque' });
  h.jeton = await new SignJWT({ uid: h.ids.admin, ep: 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  h.marque = h.ids.brand;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await Promise.all(serveurs.map((s) => new Promise<void>((ok) => s.close(() => ok()))));
});
beforeEach(() => { interne.requetes = []; });

const echec = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => String(e));

/* ─────────────────────────── le catalogue public ─────────────────────────── */

describe('discoverShopify · le catalogue public ne relaie jamais une adresse interne', () => {
  it('boutique qui redirige vers 127.0.0.1 · refusée, aucune requête reçue par l’interne', async () => {
    const r = await discoverShopify('boutique-redirige.test');
    expect(interne.requetes, 'la redirection vers 127.0.0.1 a atteint le service interne').toEqual([]);
    expect(r, 'la réponse interne a été rendue comme catalogue').toBeNull();
  });

  it('boutique qui redirige vers 169.254.169.254 (métadonnées) · refusée, aucune requête interne', async () => {
    const r = await discoverShopify('boutique-meta.test');
    expect(interne.requetes, 'la redirection vers les métadonnées a été suivie').toEqual([]);
    expect(r).toBeNull();
  });

  it('nom qui se résout en 127.0.0.1 · refusé avant toute connexion', async () => {
    const r = await discoverShopify('interne.test');
    expect(interne.requetes, 'un nom résolu en 127.0.0.1 a été interrogé').toEqual([]);
    expect(r).toBeNull();
  });

  it('domaine avec un port explicite · refusé, aucune requête', async () => {
    expect(await discoverShopify(`boutique-legitime.test:${port.legitime}`)).toBeNull();
    expect(await discoverShopify(`127.0.0.1:${port.interne}`)).toBeNull();
    expect(interne.requetes).toEqual([]);
  });

  it('boutique légitime · inchangé · le catalogue est importé', async () => {
    const r = await discoverShopify('https://boutique-legitime.test/collections/tout');
    expect(r?.origin).toBe('https://boutique-legitime.test');
    expect(r?.products).toEqual([
      { handle: 'creme-de-jour', title: 'Crème de jour', description: 'Hydrate.', price: 29.9, url: 'https://boutique-legitime.test/products/creme-de-jour', imageUrl: 'https://cdn.exemple.test/creme.jpg', vendor: 'Maison Légitime' },
      { handle: 'serum', title: 'Sérum', description: null, price: 45, url: 'https://boutique-legitime.test/products/serum', imageUrl: null, vendor: 'Maison Légitime' },
    ]);
    expect(interne.requetes).toEqual([]);
  });
});

/* ─────────────────────────── l'API Admin (jeton) ─────────────────────────── */

describe('adminGraphQL · le jeton Admin ne part jamais vers une adresse interne', () => {
  const CAS: Array<[string, () => string]> = [
    ['adresse interne avec port (127.0.0.1:port)', () => `127.0.0.1:${port.interne}`],
    ['domaine public avec un port explicite', () => `boutique-legitime.test:${port.legitime}`],
    // 8443 est un port web que `assertPublicUrl` admet · seul le domaine nu exigé le refuse.
    ['domaine public avec un port web explicite (8443)', () => 'boutique-legitime.test:8443'],
    ['boutique qui redirige (307) vers l’interne', () => 'boutique-redirige.test'],
    ['nom qui se résout en 127.0.0.1', () => 'interne.test'],
  ];
  for (const [cas, domaine] of CAS) {
    it(`${cas} · refusé, aucune requête interne, aucun jeton transmis`, async () => {
      // Le VRAI jeton de la boutique · seul le domaine (port, redirection, adresse) doit faire refuser.
      const e = await echec(shopifyAdminTest(domaine(), 'shpat_legitime'));
      expect(interne.requetes, `le service interne a reçu la requête Admin (${cas})`).toEqual([]);
      expect(e ?? '(aucun refus)', `la connexion aurait dû être refusée, en disant pourquoi (${cas})`).toMatch(/Shopify : (adresse refusée|domaine invalide)/);
      const e2 = await echec(shopifyCommerceSync(domaine(), 'shpat_legitime'));
      expect(e2 ?? '(aucun refus)').toMatch(/Shopify : (adresse refusée|domaine invalide)/);
      expect(interne.requetes).toEqual([]);
    });
  }

  it('boutique légitime · inchangé · nom de boutique et synchro', async () => {
    expect(await shopifyAdminTest('boutique-legitime.test', 'shpat_legitime')).toEqual({ shopName: 'Boutique Légitime', currency: 'EUR' });
    expect(await shopifyAdminTest('https://boutique-legitime.test/admin', 'shpat_legitime')).toEqual({ shopName: 'Boutique Légitime', currency: 'EUR' });
    const ins = await shopifyCommerceSync('boutique-legitime.test', 'shpat_legitime');
    expect(ins).toMatchObject({ shopName: 'Boutique Légitime', currency: 'EUR', orders30d: 0, revenue30d: 0, topProducts: [] });
    expect(interne.requetes).toEqual([]);
  });
});

/* ─────────────────────────── de bout en bout ─────────────────────────── */

describe('connectShopifyAction · VRAI getSession (administrateur), base réelle', () => {
  const ligne = async () => (await db!.select({ d: schema.brands.shopifyDomain, t: schema.brands.shopifyToken }).from(schema.brands).where(eq(schema.brands.id, h.ids.brand)))[0]!;

  it('domaine interne avec port · erreur, rien d’enregistré, aucune requête interne', async () => {
    const avant = await ligne();
    const r = await connectShopifyAction({ domain: `127.0.0.1:${port.interne}`, token: 'shpat_secret' });
    expect(interne.requetes, 'l’action a fait partir le jeton vers l’interne').toEqual([]);
    expect(r.ok).toBeUndefined();
    expect(r.error).toBeTruthy();
    expect(await ligne()).toEqual(avant);
  });

  it('boutique légitime · inchangé · connectée et enregistrée', async () => {
    const r = await connectShopifyAction({ domain: 'boutique-legitime.test', token: 'shpat_legitime' });
    expect(r).toEqual({ ok: true, shopName: 'Boutique Légitime' });
    expect((await ligne()).d).toBe('boutique-legitime.test');
  });
});
