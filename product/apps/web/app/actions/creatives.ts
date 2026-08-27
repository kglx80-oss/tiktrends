'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';

/** Note de pertinence (feedback humain) : signal d'entraînement pour Jarvis. */
export type Rating = 'up' | 'down' | null;

/** Une créa (pub/image/vidéo) peut porter un id composite « genId:url » (images) : on isole la génération. */
function genIdOf(id: string): string {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(0, i);
}

async function ownedGeneration(id: string) {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' as const };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Aucune marque active.' as const };
  const gid = genIdOf(id);
  const [g] = await db.select({ id: schema.generations.id, input: schema.generations.input })
    .from(schema.generations)
    .where(and(eq(schema.generations.id, gid), eq(schema.generations.brandId, brand.id))).limit(1);
  if (!g) return { error: 'Créa introuvable.' as const };
  return { gid: g.id, input: (g.input ?? {}) as Record<string, unknown> };
}

/**
 * Enregistre la note de pertinence d'une créa (👍 pertinent / 👎 pas pertinent).
 * Stockée sur la génération : alimente le jeu de données d'apprentissage de Jarvis
 * (ce qui plaît / ne plaît pas, par marque).
 */
export async function rateCreativeAction(input: { id: string; rating: Rating }): Promise<{ ok?: true; error?: string }> {
  const g = await ownedGeneration(input.id);
  if ('error' in g) return { error: g.error };
  const next = { ...g.input, rating: input.rating ?? undefined, ratedAt: input.rating ? new Date().toISOString() : undefined };
  await db!.update(schema.generations).set({ input: next }).where(eq(schema.generations.id, g.gid));
  return { ok: true };
}

/** Archive (ou restaure) n'importe quelle créa (pub/image/vidéo) par id de génération. */
export async function archiveCreativeAction(input: { id: string; archived?: boolean }): Promise<{ ok?: true; error?: string }> {
  const g = await ownedGeneration(input.id);
  if ('error' in g) return { error: g.error };
  await db!.update(schema.generations)
    .set({ status: input.archived === false ? 'completed' : 'archived' })
    .where(eq(schema.generations.id, g.gid));
  return { ok: true };
}
