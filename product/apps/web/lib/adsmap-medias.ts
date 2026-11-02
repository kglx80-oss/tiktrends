import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { vignetteAdAffichee, type AdressesAdAdsmap } from '@tiktrends/core';
import { cleObjetStockage } from './brand-media-url';

/**
 * Les médias d'une ad Adsmap tels que les ÉCRANS les reçoivent · lecture seule.
 *
 * La règle vit dans le noyau (`vignetteAdAffichee`, `lienAdAffiche`) · ici, les
 * colonnes lues et le juge « objet du stockage » (`cleObjetStockage`). Un objet
 * privé passe par `/api/adsmap/[id]/apercu` (session, garde Adsmap, marque
 * active, objet de l'espace, 302 signée éphémère) · jamais par son adresse brute.
 * Ce qui part au MODÈLE ne passe pas ici (`adsmap-analyze.ts`, gardé à part).
 */

export const estObjetStockage = (url: string): boolean => cleObjetStockage(url) !== null;

/** La vignette d'une ad, prête pour `<img src>` · route gardée, image externe telle quelle, ou `null`. */
export function vignetteAd(adId: string, a: AdressesAdAdsmap): string | null {
  return vignetteAdAffichee(adId, a, estObjetStockage);
}

/**
 * Par lot · UNE variante qui porte une adresse web (miniature ou fichier de sa
 * créa, ou son « Lien de l'Ad »), choisie de façon déterministe (plus petit
 * identifiant). À grouper par lot, ads et créas jointes (`creatives.id =
 * ads.creative_id`, 1→1 · le `count(ads)` n'est pas multiplié).
 */
export const adVignetteDuLot = sql<string | null>`(array_agg(${schema.ads.id} order by ${schema.ads.id}) filter (where ${schema.creatives.thumbUrl} ~* '^https?://' or ${schema.creatives.storageUrl} ~* '^https?://' or ${schema.ads.assetUrl} ~* '^https?://'))[1]`;

/** Les vignettes d'ads de l'espace, par identifiant · une seule requête, bornée par la liste reçue. */
export async function vignettesDesAds(workspaceId: string, adIds: ReadonlyArray<string | null>): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(adIds.filter((x): x is string => !!x))];
  if (!db || ids.length === 0) return out;
  const lignes = await db.select({ id: schema.ads.id, lien: schema.ads.assetUrl, miniature: schema.creatives.thumbUrl, fichier: schema.creatives.storageUrl })
    .from(schema.ads)
    .leftJoin(schema.creatives, eq(schema.creatives.id, schema.ads.creativeId))
    .where(and(eq(schema.ads.workspaceId, workspaceId), inArray(schema.ads.id, ids)));
  for (const l of lignes) out.set(l.id, vignetteAd(l.id, l));
  return out;
}
