import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { mediasRetenusBrief } from '@tiktrends/core';

/**
 * Lot 12 V5 (PC A21) · les médias de la Bibliothèque proposés au brief par
 * l'adresse de l'assistant (`?media=`) · chacun relu dans l'ESPACE de la
 * session (jamais pris du navigateur), puis jugé pour la MARQUE ACTIVE par la
 * règle du versement (`mediasRetenusBrief` → `refusFichiersVersement` ·
 * corbeille, pas une image, autre marque, droits). Lecture seule · rien n'est
 * versé ici, le versement passe par `verserSelectionDansProjet` à « Continuer ».
 */
export async function relireMediasBrief(workspaceId: string, ids: readonly string[], brandActive: string | null): Promise<Array<{ id: string; nom: string }>> {
  if (!db || !ids.length || !brandActive) return [];
  const A = schema.assets;
  const lignes = await db.select({ id: A.id, name: A.name, kind: A.kind, brandId: A.brandId, rights: A.rights, deletedAt: A.deletedAt })
    .from(A).where(and(eq(A.workspaceId, workspaceId), inArray(A.id, [...ids])));
  return mediasRetenusBrief(lignes.map((l) => ({ ...l, supprime: l.deletedAt !== null })), ids, brandActive);
}
