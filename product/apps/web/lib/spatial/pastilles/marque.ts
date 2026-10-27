import 'server-only';
import { and, count, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { completudeFicheMarque, pastilleConfigurationMarque, type EtatConfigurationMarque } from '@tiktrends/core';
import { getSession } from '../../auth';

/**
 * La pastille du rail Marque (`.rbadge`, « N étapes à compléter ») et l'état de
 * configuration qu'elle compte · les MÊMES huit étapes que la carte « Finis de
 * configurer » de la fiche (noyau `etapesConfigurationMarque`), lues en base.
 * Le chiffre du rail ne peut donc pas contredire celui de l'écran.
 */

/** Lit l'état de configuration d'une marque · `null` si elle n'est pas dans l'espace. */
export async function etatConfigurationMarque(workspaceId: string, brandId: string): Promise<EtatConfigurationMarque | null> {
  if (!db) return null;
  const [b] = await db.select({
    description: schema.brands.description, usp: schema.brands.usp, audience: schema.brands.audience, category: schema.brands.category,
    categoryNeeds: schema.brands.categoryNeeds, tone: schema.brands.tone, industryTags: schema.brands.industryTags, colors: schema.brands.colors,
    competitors: schema.brands.competitors, metaToken: schema.brands.metaToken,
  }).from(schema.brands).where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, workspaceId))).limit(1);
  if (!b) return null;
  const n = (r: Array<{ n: number }>) => Number(r[0]?.n ?? 0);
  const [personas, scenarios, produits, suivis, sauvegardes, lots, membres, invitations] = await Promise.all([
    db.select({ n: count() }).from(schema.personas).where(eq(schema.personas.brandId, brandId)),
    db.select({ n: count() }).from(schema.scenarios).where(eq(schema.scenarios.brandId, brandId)),
    db.select({ n: count() }).from(schema.products).where(eq(schema.products.brandId, brandId)),
    db.select({ n: count() }).from(schema.followedBrands).where(and(eq(schema.followedBrands.workspaceId, workspaceId), eq(schema.followedBrands.brandId, brandId))),
    db.select({ n: count() }).from(schema.savedAds).where(and(eq(schema.savedAds.workspaceId, workspaceId), eq(schema.savedAds.brandId, brandId))),
    db.select({ n: count() }).from(schema.batches).where(and(eq(schema.batches.workspaceId, workspaceId), eq(schema.batches.brandId, brandId), isNotNull(schema.batches.launchedAt))),
    db.select({ n: count() }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId)),
    db.select({ n: count() }).from(schema.invites).where(and(eq(schema.invites.workspaceId, workspaceId), eq(schema.invites.status, 'pending'))),
  ]);
  const { manques } = completudeFicheMarque({
    description: b.description, usp: b.usp, audience: b.audience, category: b.category, categoryNeeds: b.categoryNeeds, tone: b.tone,
    industryTags: (b.industryTags ?? []).length, colors: (b.colors ?? []).length,
    scenarios: n(scenarios), personas: n(personas), produits: n(produits), concurrents: (b.competitors ?? []).length,
  });
  return {
    manquesFiche: manques.length, metaConnecte: !!b.metaToken,
    concurrentsSuivis: n(suivis), concurrentsRenseignes: (b.competitors ?? []).length,
    sauvegardes: n(sauvegardes), lotsLances: n(lots), personnes: n(membres) + n(invitations),
  };
}

/**
 * La pastille du rail pour la marque `brandId` · `null` sans session, hors de
 * l'espace de la session, ou quand toutes les étapes sont faites.
 */
export async function pastilleMarque(brandId: string): Promise<{ classe: 'rbadge'; valeur: string; libelle: string } | null> {
  const s = await getSession();
  if (!s) return null;
  const e = await etatConfigurationMarque(s.workspaceId, brandId);
  return e ? pastilleConfigurationMarque(e, brandId) : null;
}
