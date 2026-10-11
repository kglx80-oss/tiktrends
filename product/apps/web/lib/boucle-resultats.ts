import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { compterLots, type CompteBoucle } from '@tiktrends/core';

/**
 * Les comptes de la boucle Résultats pour la marque active · LECTURE SEULE
 * (UX V2 · lot 4a). Deux requêtes d'agrégat, aucune écriture, aucun appel externe.
 *
 * Les ads n'ont pas de colonne marque · elles s'y rattachent par le graphe
 * (concept → angle → désir → persona → marque), comme dans `listAdsAction` et
 * `adsDeLaMarque` · un test d'une autre marque n'est jamais compté ici.
 *
 * `null` sans base · l'écran n'affiche alors pas de parcours plutôt qu'un
 * parcours à zéro qui se lirait « rien n'a été fait ».
 */
export async function compterBoucle(p: {
  workspaceId: string; brandId: string;
  lots: Array<{ status: string; launchedAt: string | null }>;
  derniereMesure: string | null;
}): Promise<CompteBoucle | null> {
  if (!db) return null;
  const [ads, appris] = await Promise.all([
    db.select({
      tests: sql<number>`count(${schema.ads.id})`,
      avecHypothese: sql<number>`count(*) filter (where nullif(btrim(${schema.ads.hypothesis}), '') is not null)`,
      mesures: sql<number>`count(*) filter (where ${schema.verdicts.computed} is not null)`,
      aArbitrer: sql<number>`count(*) filter (where ${schema.verdicts.computed} is not null and ${schema.verdicts.status} = 'computed')`,
      arbitres: sql<number>`count(*) filter (where ${schema.verdicts.status} = 'validated')`,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(eq(schema.ads.workspaceId, p.workspaceId), eq(schema.personas.brandId, p.brandId))),
    db.select({ n: sql<number>`count(*)` })
      .from(schema.learnings)
      .where(and(eq(schema.learnings.workspaceId, p.workspaceId), eq(schema.learnings.brandId, p.brandId), eq(schema.learnings.status, 'validated'))),
  ]);
  const a = ads[0];
  return {
    tests: Number(a?.tests ?? 0),
    avecHypothese: Number(a?.avecHypothese ?? 0),
    ...compterLots(p.lots),
    mesures: Number(a?.mesures ?? 0),
    aArbitrer: Number(a?.aArbitrer ?? 0),
    arbitres: Number(a?.arbitres ?? 0),
    apprentissages: Number(appris[0]?.n ?? 0),
    derniereMesure: p.derniereMesure,
  };
}
