import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { ordonnerPersonas, personaDuTest, type AttributionPersona, type PersonaRef } from '@tiktrends/core';

/**
 * Lot 9 V5 · les personas d'une marque et le persona de CHAQUE test, en
 * LECTURE SEULE et dans la portée (espace ET marque) · aucune écriture.
 *
 * Une seule table (`personas`). Deux liens LUS, jamais recopiés (la règle qui
 * les compose, sans fusion, est au noyau · `personaDuTest`) :
 *  · la carte · ad → concept → angle → désir → persona (même jointure que
 *    `chargerLots`, bornée à la marque par `personas.brand_id`) ;
 *  · le brief · lien variante ↔ ad (`studio_test_links`, borné à l'espace et à
 *    la marque) → variante → version de projet → `brief.personaRef.id`, relu
 *    contre les personas de la marque (un persona retiré, ou d'ailleurs, ne
 *    compte pas · son nom figé dans le brief n'est jamais repris).
 */

export interface PersonaDeMarque extends PersonaRef {
  rang: number | null;
  segment: string | null;
  statut: string;
}

export interface PersonasEtTests {
  /** Les personas de la marque, dans l'ordre du noyau (`ordonnerPersonas`). */
  personas: PersonaDeMarque[];
  /** Le persona de chaque ad de la marque · une ad absente n'a ni carte ni brief lisible. */
  parAd: Map<string, AttributionPersona>;
}

export async function personasEtTests(workspaceId: string, brandId: string): Promise<PersonasEtTests> {
  if (!db) return { personas: [], parAd: new Map() };
  const TL = schema.studioTestLinks, VA = schema.studioVariants, V = schema.studioProjectVersions;
  const [lignes, cartes, briefs] = await Promise.all([
    db.select({ id: schema.personas.id, nom: schema.personas.name, rang: schema.personas.rank, segment: schema.personas.segment, statut: schema.personas.status })
      .from(schema.personas).innerJoin(schema.brands, eq(schema.brands.id, schema.personas.brandId))
      .where(and(eq(schema.personas.brandId, brandId), eq(schema.brands.workspaceId, workspaceId))),
    db.select({ adId: schema.ads.id, id: schema.personas.id, nom: schema.personas.name })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId))),
    db.select({ adId: TL.adsmapAdId, personaId: sql<string | null>`${V.content} -> 'brief' -> 'personaRef' ->> 'id'` })
      .from(TL)
      .innerJoin(VA, and(eq(VA.id, TL.variantId), eq(VA.workspaceId, TL.workspaceId), eq(VA.brandId, TL.brandId)))
      .innerJoin(V, and(eq(V.id, VA.projectVersionId), eq(V.workspaceId, VA.workspaceId), eq(V.brandId, VA.brandId)))
      .where(and(eq(TL.workspaceId, workspaceId), eq(TL.brandId, brandId))),
  ]);
  const personas = ordonnerPersonas(lignes);
  const parId = new Map(personas.map((p) => [p.id, { id: p.id, nom: p.nom }]));
  const brief = new Map(briefs.map((b) => [b.adId, b.personaId ? parId.get(b.personaId) ?? null : null]));
  const parAd = new Map<string, AttributionPersona>();
  for (const c of cartes) parAd.set(c.adId, personaDuTest({ carte: { id: c.id, nom: c.nom }, brief: brief.get(c.adId) ?? null }));
  return { personas, parAd };
}
