import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { newMilestones, learnedSince, type StatRow } from '@tiktrends/core';

/**
 * L'historique des seuils franchis.
 *
 * ── Pourquoi l'écriture se fait au moment de LIRE ────────────────────────────
 *
 * Il n'existe aucun instant où « les statistiques d'une marque sont
 * recalculées » : elles sont dérivées à la volée depuis les ads, à chaque fois
 * qu'on en a besoin. Attendre un travail de fond qui n'existe pas aurait donné
 * une table vide · exactement ce qu'était `adsmap_brand_stats`, lue par le
 * radar et jamais écrite par personne.
 *
 * On enregistre donc au passage, et sans jamais bloquer : l'insertion est
 * idempotente (`on conflict do nothing`), donc `reached_at` reste la PREMIÈRE
 * date où l'on a vu la dimension franchir le seuil.
 *
 * ── Ce que ça date exactement ────────────────────────────────────────────────
 *
 * Le jour où on l'a VU, pas le jour où le test a tranché. Pour tout ce qui
 * arrive après la mise en place, les deux se confondent (la mémoire est lue
 * plusieurs fois par jour). Pour ce qui précède, ça n'a aucun sens · d'où le
 * marquage « rattrapé » du premier passage, qui ne s'annonce jamais.
 */

/** Enregistre les jalons nouvellement franchis · silencieux, jamais bloquant. */
export async function recordMilestones(
  brandId: string, workspaceId: string, stats: StatRow[],
): Promise<void> {
  if (!db || !stats.length) return;
  try {
    const connus = await db.select({
      dimension: schema.statMilestones.dimension, key: schema.statMilestones.key,
    }).from(schema.statMilestones).where(eq(schema.statMilestones.brandId, brandId));

    const nouveaux = newMilestones(stats, connus);
    if (!nouveaux.length) return;

    await db.insert(schema.statMilestones).values(
      nouveaux.map((m) => ({
        workspaceId, brandId,
        dimension: m.dimension, key: m.key,
        nConclusive: m.nConclusive, hitRate: m.hitRate,
        backfilled: m.backfilled,
      })),
    ).onConflictDoNothing();
  } catch {
    // Un historique qui n'a pas pu s'écrire ne doit jamais faire échouer la
    // lecture qui l'a déclenché · au pire, le jalon sera posé au prochain
    // passage, quelques heures plus tard.
  }
}

/** Ce que la mémoire a appris depuis `depuis` · vide quand rien n'a tranché. */
export async function learnedSinceFor(brandId: string, depuis: Date): Promise<string[]> {
  if (!db) return [];
  try {
    const rows = await db.select({
      dimension: schema.statMilestones.dimension, key: schema.statMilestones.key,
      nConclusive: schema.statMilestones.nConclusive, hitRate: schema.statMilestones.hitRate,
      backfilled: schema.statMilestones.backfilled, reachedAt: schema.statMilestones.reachedAt,
    })
      .from(schema.statMilestones)
      .where(and(eq(schema.statMilestones.brandId, brandId), gte(schema.statMilestones.reachedAt, depuis)))
      .limit(40);

    return learnedSince(rows.map((r) => ({ ...r, reachedAt: r.reachedAt as Date })), depuis);
  } catch {
    return [];
  }
}

/**
 * Les voies déjà testées · celles dont l'effectif a franchi le seuil.
 *
 * ── Le bug que ça répare ─────────────────────────────────────────────────────
 *
 * Le radar lisait `adsmap_brand_stats` pour savoir ce que la marque avait déjà
 * testé. **Cette table n'est écrite nulle part.** L'ensemble revenait donc
 * toujours vide, et TOUTE trouvaille était annoncée comme « une voie que tu
 * n'as jamais testée » · une phrase toujours vraie, donc sans valeur.
 *
 * Les jalons, eux, sont écrits. Et ils disent exactement la même chose : une
 * dimension a un jalon si et seulement si elle a franchi le seuil.
 */
export async function testedKeys(brandId: string): Promise<Set<string>> {
  if (!db) return new Set();
  try {
    const rows = await db.select({ key: schema.statMilestones.key })
      .from(schema.statMilestones).where(eq(schema.statMilestones.brandId, brandId));
    return new Set(rows.map((r) => r.key));
  } catch {
    return new Set();
  }
}
