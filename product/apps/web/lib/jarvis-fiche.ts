import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { FicheMarqueLue } from '@tiktrends/core';

/**
 * La fiche marque, LUE pour la carte de complétude de l'accueil Jarvis.
 *
 * Même source que l'aperçu de `/brands/[id]` (profil + comptes de ses tables),
 * en LECTURE SEULE · aucun nouveau service, aucune écriture. `null` quand la
 * marque est illisible · la carte de complétude est alors absente plutôt que
 * d'afficher un « 0 % » qui n'a rien mesuré.
 */
export async function ficheMarqueLue(brandId: string): Promise<FicheMarqueLue | null> {
  if (!db) return null;
  const [b] = await db.select({
    description: schema.brands.description, usp: schema.brands.usp, audience: schema.brands.audience,
    category: schema.brands.category, categoryNeeds: schema.brands.categoryNeeds, tone: schema.brands.tone,
    industryTags: schema.brands.industryTags, colors: schema.brands.colors, competitors: schema.brands.competitors,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!b) return null;

  const [personas, scenarios, products] = await Promise.all([
    db.select({ id: schema.personas.id }).from(schema.personas).where(eq(schema.personas.brandId, brandId)),
    db.select({ id: schema.scenarios.id }).from(schema.scenarios).where(eq(schema.scenarios.brandId, brandId)),
    db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.brandId, brandId)),
  ]);

  return {
    description: b.description, usp: b.usp, audience: b.audience, category: b.category,
    categoryNeeds: b.categoryNeeds, tone: b.tone,
    industryTags: (b.industryTags ?? []).length, colors: (b.colors ?? []).length,
    scenarios: scenarios.length, personas: personas.length, produits: products.length,
    concurrents: (b.competitors ?? []).length,
  };
}
