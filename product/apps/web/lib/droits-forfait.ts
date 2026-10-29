import 'server-only';
import { count, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { forfaitDesDroits, refusCloneVideo, refusNouvelleMarque, tarifsV2Actifs, type CleForfait } from '@tiktrends/core';

/**
 * Droits échelonnés par forfait (décision du 29/10, point 6) · appliqués côté
 * SERVEUR, au moment du geste, par les règles pures du noyau (`offre/droits.ts`).
 *
 * Un forfait actuel (Starter, Core, Plus, Business) n'a aucune limite · ses
 * droits d'aujourd'hui restent jusqu'à l'échéance (point 5). Les limites ne
 * s'appliquent qu'à un forfait V2 ET sous l'interrupteur `TARIFS_V2` · sans lui,
 * un forfait V2 se lit comme le forfait actuel qu'il remplace (`forfaitDesDroits`).
 */
export function forfaitEffectif(plan: string | null | undefined): CleForfait {
  return forfaitDesDroits(plan, tarifsV2Actifs(process.env));
}

/** Refus de créer une marque de plus dans l'espace · `null` = autorisé. */
export async function refusMarqueEspace(workspaceId: string, plan: string | null | undefined): Promise<string | null> {
  if (!db) return null;
  const [r] = await db.select({ n: count() }).from(schema.brands).where(eq(schema.brands.workspaceId, workspaceId));
  return refusNouvelleMarque(forfaitEffectif(plan), Number(r?.n ?? 0));
}

/** Le forfait de l'espace, relu en base (une action studio n'a que le contexte, pas la session). */
export async function forfaitEffectifEspace(workspaceId: string): Promise<CleForfait> {
  if (!db) return forfaitEffectif(null);
  const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  return forfaitEffectif(w?.plan ?? null);
}

/** Refus du clone d'une pub en VIDÉO pour l'espace · `null` = autorisé. */
export async function refusCloneVideoEspace(workspaceId: string): Promise<string | null> {
  return refusCloneVideo(await forfaitEffectifEspace(workspaceId));
}
