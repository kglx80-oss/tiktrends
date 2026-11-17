// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Gardes de rôle et d'offre manquantes · relecture sécurité de main 62a341e3.
 *
 * 1 · Les routes OAuth (départ ET callback · Meta, Google Drive, Shopify) ne
 *     vérifiaient que la session et l'espace de l'état signé. Les actions de
 *     connexion exigent un administrateur (`app/actions/connections.ts`,
 *     `drive.ts`) et la page Connexions aussi · un `member` ou un
 *     `client_viewer` pouvait pourtant appeler la route directement et ÉCRASER
 *     les jetons de la marque (`metaToken`, `metaAdAccounts`,
 *     `metaAdAccountId`, `driveRefreshToken`, `shopifyToken`, `shopifyDomain`).
 * 2 · Les actions du Radar (`decouverteMarcheAction`, `scanTrackerAction`,
 *     `markTrackerSeenAction`) ne vérifiaient ni rôle ni offre, alors que la
 *     page Radar exige la feature `radar` (Membre, offre Core).
 *
 * Ce fichier éprouve le VRAI `getSession` sur un jeton signé (seuls les
 * cookies sont apportés par le test), base réelle (pglite, migrations du
 * dépôt), le VRAI état OAuth signé. Le réseau sortant est un faux `fetch` qui
 * COMPTE les requêtes · un refus n'en émet aucune. On lit le RÉSULTAT · la
 * cible de la redirection, la ligne de `brands` avant / après, les lignes du
 * suivi. 0 $ · aucun modèle, aucun appel réseau réel.
 */

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'secret-de-test-gardes-role-0123456789abcdef';
  process.env.APP_URL = 'https://app.exemple.test';
  process.env.META_APP_ID = 'meta-app';
  process.env.META_APP_SECRET = 'meta-secret';
  process.env.GOOGLE_CLIENT_ID = 'google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.SHOPIFY_API_KEY = 'shopify-cle';
  process.env.SHOPIFY_API_SECRET = 'shopify-secret';
  process.env.TRENDTRACK_API_KEY = 'veille-cle';
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    jeton: null as string | null,
    marque: null as string | null,
    requetes: [] as string[],
    ids: { ws: u(), wsStarter: u(), owner: u(), admin: u(), member: u(), viewer: u(), ownerStarter: u(), brand: u(), brandStarter: u(), suivie: u(), suivieStarter: u() },
  };
});

