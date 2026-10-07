import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { newMilestones, learnedSince, type StatRow } from '@tiktrends/core';

/**
 * L'historique des seuils franchis.
 *
 * ── Plus au moment de LIRE (chantier L0, BASE-03) ────────────────────────────
 *
 * L'écriture se faisait au passage, dans `jarvisStats` · ouvrir
 * `/jarvis/sources`, ou taper vingt-cinq caractères dans un Studio (préflight),
 * insérait des jalons. `reached_at` valait donc « le jour où quelqu'un a
 * regardé », et le récapitulatif hebdomadaire qui le lit (`learnedSinceFor`)
 * dépendait des visites.
 *
 * Les statistiques sont toujours dérivées à la volée, mais ce qui les fait
 * BOUGER est connu · un verdict arbitré, une ad rattachée, une synchronisation,
 * une curation. Chacune de ces commandes appelle déjà `invalidateJarvisMemory`
 * (lib/jarvis-memory.ts), qui date désormais les jalons (`daterJalons`). La
 * date d'un jalon est celle de la commande qui l'a fait franchir.
 *
 * L'insertion reste idempotente (`on conflict do nothing`) · `reached_at` est
 * la PREMIÈRE date où la dimension a franchi le seuil, et rejouer ne change rien.
 *
 * ── Ce que ça date exactement ────────────────────────────────────────────────
 *
 * Pour ce qui précède la mise en place, la date n'a aucun sens · d'où le
 * marquage « rattrapé » du premier passage, qui ne s'annonce jamais.
 */

/**
 * Enregistre les jalons nouvellement franchis · silencieux, jamais bloquant.
 * Rend le nombre de jalons proposés à l'insertion (0 quand rien n'a franchi).
 * À n'appeler que depuis une COMMANDE, jamais depuis une lecture.
 */
export async function recordMilestones(
  brandId: string, workspaceId: string, stats: StatRow[],
): Promise<number> {
  if (!db || !stats.length) return 0;
  try {
    const connus = await db.select({
      dimension: schema.statMilestones.dimension, key: schema.statMilestones.key,
    }).from(schema.statMilestones).where(eq(schema.statMilestones.brandId, brandId));

    const nouveaux = newMilestones(stats, connus);
    if (!nouveaux.length) return 0;

    await db.insert(schema.statMilestones).values(
      nouveaux.map((m) => ({
        workspaceId, brandId,
        dimension: m.dimension, key: m.key,
        nConclusive: m.nConclusive, hitRate: m.hitRate,
        backfilled: m.backfilled,
      })),
    ).onConflictDoNothing();
    return nouveaux.length;
  } catch {
    // Un historique qui n'a pas pu s'écrire ne doit jamais faire échouer la
    // commande qui l'a déclenché · il sera posé à la prochaine commande.
    return 0;
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
