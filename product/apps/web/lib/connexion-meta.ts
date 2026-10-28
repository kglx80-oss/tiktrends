import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { MetaAdsInsights } from '@tiktrends/integrations';
import type { EntreeConnexionMeta } from '@tiktrends/core';

/**
 * LA lecture de la connexion Meta d'une marque · la même requête pour chaque
 * écran qui en parle (Accueil · Reporting Meta, vue Analytics, Radar créatif).
 * Trois requêtes différentes, trois colonnes différentes, trois verdicts
 * contradictoires (planche de banc v4) · désormais une seule source, et une
 * seule règle (`etatConnexionMeta`, noyau) pour en tirer l'état et son libellé.
 *
 * La fraîcheur est celle du CONNECTEUR Meta · `meta_synced_at` (KPI du compte)
 * et `adsmap_synced_at` (mesure par annonce), jamais l'horodatage partagé
 * `insights_synced_at` qu'une synchro Shopify remet à l'instant (N09).
 */
export interface ConnexionMetaLue {
  entree: EntreeConnexionMeta;
  /** Les KPI de compte stockés (`ads_insights_json`), tels quels. */
  insights: MetaAdsInsights | null;
}

export async function lireConnexionMeta(brandId: string, workspaceId: string): Promise<ConnexionMetaLue | null> {
  if (!db) return null;
  const [b] = await db.select({
    ads: schema.brands.adsInsights, token: schema.brands.metaToken, compte: schema.brands.metaAdAccountId,
    comptes: schema.brands.metaAdAccounts, syncedAt: schema.brands.metaSyncedAt, mesuresLe: schema.brands.adsmapSyncedAt,
  }).from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, workspaceId))).limit(1);
  if (!b) return null;
  const insights = (b.ads ?? null) as MetaAdsInsights | null;
  return {
    entree: {
      jeton: !!b.token, compte: !!b.compte, comptes: Array.isArray(b.comptes) ? (b.comptes as unknown[]).length : 0,
      kpiLe: (b.syncedAt as Date | null) ?? null, mesuresLe: (b.mesuresLe as Date | null) ?? null, kpiPresents: !!insights,
    },
    insights,
  };
}