vi.mock('next/headers', () => ({
  cookies: async () => {
    const lire = (n: string) => (n === 'tt_session' ? h.jeton : n === 'tt_brand' ? h.marque : null);
    return {
      get: (n: string) => { const v = lire(n); return v ? { name: n, value: v } : undefined; },
      getAll: () => [], has: (n: string) => !!lire(n), set: () => {}, delete: () => {},
    };
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
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db, schema } from '@tiktrends/db';
import { messagesRetourConnexions } from '@tiktrends/core';
import { signState, verifyState } from '../lib/oauth-state';
import { GET as departMeta } from '../app/api/oauth/meta/route';
import { GET as retourMeta } from '../app/api/oauth/meta/callback/route';
import { GET as departGoogle } from '../app/api/oauth/google/route';
import { GET as retourGoogle } from '../app/api/oauth/google/callback/route';
import { GET as departShopify } from '../app/api/oauth/shopify/route';
import { GET as retourShopify } from '../app/api/oauth/shopify/callback/route';
import { decouverteMarcheAction } from '../app/actions/decouverte';
import { markTrackerSeenAction, scanTrackerAction } from '../app/actions/tracker';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 });

const ids = h.ids;
const APP = process.env.APP_URL!;
const INTERDIT = `${APP}/connections?e=forbidden`;
const BOUTIQUE = 'boutique-test.myshopify.com';

/** Le faux réseau · chaque requête est comptée, la réponse imite le fournisseur. */
function reponse(url: string): unknown {
  if (url.includes('graph.facebook.com') && url.includes('/oauth/access_token')) return { access_token: 'meta-jeton-long' };
  if (url.includes('graph.facebook.com') && url.includes('/me/adaccounts')) return { data: [{ account_id: '4242', name: 'Compte test', currency: 'EUR' }] };
  if (url.includes('oauth2.googleapis.com/token')) return { access_token: 'g-acces', refresh_token: 'g-rafraichi' };
  if (url.includes('myshopify.com/admin/oauth/access_token')) return { access_token: 'shpat_test' };
  if (url.includes('/v1/ads/query')) return { data: [{ id: 'pub-1', advertiserName: 'Concurrent' }], pagination: { total: 1 } };
  return {};
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    h.requetes.push(url);
    return new Response(JSON.stringify(reponse(url)), { status: 200, headers: { 'content-type': 'application/json', connection: 'close' } });
  });
  await db!.insert(schema.workspaces).values([
    { id: ids.ws, name: 'Espace Core', plan: 'core' },
    { id: ids.wsStarter, name: 'Espace Starter', plan: 'starter' },
  ]);
  await db!.insert(schema.users).values([
    { id: ids.owner, email: 'owner@gardes.test' }, { id: ids.admin, email: 'admin@gardes.test' },
    { id: ids.member, email: 'member@gardes.test' }, { id: ids.viewer, email: 'viewer@gardes.test' },
    { id: ids.ownerStarter, email: 'owner@starter.test' },
  ]);
  await db!.insert(schema.workspaceMembers).values([
    { workspaceId: ids.ws, userId: ids.owner, role: 'owner' }, { workspaceId: ids.ws, userId: ids.admin, role: 'admin' },
    { workspaceId: ids.ws, userId: ids.member, role: 'member' }, { workspaceId: ids.ws, userId: ids.viewer, role: 'client_viewer' },
    { workspaceId: ids.wsStarter, userId: ids.ownerStarter, role: 'owner' },
  ]);
  await db!.insert(schema.brands).values([
    { id: ids.brand, workspaceId: ids.ws, name: 'Marque Core', category: 'skincare' },
    { id: ids.brandStarter, workspaceId: ids.wsStarter, name: 'Marque Starter', category: 'skincare' },
  ]);
  await db!.insert(schema.followedBrands).values([
    { id: ids.suivie, workspaceId: ids.ws, platform: 'meta', name: 'Concurrent' },
    { id: ids.suivieStarter, workspaceId: ids.wsStarter, platform: 'meta', name: 'Concurrent' },
  ]);
});

/** Les jetons de la marque · remis à un état CONNU avant chaque cas (une connexion légitime antérieure). */
const AVANT = { metaToken: 'jeton-meta-legitime', metaAdAccounts: [{ id: 'act_1', name: 'Compte légitime' }], metaAdAccountId: 'act_1', driveRefreshToken: 'drive-legitime', shopifyToken: 'shopify-legitime', shopifyDomain: 'legitime.myshopify.com' };
beforeEach(async () => {
  h.requetes = [];
  await db!.update(schema.brands).set(AVANT).where(eq(schema.brands.id, ids.brand));
  await db!.update(schema.followedBrands).set({ seenAdIds: null, lastCheckedAt: null });
  await db!.delete(schema.brandTrackerEvents);
  await db!.insert(schema.brandTrackerEvents).values([
    { workspaceId: ids.ws, followedBrandId: ids.suivie, platform: 'meta', advertiserName: 'Concurrent', snapshot: { id: 'ancienne' } },
    { workspaceId: ids.wsStarter, followedBrandId: ids.suivieStarter, platform: 'meta', advertiserName: 'Concurrent', snapshot: { id: 'ancienne' } },
  ]);
});

