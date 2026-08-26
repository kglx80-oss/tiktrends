import { db, schema, eq, and } from '@tiktrends/db';
import { decryptSecret, shopifyCommerceSync, metaAdsSync, storageFromEnv, syncDriveAssets } from '@tiktrends/integrations';

/** Synchro des dossiers Google Drive connectés (par MARQUE) vers la bibliothèque d'assets. */
async function runDriveSync(): Promise<{ drive: number; errors: number }> {
  if (!db) return { drive: 0, errors: 0 };
  const brands = await db.select({
    id: schema.brands.id, workspaceId: schema.brands.workspaceId,
    tok: schema.brands.driveRefreshToken, fid: schema.brands.driveFolderId,
  }).from(schema.brands);

  let drive = 0, errors = 0;
  const storage = storageFromEnv();
  for (const b of brands) {
    const rt = decryptSecret(b.tok);
    if (!rt || !b.fid) continue;
    try {
      const res = await syncDriveAssets({
        existingDriveIds: async () => {
          const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets)
            .where(and(eq(schema.assets.brandId, b.id), eq(schema.assets.source, 'drive')));
          return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
        },
        insertAsset: async (a) => { await db!.insert(schema.assets).values({ workspaceId: b.workspaceId, brandId: b.id, uploaderUserId: null, ...a }); },
      }, { storage, refreshToken: rt, folderId: b.fid, workspaceId: b.workspaceId, maxFiles: 100 });
      await db.update(schema.brands).set({ driveSyncedAt: new Date() }).where(eq(schema.brands.id, b.id));
      drive += res.added;
    } catch (e) { errors++; console.error('[sync] drive', b.id, (e as Error).message); }
  }
  return { drive, errors };
}

/**
 * Synchro quotidienne des sources de données (Shopify + Meta) de toutes les marques
 * connectées, et des dossiers Google Drive des espaces.
 * Best-effort : une erreur sur une source n'arrête pas les autres.
 */
export async function runDailySync(): Promise<{ shopify: number; meta: number; drive: number; errors: number }> {
  if (!db) return { shopify: 0, meta: 0, drive: 0, errors: 0 };
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
  const d = await runDriveSync();
  errors += d.errors;
  console.log(`[sync] daily done · shopify=${shopify} meta=${meta} drive=${d.drive} errors=${errors}`);
  return { shopify, meta, drive: d.drive, errors };
}
