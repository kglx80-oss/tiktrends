import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { ordonnerPersonas, type ReferenceAdsmap } from '@tiktrends/core';
import type { ContexteStudio } from './garde';

/**
 * Les personas Adsmap d'une marque, en LECTURE SEULE et DANS LA PORTÉE · pour
 * le sélecteur « Pour qui ? » de l'assistant V5 (décision Kevin · optionnel,
 * jamais bloquant).
 *
 * Une référence de brief est un INSTANTANÉ {id, label} : on renvoie l'id de la
 * ligne `personas` et son nom figé au moment du choix. La portée est garantie
 * par le filtre `brand_id IN <marques visibles>` ET `workspace_id` de la marque,
 * comme le reste des Studios · une marque hors portée ne rend aucun persona,
 * indistinct de « n'en a pas ».
 *
 * Aucune écriture. Les personas rejetés/archivés sont exclus · un persona
 * proposé ou validé peut être cité (le brief ne gate pas sur la validation).
 *
 * Lot 9 V5 · l'ordre est celui de la marque (`ordonnerPersonas` · rang, puis
 * nom), le même que la fiche Personas.
 */
export async function personasDeLaMarque(ctx: ContexteStudio, brandId: string): Promise<ReferenceAdsmap[]> {
  if (!db || !ctx.marques.includes(brandId)) return [];
  const rows = await db
    .select({ id: schema.personas.id, name: schema.personas.name, status: schema.personas.status, rank: schema.personas.rank })
    .from(schema.personas)
    .innerJoin(schema.brands, eq(schema.personas.brandId, schema.brands.id))
    .where(and(
      eq(schema.personas.brandId, brandId),
      inArray(schema.personas.brandId, ctx.marques),
      eq(schema.brands.workspaceId, ctx.workspaceId),
    ));
  return ordonnerPersonas(rows.map((r) => ({ ...r, rang: r.rank, nom: r.name })))
    .filter((r) => r.status !== 'rejected' && r.status !== 'archived')
    .map((r) => ({ id: r.id, label: r.name }));
}
