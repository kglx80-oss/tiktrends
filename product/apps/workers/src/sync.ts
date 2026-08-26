import { db, schema, eq } from '@tiktrends/db';
import { decryptSecret, shopifyCommerceSync, metaAdsSync } from '@tiktrends/integrations';

/**
 * Synchro quotidienne des sources de données (Shopify + Meta) de toutes les marques
 * connectées. Best-effort : une erreur sur une marque n'arrête pas les autres.
 */
export async function runDailySync(): Promise<{ shopify: number; meta: number; errors: number }> {
  if (!db) return { shopify: 0, meta: 0, errors: 0 };
  const brands = await db.select({
    id: schema.brands.id, shopifyDomain: schema.brands.shopifyDomain, shopifyToken: schema.brands.shopifyToken,
    metaAdAccountId: schema.brands.metaAdAccountId, metaToken: schema.brands.metaToken,
  }).from(schema.brands);

  let shopify = 0, meta = 0, errors = 0;
  for (const b of brands) {
    const st = decryptSecret(b.shopifyToken);
    if (b.shopifyDomain && st) {
      try {
        const ins = await shopifyCommerceSync(b.shopifyDomain, st);
        await db.update(schema.brands).set({ commerceInsights: ins, insightsSyncedAt: new Date() }).where(eq(schema.brands.id, b.id));
        shopify++;
      } catch (e) { errors++; console.error('[sync] shopify', b.id, (e as Error).message); }
    }
    const mt = decryptSecret(b.metaToken);
    if (b.metaAdAccountId && mt) {
      try {
        const ins = await metaAdsSync(b.metaAdAccountId, mt);
        await db.update(schema.brands).set({ adsInsights: ins, insightsSyncedAt: new Date() }).where(eq(schema.brands.id, b.id));
        meta++;
      } catch (e) { errors++; console.error('[sync] meta', b.id, (e as Error).message); }
    }
  }
  console.log(`[sync] daily done · shopify=${shopify} meta=${meta} errors=${errors}`);
  return { shopify, meta, errors };
}
