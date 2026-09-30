import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

/**
 * Les ads Adsmap qui appartiennent VRAIMENT à une marque · lecture seule.
 *
 * Une ad n'a pas de colonne marque · elle y est rattachée par son graphe
 * (concept → angle → désir → persona → marque). La carte du Studio et le lien
 * profond d'Adsmap passent tous deux par ici · un identifiant d'ad qui ne
 * remonte pas à la marque active est traité comme introuvable, jamais affiché
 * sous le nom d'une autre marque.
 */
export async function adsDeLaMarque(workspaceId: string, brandId: string, adIds: readonly string[]): Promise<Map<string, { status: string; launchedAt: Date | null }>> {
  const out = new Map<string, { status: string; launchedAt: Date | null }>();
  if (!db || adIds.length === 0) return out;
  const rows = await db.select({ id: schema.ads.id, status: schema.ads.status, launchedAt: schema.ads.launchedAt })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .where(and(
      inArray(schema.ads.id, [...adIds]),
      eq(schema.ads.workspaceId, workspaceId),
      eq(schema.personas.brandId, brandId),
    ));
  for (const r of rows) out.set(r.id, { status: r.status, launchedAt: r.launchedAt });
  return out;
}
