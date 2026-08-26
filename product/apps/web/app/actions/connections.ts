'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { shopifyAdminTest, shopifyCommerceSync, metaAdsTest, metaAdsSync, type ShopifyCommerceInsights, type MetaAdsInsights } from '@tiktrends/integrations';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { getActiveBrand } from '../../lib/brands';
import { encryptSecret, decryptSecret } from '../../lib/secrets';

async function guard() {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  if (!roleAtLeast(s.role, 'admin')) return { error: 'Action réservée aux administrateurs.' as const };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active.' as const };
  return { s, brand };
}

export interface ConnectionState {
  shopify: { connected: boolean; domain: string | null; insights: ShopifyCommerceInsights | null };
  meta: { connected: boolean; adAccountId: string | null; insights: MetaAdsInsights | null };
  syncedAt: string | null;
}

/** État des connexions data de la marque active (pour l'UI). */
export async function getConnectionState(): Promise<ConnectionState | null> {
  const s = await getSession();
  if (!s || !db) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;
  const [b] = await db.select({
    shopifyDomain: schema.brands.shopifyDomain, shopifyToken: schema.brands.shopifyToken,
    metaToken: schema.brands.metaToken, metaAdAccountId: schema.brands.metaAdAccountId,
    commerce: schema.brands.commerceInsights, ads: schema.brands.adsInsights, syncedAt: schema.brands.insightsSyncedAt,
  }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  if (!b) return null;
  return {
    shopify: { connected: !!b.shopifyToken, domain: b.shopifyDomain ?? null, insights: (b.commerce as ShopifyCommerceInsights) ?? null },
    meta: { connected: !!b.metaToken, adAccountId: b.metaAdAccountId ?? null, insights: (b.ads as MetaAdsInsights) ?? null },
    syncedAt: b.syncedAt ? b.syncedAt.toISOString() : null,
  };
}

/* ----------------------------- Shopify ----------------------------- */
export async function connectShopifyAction(input: { domain: string; token: string }): Promise<{ ok?: true; shopName?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const domain = (input.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const token = (input.token || '').trim();
  if (!domain || !token) return { error: 'Renseigne le domaine et le token Admin API.' };
  try {
    const { shopName } = await shopifyAdminTest(domain, token);
    await db!.update(schema.brands).set({ shopifyDomain: domain, shopifyToken: encryptSecret(token) }).where(eq(schema.brands.id, g.brand.id));
    return { ok: true, shopName };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function syncShopifyAction(): Promise<{ ok?: true; insights?: ShopifyCommerceInsights; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const [b] = await db!.select({ domain: schema.brands.shopifyDomain, token: schema.brands.shopifyToken }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);
  const token = decryptSecret(b?.token);
  if (!b?.domain || !token) return { error: 'Connecte d’abord ta boutique Shopify.' };
  try {
    const insights = await shopifyCommerceSync(b.domain, token);
    await db!.update(schema.brands).set({ commerceInsights: insights, insightsSyncedAt: new Date() }).where(eq(schema.brands.id, g.brand.id));
    return { ok: true, insights };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function disconnectShopifyAction(): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.brands).set({ shopifyToken: null, commerceInsights: null }).where(eq(schema.brands.id, g.brand.id));
  return { ok: true };
}

/* ------------------------------- Meta ------------------------------ */
export async function connectMetaAction(input: { adAccountId: string; token: string }): Promise<{ ok?: true; accountName?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const adAccountId = (input.adAccountId || '').trim();
  const token = (input.token || '').trim();
  if (!adAccountId || !token) return { error: 'Renseigne l’ID de compte publicitaire et le token.' };
  try {
    const { accountName } = await metaAdsTest(adAccountId, token);
    await db!.update(schema.brands).set({ metaAdAccountId: adAccountId, metaToken: encryptSecret(token) }).where(eq(schema.brands.id, g.brand.id));
    return { ok: true, accountName };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function syncMetaAction(): Promise<{ ok?: true; insights?: MetaAdsInsights; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  const [b] = await db!.select({ acct: schema.brands.metaAdAccountId, token: schema.brands.metaToken }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);
  const token = decryptSecret(b?.token);
  if (!b?.acct || !token) return { error: 'Connecte d’abord ton compte Meta Ads.' };
  try {
    const insights = await metaAdsSync(b.acct, token);
    await db!.update(schema.brands).set({ adsInsights: insights, insightsSyncedAt: new Date() }).where(eq(schema.brands.id, g.brand.id));
    return { ok: true, insights };
  } catch (e) { return { error: (e as Error).message }; }
}

export async function disconnectMetaAction(): Promise<{ ok?: true; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };
  await db!.update(schema.brands).set({ metaToken: null, adsInsights: null }).where(eq(schema.brands.id, g.brand.id));
  return { ok: true };
}
