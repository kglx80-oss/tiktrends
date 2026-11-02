import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { idsLiensApp, resoudreLiensApp, type AdressesAdAdsmap, type ImportPlan } from '@tiktrends/core';
import { adsDeLaMarque } from './adsmap-marque';
import { jointureCreaDeLaMarque } from './adsmap-medias';
import { appUrl } from './mailer';

/**
 * Les liens de l'application qu'un export réimporté ramène · résolus vers
 * l'adresse EN BASE du média de l'ad d'origine, ou écartés. Lecture seule.
 *
 * La règle vit dans le noyau (`resoudreLiensApp`) · ici, l'origine de
 * l'application (`appUrl()`, jamais une autre) et LA portée : une ad d'origine
 * n'est lue que si elle remonte à la marque de l'import par son graphe
 * (`adsDeLaMarque`, la portée de `listAdsAction` et de la route gardée) et
 * qu'elle est de l'espace de l'import ; sa créa, seulement si elle est de la
 * même marque (`jointureCreaDeLaMarque`). Hors de portée · absente des sources,
 * donc écartée.
 */
export async function resoudreLiensDuPlan(plan: ImportPlan, workspaceId: string, brandId: string): Promise<ImportPlan> {
  const origine = appUrl();
  const ids = idsLiensApp(plan, origine);
  const sources = new Map<string, AdressesAdAdsmap>();
  if (ids.length && db) {
    const dansLaMarque = [...(await adsDeLaMarque(workspaceId, brandId, ids)).keys()];
    if (dansLaMarque.length) {
      const lignes = await db.select({ id: schema.ads.id, lien: schema.ads.assetUrl, brief: schema.ads.briefUrl, miniature: schema.creatives.thumbUrl, fichier: schema.creatives.storageUrl })
        .from(schema.ads)
        .leftJoin(schema.creatives, jointureCreaDeLaMarque(brandId))
        .where(and(eq(schema.ads.workspaceId, workspaceId), inArray(schema.ads.id, dansLaMarque)));
      for (const { id, ...adresses } of lignes) sources.set(id.toLowerCase(), adresses);
    }
  }
  return resoudreLiensApp(plan, origine, sources);
}
