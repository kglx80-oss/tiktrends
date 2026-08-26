import { db, schema, eq, and } from '@tiktrends/db';
import { decryptSecret, shopifyCommerceSync, metaAdsSync, storageFromEnv, syncDriveAssets } from '@tiktrends/integrations';

/** Synchro des dossiers Google Drive connectés vers la bibliothèque d'assets. */
async function runDriveSync(): Promise<{ drive: number; errors: number }> {
  if (!db) return { drive: 0, errors: 0 };
  const spaces = await db.select({
    id: schema.workspaces.id, tok: schema.workspaces.driveRefreshToken, fid: schema.workspaces.driveFolderId,
  }).from(schema.workspaces);

  let drive = 0, errors = 0;
  const storage = storageFromEnv();
  for (const w of spaces) {
    const rt = decryptSecret(w.tok);
    if (!rt || !w.fid) continue;
    try {
      const res = await syncDriveAssets({
        existingDriveIds: async () => {
          const rows = await db!.select({ id: schema.assets.externalId }).from(schema.assets)
            .where(and(eq(schema.assets.workspaceId, w.id), eq(schema.assets.source, 'drive')));
          return new Set(rows.map((r) => r.id).filter((x): x is string => !!x));
        },
        insertAsset: async (a) => { await db!.insert(schema.assets).values({ workspaceId: w.id, brandId: null, uploaderUserId: null, ...a }); },
      }, { storage, refreshToken: rt, folderId: w.fid, workspaceId: w.id, maxFiles: 100 });
      await db.update(schema.workspaces).set({ driveSyncedAt: new Date() }).where(eq(schema.workspaces.id, w.id));
      drive += res.added;
    } catch (e) { errors++; console.error('[sync] drive', w.id, (e as Error).message); }
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
