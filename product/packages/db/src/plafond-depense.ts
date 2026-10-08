import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Plafond de dépense · LA réservation, commune au site et au worker.
 *
 * ── Le défaut réparé (contre-recette du 8 octobre, P1) ───────────────────────
 *
 * Ce module verrouillait déjà les réservations du WORKER, mais la barrière du
 * site (`apps/web/lib/spend-guard.ts`) lisait la somme puis insérait SANS ce
 * verrou, et le chemin Anthropic n'écrivait sa ligne qu'APRÈS l'appel. « Une
 * table commune n'est pas un verrou commun » : plafond 0,20 $, déjà 0,08 $, le
 * site et le worker autorisaient chacun 0,08 $ ⇒ 0,24 $ (reproduit sur
 * PostgreSQL réel, `apps/web/test/fa-course-mixte-pg.test.ts`).
 *
 * ── Le contrat, désormais unique ─────────────────────────────────────────────
 *
 * TOUT chemin payant (site : `sousPlafond`/`guardFixedCost`, `guardedAnthropic` ;
 * worker : `BarriereDepenseStudio`) réserve par `reserverDepense` : verrou
 * consultatif de transaction sur UNE clé (`VERROU_PLAFOND`), lecture de la
 * somme, décision, insertion, dans UNE transaction, AVANT l'appel. Puis, une
 * fois l'issue connue :
 *  · `reglerDepense` · coût réel connu (jetons lus dans la réponse) : la ligne
 *    passe de la réservation au réel, UNE fois ;
 *  · `annulerDepense` · échec CERTAIN (rien de facturé) : `actual_usd` tombe à
 *    0, UNE fois, la ligne reste (l'essai demeure lisible) ;
 *  · issue incertaine : rien, la réservation reste comptée.
 *
 * ── Les états d'une ligne ─────────────────────────────────────────────────────
 *
 *  · réservée · `actual_usd = estimated_usd`, `input_tokens` et
 *    `output_tokens` nuls (c'est ainsi que `reserverDepense` l'écrit) ;
 *  · réglée   · jetons renseignés (`reglerDepense` les écrit toujours, 0 compris) ;
 *  · rendue   · `actual_usd = 0`, jetons nuls ;
 *  · à réconcilier (R3, colonne `reconcile_reason`, migration 0055) · issue
 *    incertaine : montant inchangé (le maximum), cause écrite, plus aucune
 *    transition automatique (`marquerAReconcilier`).
 * Chaque transition part de « réservée » et seulement d'elle : rejouer un
 * règlement, régler après une annulation, annuler après un règlement ne change
 * rien (`apps/web/test/fa-reservation-commune.test.ts`).
 *
 * La règle de décision vit dans `@tiktrends/core` (`checkBudget`), mais
 * `@tiktrends/db` ne dépend pas du noyau : ce module ne DÉCIDE rien, l'appelant
 * passe `decider`. Une écriture impossible REFUSE la dépense : sans ligne, pas
 * d'appel.
 */

// Tout client drizzle Postgres (postgres-js en production, pglite en test).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BaseDepense = PgDatabase<PgQueryResultHKT, any, any>;

/** Clé du verrou consultatif partagé par TOUTES les réservations, site et worker. */
export const VERROU_PLAFOND = 7_243_100_917;

export interface LigneDepense {
  /**
   * Identifiant imposé · DÉRIVÉ du job côté worker (`idDepenseDuJob`) : une
   * ligne par job, jamais deux. Absent côté site : la base en tire un.
   */
  id?: string;
  workspaceId: string | null;
  provider: string;
  model: string | null;
  action: string;
  /** Montant réservé · coût fixe, ou coût MAXIMAL d'un appel texte. */
  usd: number;
}

export type ReservationDepense =
  | { ok: true; depenseAvantUsd: number; id: string }
  | { ok: false; raison: string; dejaEngagee: boolean };

/** Dépense de la fenêtre · la même somme que `spentUsd()` du site. */
export async function depenseDepuis(base: BaseDepense, depuis: Date): Promise<number> {
  const [r] = await base.select({ total: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)` })
    .from(schema.aiSpend).where(gte(schema.aiSpend.createdAt, depuis));
  return Number(r?.total ?? 0);
}

/**
 * Réserve une dépense AVANT l'appel payant · verrou, somme, décision, ligne,
 * dans UNE transaction. Une ligne déjà présente pour un identifiant imposé veut
 * dire qu'une soumission a déjà été engagée pour ce job : refus, la ligne
 * existante n'est pas touchée.
 */
export async function reserverDepense(
  base: BaseDepense,
  ligne: LigneDepense,
  o: { depuis: Date; decider: (depenseUsd: number) => { allowed: boolean; reason: string } },
): Promise<ReservationDepense> {
  return base.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${VERROU_PLAFOND})`);
    if (ligne.id) {
      const [deja] = await tx.select({ id: schema.aiSpend.id }).from(schema.aiSpend).where(eq(schema.aiSpend.id, ligne.id)).limit(1);
      if (deja) return { ok: false as const, raison: 'une soumission a déjà été engagée pour ce job', dejaEngagee: true };
    }
    const depense = await depenseDepuis(tx as unknown as BaseDepense, o.depuis);
    const d = o.decider(depense);
    if (!d.allowed) return { ok: false as const, raison: d.reason, dejaEngagee: false };
    const [ecrite] = await tx.insert(schema.aiSpend).values({
      ...(ligne.id ? { id: ligne.id } : {}),
      workspaceId: ligne.workspaceId, provider: ligne.provider, model: ligne.model, action: ligne.action,
      estimatedUsd: ligne.usd, actualUsd: ligne.usd,
    }).returning({ id: schema.aiSpend.id });
    if (!ecrite) throw new Error('réservation non écrite');
    return { ok: true as const, depenseAvantUsd: depense, id: ecrite.id };
  });
}