type Qui = 'owner' | 'admin' | 'member' | 'viewer' | 'ownerStarter';
/** Un VRAI jeton de session, signé comme `createSession` le signe, et la marque active de l'espace. */
async function connecter(qui: Qui): Promise<void> {
  const uid = ids[qui];
  const [u] = await db!.select({ e: schema.users.sessionEpoch }).from(schema.users).where(eq(schema.users.id, uid));
  h.jeton = await new SignJWT({ uid, ep: u?.e ?? 0 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('3600s')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  h.marque = qui === 'ownerStarter' ? ids.brandStarter : ids.brand;
}

async function ligneMarque(): Promise<string> {
  const [b] = await db!.select().from(schema.brands).where(eq(schema.brands.id, ids.brand));
  return JSON.stringify(b);
}

const req = (chemin: string) => new NextRequest(`${APP}${chemin}`);
function retourShopifySigne(state: string): NextRequest {
  const p = new URLSearchParams({ code: 'code-shopify', shop: BOUTIQUE, state, timestamp: '1700000000' });
  const message = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  p.set('hmac', createHmac('sha256', process.env.SHOPIFY_API_SECRET!).update(message).digest('hex'));
  return req(`/api/oauth/shopify/callback?${p}`);
}

const DEPARTS: Record<string, () => Promise<Response>> = {
  'Meta': () => departMeta(),
  'Google Drive': () => departGoogle(),
  'Shopify': () => departShopify(req(`/api/oauth/shopify?shop=${BOUTIQUE}`)),
};
const RETOURS: Record<string, () => Promise<Response>> = {
  'Meta': () => retourMeta(req(`/api/oauth/meta/callback?code=code-meta&state=${encodeURIComponent(signState({ brandId: ids.brand, ws: ids.ws }))}`)),
  'Google Drive': () => retourGoogle(req(`/api/oauth/google/callback?code=code-google&state=${encodeURIComponent(signState({ ws: ids.ws, brand: ids.brand }))}`)),
  'Shopify': () => retourShopify(retourShopifySigne(signState({ brandId: ids.brand, ws: ids.ws, shop: BOUTIQUE }))),
};

describe('Routes OAuth · un member ou un client_viewer est refusé, au départ comme au retour', () => {
  for (const qui of ['member', 'viewer'] as const) {
    for (const [nom, depart] of Object.entries(DEPARTS)) {
      it(`départ ${nom} · ${qui} · redirigé vers le refus, aucun état signé émis`, async () => {
        await connecter(qui);
        const r = await depart();
        const cible = r.headers.get('location');
        expect(cible, `un ${qui} ne doit pas partir chez le fournisseur ${nom}`).toBe(INTERDIT);
        expect(h.requetes).toEqual([]);
      });
    }
    for (const [nom, retour] of Object.entries(RETOURS)) {
      it(`retour ${nom} · ${qui} · refusé, aucune colonne de la marque modifiée, aucun échange de code`, async () => {
        await connecter(qui);
        const avant = await ligneMarque();
        const r = await retour();
        expect(r.headers.get('location'), `le retour ${nom} d’un ${qui} doit être refusé`).toBe(INTERDIT);
        expect(await ligneMarque(), `un ${qui} a écrasé les jetons de la marque (${nom})`).toBe(avant);
        expect(h.requetes, `le code ${nom} ne doit pas être échangé pour un ${qui}`).toEqual([]);
      });
    }
  }
});

describe('Le retour refusé est dit à l’écran Connexions', () => {
  it('`?e=forbidden` a sa phrase (jamais le code brut)', () => {
    expect(messagesRetourConnexions()['e:forbidden']).toMatch(/réservé aux administrateurs de l’espace/);
  });
});

describe('Routes OAuth · un administrateur (admin, owner) · comportement inchangé', () => {
  for (const qui of ['admin', 'owner'] as const) {
    it(`départs · ${qui} · partent chez le fournisseur avec l’état signé de la marque active`, async () => {
      await connecter(qui);
      const meta = new URL((await DEPARTS['Meta']!()).headers.get('location')!);
      expect(meta.host).toBe('www.facebook.com');
      expect(verifyState<{ brandId: string; ws: string }>(meta.searchParams.get('state'))).toMatchObject({ brandId: ids.brand, ws: ids.ws });
      const google = new URL((await DEPARTS['Google Drive']!()).headers.get('location')!);
      expect(google.host).toBe('accounts.google.com');
      expect(verifyState<{ brand: string; ws: string }>(google.searchParams.get('state'))).toMatchObject({ brand: ids.brand, ws: ids.ws });
      const shop = new URL((await DEPARTS['Shopify']!()).headers.get('location')!);
      expect(shop.host).toBe(BOUTIQUE);
      expect(verifyState<{ brandId: string; shop: string }>(shop.searchParams.get('state'))).toMatchObject({ brandId: ids.brand, shop: BOUTIQUE });
    });

    it(`retours · ${qui} · les jetons de la marque sont posés, comme sur main`, async () => {
      await connecter(qui);
      expect((await RETOURS['Meta']!()).headers.get('location')).toBe(`${APP}/connections?ok=meta`);
      expect((await RETOURS['Google Drive']!()).headers.get('location')).toBe(`${APP}/assets?ok=drive`);
      expect((await RETOURS['Shopify']!()).headers.get('location')).toBe(`${APP}/connections?ok=shopify`);
      const [b] = await db!.select().from(schema.brands).where(eq(schema.brands.id, ids.brand));
      expect(b!.metaToken).not.toBe(AVANT.metaToken);
      expect(b!.metaAdAccounts).toEqual([{ id: 'act_4242', name: 'Compte test', currency: 'EUR' }]);
      expect(b!.metaAdAccountId).toBe('act_4242');
      expect(b!.driveRefreshToken).not.toBe(AVANT.driveRefreshToken);
      expect(b!.shopifyToken).not.toBe(AVANT.shopifyToken);
      expect(b!.shopifyDomain).toBe(BOUTIQUE);
    });
  }
});

/** Ce que le suivi a écrit · la marque suivie et le fil des nouveautés. */
async function etatSuivi(): Promise<string> {
  const f = await db!.select({ id: schema.followedBrands.id, vus: schema.followedBrands.seenAdIds, le: schema.followedBrands.lastCheckedAt }).from(schema.followedBrands);
  const ev = await db!.select({ ws: schema.brandTrackerEvents.workspaceId, seenAt: schema.brandTrackerEvents.seenAt }).from(schema.brandTrackerEvents);
  const trie = <T>(l: T[]) => l.map((x) => JSON.stringify(x)).sort();
  return JSON.stringify({ f: trie(f), ev: trie(ev) });
}
const veille = () => h.requetes.filter((u) => u.includes('/v1/'));

describe('Actions du Radar · la garde de la page (feature `radar` · rôle Membre, offre Core)', () => {
  const REFUS: Array<{ qui: Qui; raison: RegExp; cas: string }> = [
    { qui: 'viewer', raison: /Ton rôle ne permet pas d’utiliser le Radar/, cas: 'client_viewer (rôle)' },
    { qui: 'ownerStarter', raison: /offre Core/, cas: 'propriétaire d’un espace Starter (offre)' },
  ];
  for (const { qui, raison, cas } of REFUS) {
    it(`${cas} · les trois actions sont refusées, aucune requête de veille, rien d’écrit`, async () => {
      await connecter(qui);
      const avant = await etatSuivi();
      const d = await decouverteMarcheAction();
      expect(d.error ?? '(aucun refus)', `la découverte doit être refusée (${cas})`).toMatch(raison);
      expect(d.ads).toBeUndefined();
      const sc = await scanTrackerAction();
      expect(sc.error ?? '(aucun refus)', `le scan doit être refusé (${cas})`).toMatch(raison);
      expect(sc.scanned).toBeUndefined();
      await markTrackerSeenAction();
      expect(veille(), `aucune requête de veille ne doit partir (${cas})`).toEqual([]);
      expect(await etatSuivi(), `le suivi a été modifié (${cas})`).toBe(avant);
    });
  }

  it('membre d’un espace Core · inchangé · découverte, scan et « vu » passent', async () => {
    await connecter('member');
    const d = await decouverteMarcheAction();
    expect(d.error).toBeUndefined();
    expect(veille().length, 'la découverte interroge la veille').toBe(1);
    const sc = await scanTrackerAction();
    expect(sc).toEqual({ scanned: 1, newAds: 0 });
    const [f] = await db!.select().from(schema.followedBrands).where(eq(schema.followedBrands.id, ids.suivie));
    expect(f!.seenAdIds, 'le scan pose la base des annonces vues').toEqual(['pub-1']);
    await markTrackerSeenAction();
    const ev = await db!.select({ seenAt: schema.brandTrackerEvents.seenAt }).from(schema.brandTrackerEvents).where(eq(schema.brandTrackerEvents.workspaceId, ids.ws));
    expect(ev.length > 0 && ev.every((e) => e.seenAt !== null), 'les nouveautés sont marquées vues').toBe(true);
  });
});

/** Recensement · toute route OAuth qui signe un état ou écrit la marque est éprouvée ici. */
describe('Recensement · les routes OAuth éprouvées', () => {
  it('les routes de `app/api/oauth` (hors TikTok, sans session ni écriture) sont toutes couvertes', () => {
    const racine = join(__dirname, '..', 'app/api/oauth');
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (n === 'route.ts') fichiers.push(relative(racine, p)); } };
    parcourir(racine);
    expect(fichiers.sort()).toEqual(['google/callback/route.ts', 'google/route.ts', 'meta/callback/route.ts', 'meta/route.ts', 'shopify/callback/route.ts', 'shopify/route.ts', 'tiktok/route.ts']);
  });
});
