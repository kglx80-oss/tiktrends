import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

/**
 * Les couleurs de la fiche d'une marque (`brands.colors`) · LECTURE seule,
 * bornée à l'espace de la session et à une marque de sa portée (l'appelant
 * passe la marque active déjà vérifiée). Lot 8 · pastilles de l'étape Style.
 */
export async function couleursDeLaMarque(workspaceId: string, brandId: string): Promise<string[]> {
  if (!db) return [];
  const [b] = await db.select({ colors: schema.brands.colors }).from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, workspaceId))).limit(1);
  return b?.colors ?? [];
}