/**
 * La ligne est-elle encore à l'état « réservée » ? (seul point de départ des
 * transitions). Une ligne « à réconcilier » (R3) n'en part plus : ni règlement
 * ni libération automatiques, elle reste au maximum jusqu'au rapprochement.
 */
const reservee = () => and(
  isNull(schema.aiSpend.inputTokens), isNull(schema.aiSpend.outputTokens),
  sql`${schema.aiSpend.actualUsd} = ${schema.aiSpend.estimatedUsd}`,
  isNull(schema.aiSpend.reconcileReason),
);

/**
 * Règle une réservation au coût RÉEL, une seule fois · rend vrai si la ligne a
 * été réglée par CET appel. Rejouer le règlement, ou régler une ligne rendue,
 * ne change rien.
 */
export async function reglerDepense(
  base: BaseDepense,
  id: string,
  reel: { usd: number; inputTokens: number; outputTokens: number },
): Promise<boolean> {
  const r = await base.update(schema.aiSpend)
    .set({ actualUsd: Math.max(0, reel.usd), inputTokens: Math.max(0, Math.round(reel.inputTokens)), outputTokens: Math.max(0, Math.round(reel.outputTokens)) })
    .where(and(eq(schema.aiSpend.id, id), reservee()))
    .returning({ id: schema.aiSpend.id });
  return r.length > 0;
}

/**
 * Rend une dépense que le fournisseur n'a pas facturée · la ligne reste
 * (l'essai demeure lisible), seul `actual_usd` tombe à 0, une seule fois. Une
 * ligne déjà réglée au coût réel n'est jamais rendue. Rend vrai si la ligne a
 * été rendue par CET appel.
 */
export async function annulerDepense(base: BaseDepense, id: string): Promise<boolean> {
  const r = await base.update(schema.aiSpend).set({ actualUsd: 0 })
    .where(and(
      eq(schema.aiSpend.id, id), sql`${schema.aiSpend.actualUsd} > 0`,
      isNull(schema.aiSpend.inputTokens), isNull(schema.aiSpend.outputTokens),
      isNull(schema.aiSpend.reconcileReason),
    ))
    .returning({ id: schema.aiSpend.id });
  return r.length > 0;
}

/* ── R3 · issue incertaine : visible et réconciliable ────────────────────────── */

/**
 * Marque une réservation « à réconcilier » avec sa CAUSE (`causeIncertaine`,
 * noyau). Le montant n'est PAS touché : la ligne reste comptée au maximum
 * réservé (le côté prudent), et plus aucune transition automatique ne la
 * règle ni ne la libère (`reservee`, `annulerDepense`). Seule une ligne encore
 * réservée se marque, une fois · rend vrai si CET appel l'a marquée.
 */
export async function marquerAReconcilier(base: BaseDepense, id: string, cause: string): Promise<boolean> {
  const r = await base.update(schema.aiSpend).set({ reconcileReason: cause.slice(0, 200) })
    .where(and(eq(schema.aiSpend.id, id), reservee()))
    .returning({ id: schema.aiSpend.id });
  return r.length > 0;
}

/** Les lignes « à réconcilier » de la fenêtre, les plus récentes d'abord · lecture seule. */
export async function lireDepensesAReconcilier(base: BaseDepense, depuis: Date, limite = 200) {
  const A = schema.aiSpend;
  const rows = await base.select({
    id: A.id, createdAt: A.createdAt, provider: A.provider, model: A.model, action: A.action,
    workspaceId: A.workspaceId, estimatedUsd: A.estimatedUsd, actualUsd: A.actualUsd, cause: A.reconcileReason,
  }).from(A)
    .where(and(isNotNull(A.reconcileReason), gte(A.createdAt, depuis)))
    .orderBy(desc(A.createdAt))
    .limit(Math.max(1, Math.min(1000, Math.trunc(limite))));
  return rows.map((r) => ({ ...r, cause: r.cause ?? '', estimatedUsd: Number(r.estimatedUsd), actualUsd: Number(r.actualUsd) }));
}
