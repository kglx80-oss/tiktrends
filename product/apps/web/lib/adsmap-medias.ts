import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { vignetteAdAffichee, type AdressesAdAdsmap } from '@tiktrends/core';
import { cleObjetStockage } from './brand-media-url';

/**
 * Les médias d'une ad Adsmap tels que les ÉCRANS les reçoivent · lecture seule.
 *
 * La règle vit dans le noyau (`vignetteAdAffichee`, `lienAdAffiche`) · ici, les
 * colonnes lues, LA jointure ad → créa et le juge « objet du stockage »
 * (`cleObjetStockage`). Un objet privé passe par `/api/adsmap/[id]/apercu`
 * (session, garde Adsmap, marque active, objet de l'espace, 302 signée
 * éphémère) · jamais par son adresse brute. Ce qui part au MODÈLE (l'analyse
 * « Décrire les créas », la mémoire de Jarvis) lit la créa par la MÊME jointure
 * bornée · recensé par `analyse-crea-marque-db.test.tsx`.
 */

export const estObjetStockage = (url: string): boolean => cleObjetStockage(url) !== null;

/**
 * LA jointure ad → créa · la créa de l'ad (`creatives.id = ads.creative_id`),
 * et seulement si elle appartient à la marque lue. Une créa d'une autre marque
 * collée sur l'ad n'est jamais lue · ni sa miniature brute, ni la route gardée
 * qui la nommerait, ni sa transcription, son OCR ou son accroche envoyées au
 * modèle. Les écrans, la route `/api/adsmap/[id]/apercu`, l'analyse et la
 * mémoire de Jarvis la partagent · c'est la SEULE jointure ad → créa du code
 * serveur (recensée par motif). 1→1 · elle ne multiplie pas un `count(ads)`.
 */
export function jointureCreaDeLaMarque(brandId: string) {
  return and(eq(schema.creatives.id, schema.ads.creativeId), eq(schema.creatives.brandId, brandId));
}

/** La vignette d'une ad, prête pour `<img src>` · route gardée, image externe telle quelle, ou `null`. */
export function vignetteAd(adId: string, a: AdressesAdAdsmap): string | null {
  return vignetteAdAffichee(adId, a, estObjetStockage);
}

/**
 * Par lot · les variantes CANDIDATES à la vignette (une adresse web parmi la
 * miniature et le fichier de leur créa · jointe par `jointureCreaDeLaMarque` ·
 * ou leur « Lien de l'Ad »), dans l'ordre de leur identifiant. Le choix final
 * applique la règle du noyau (`vignetteDuLot`) · une variante qui n'a qu'une
 * page de partage (Drive…) laisse la place à la suivante.
 */
export const adsVignettesDuLot = sql<string[] | null>`(array_agg(${schema.ads.id}::text order by ${schema.ads.id}) filter (where ${schema.creatives.thumbUrl} ~* '^https?://' or ${schema.creatives.storageUrl} ~* '^https?://' or ${schema.ads.assetUrl} ~* '^https?://'))`;

/** La vignette d'un lot · celle de la première candidate qui en a une (`vignettesDesAds`), sinon `null`. */
export function vignetteDuLot(candidates: readonly string[] | null, vignettes: ReadonlyMap<string, string | null>): string | null {
  for (const id of candidates ?? []) {
    const v = vignettes.get(id);
    if (v) return v;
  }
  return null;
}

/** Les vignettes d'ads de l'espace et de la marque, par identifiant · une seule requête, bornée par la liste reçue. */
export async function vignettesDesAds(workspaceId: string, brandId: string, adIds: ReadonlyArray<string | null | undefined>): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(adIds.filter((x): x is string => !!x))];
  if (!db || ids.length === 0) return out;
  const lignes = await db.select({ id: schema.ads.id, lien: schema.ads.assetUrl, miniature: schema.creatives.thumbUrl, fichier: schema.creatives.storageUrl })
    .from(schema.ads)
    .leftJoin(schema.creatives, jointureCreaDeLaMarque(brandId))
    .where(and(eq(schema.ads.workspaceId, workspaceId), inArray(schema.ads.id, ids)));
  for (const l of lignes) out.set(l.id, vignetteAd(l.id, l));
  return out;
}
