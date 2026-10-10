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
 *    transition automatique (`marquerAReconcilier`) ;
 *  · réconciliée (R5, table `ai_spend_reconciliations`, migration 0056) · un
 *    humain a rapproché la ligne de la facture : la ligne ne change PAS
 *    (montant réservé et cause gardés), une réconciliation s'AJOUTE, et le
 *    plafond retient son montant facturé (`montantRetenuSql`,
 *    `depenseDepuis`, `reconcilierDepense`).
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

/**
 * Montant RETENU par le plafond pour une ligne `ai_spend` · R5 : le montant
 * FACTURÉ de sa réconciliation quand elle en a une (`ai_spend_reconciliations`,
 * jointure à gauche requise), sinon `actual_usd`. La ligne elle-même n'est
 * jamais réécrite : elle garde le montant réservé, l'historique reste lisible.
 */
export const montantRetenuSql = () => sql<number>`case when ${schema.aiSpendReconciliations.id} is null then ${schema.aiSpend.actualUsd} else ${schema.aiSpendReconciliations.billedMicros}::double precision / 1000000 end`;

/**
 * Dépense de la fenêtre · la somme que le plafond compare (site, worker,
 * écran). Une ligne réconciliée compte pour son montant facturé (R5).
 */
export async function depenseDepuis(base: BaseDepense, depuis: Date): Promise<number> {
  const [r] = await base.select({ total: sql<number>`coalesce(sum(${montantRetenuSql()}), 0)` })
    .from(schema.aiSpend)
    .leftJoin(schema.aiSpendReconciliations, eq(schema.aiSpendReconciliations.aiSpendId, schema.aiSpend.id))
    .where(gte(schema.aiSpend.createdAt, depuis));
  return Number(r?.total ?? 0);
}

/**
 * Budget d'ESSAI d'un espace · plafond CUMULÉ (sans fenêtre glissante) posé
 * par la plateforme sur un espace pilote, en plus du plafond global
 * `AI_SPEND_CAP_USD` qu'il ne remplace pas. Mandat du 10/10 : « 15 $ cumulés
 * pour l'ensemble des tests, dépenses précédentes et relances comprises, sans
 * recharge ; vérifier le montant restant avant chaque appel ». Toute dépense
 * de l'espace depuis `depuis` compte (Studios ET outils historiques, relances
 * et réservations incertaines au maximum) : c'est le côté prudent.
 *
 * Stocké dans `app_settings` (aucune migration), clé `budget_essai:<espace>`,
 * valeur `{ plafondUsd, depuis, motif, par, le }`. Lu par `reserverDepense`
 * SOUS LE VERROU commun : aucun chemin payant (site ou worker) ne l'évite.
 */
export const PREFIXE_CLE_BUDGET_ESSAI = 'budget_essai:';
export const cleBudgetEssai = (workspaceId: string) => `${PREFIXE_CLE_BUDGET_ESSAI}${workspaceId}`;

export interface BudgetEssai { plafondUsd: number; depuis: Date; motif: string; par: string | null; le: string | null }

/** Valeur stockée → budget lisible, ou `null` (absente ou illisible : aucun budget d'espace). */
export function lireBudgetEssai(brut: unknown): BudgetEssai | null {
  const o = brut as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const plafond = Number(o.plafondUsd);
  const depuis = typeof o.depuis === 'string' ? new Date(o.depuis) : null;
  if (!Number.isFinite(plafond) || plafond < 0 || !depuis || Number.isNaN(depuis.getTime())) return null;
  return { plafondUsd: plafond, depuis, motif: typeof o.motif === 'string' ? o.motif : '', par: typeof o.par === 'string' ? o.par : null, le: typeof o.le === 'string' ? o.le : null };
}

/**
 * La règle, pure · refus si la dépense déjà engagée PLUS cet appel dépasse le
 * plafond. À 1/10 000 de dollar près (arrondi des micro-dollars).
 */
export function decisionBudgetEssai(engageUsd: number, appelUsd: number, plafondUsd: number): { allowed: boolean; reason: string; restantUsd: number } {
  const restant = Math.max(0, plafondUsd - engageUsd);
  if (engageUsd + appelUsd > plafondUsd + 1e-4) {
    return { allowed: false, restantUsd: restant, reason: `budget d’essai de l’espace atteint · ${engageUsd.toFixed(2)} $ engagés sur ${plafondUsd.toFixed(2)} $, cet appel réserve ${appelUsd.toFixed(2)} $ (reste ${restant.toFixed(2)} $)` };
  }
  return { allowed: true, restantUsd: restant, reason: '' };
}

/** Dépense CUMULÉE d'un espace depuis une date · même montant retenu que le plafond (R5). */
export async function depenseEspaceDepuis(base: BaseDepense, workspaceId: string, depuis: Date): Promise<number> {
  const [r] = await base.select({ total: sql<number>`coalesce(sum(${montantRetenuSql()}), 0)` })
    .from(schema.aiSpend)
    .leftJoin(schema.aiSpendReconciliations, eq(schema.aiSpendReconciliations.aiSpendId, schema.aiSpend.id))
    .where(and(eq(schema.aiSpend.workspaceId, workspaceId), gte(schema.aiSpend.createdAt, depuis)));
  return Number(r?.total ?? 0);
}

/** Le budget d'essai posé sur un espace, lu dans `app_settings` (ou `null`). */
export async function budgetEssaiDe(base: BaseDepense, workspaceId: string): Promise<BudgetEssai | null> {
  const [l] = await base.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, cleBudgetEssai(workspaceId))).limit(1);
  return lireBudgetEssai(l?.value ?? null);
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
    // Budget d'essai de l'espace · relu ICI, sous le verrou, pour chaque appel.
    if (ligne.workspaceId) {
      const budget = await budgetEssaiDe(tx as unknown as BaseDepense, ligne.workspaceId);
      if (budget) {
        const engage = await depenseEspaceDepuis(tx as unknown as BaseDepense, ligne.workspaceId, budget.depuis);
        const b = decisionBudgetEssai(engage, ligne.usd, budget.plafondUsd);
        if (!b.allowed) return { ok: false as const, raison: b.reason, dejaEngagee: false };
      }
    }
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

/**
 * Les lignes « à réconcilier » de la fenêtre, les plus récentes d'abord ·
 * lecture seule. Une ligne réconciliée (R5) n'y figure plus : elle passe à
 * l'historique (`lireDepensesReconciliees`), sa cause reste écrite.
 */
export async function lireDepensesAReconcilier(base: BaseDepense, depuis: Date, limite = 200) {
  const A = schema.aiSpend;
  const R = schema.aiSpendReconciliations;
  const rows = await base.select({
    id: A.id, createdAt: A.createdAt, provider: A.provider, model: A.model, action: A.action,
    workspaceId: A.workspaceId, estimatedUsd: A.estimatedUsd, actualUsd: A.actualUsd, cause: A.reconcileReason,
  }).from(A)
    .leftJoin(R, eq(R.aiSpendId, A.id))
    .where(and(isNotNull(A.reconcileReason), isNull(R.id), gte(A.createdAt, depuis)))
    .orderBy(desc(A.createdAt))
    .limit(Math.max(1, Math.min(1000, Math.trunc(limite))));
  return rows.map((r) => ({ ...r, cause: r.cause ?? '', estimatedUsd: Number(r.estimatedUsd), actualUsd: Number(r.actualUsd) }));
}

/* ── R5 · réconciliation avec la facture : AJOUT, jamais réécriture ─────────── */

export interface SaisieReconciliationDepense {
  aiSpendId: string;
  billedMicros: number;
  currency: string;
  providerRef: string;
  reason: string;
  authorId: string;
  idempotencyKey: string;
}

/** L'état lu sous verrou, passé à la décision de l'appelant (`decisionReconciliation`, noyau). */
export interface EtatReconciliationDepense {
  ligne: { id: string; reconcileReason: string | null; actualUsd: number } | null;
  parCle: { id: string; aiSpendId: string } | null;
  parLigne: { id: string; idempotencyKey: string; createdAt: Date } | null;
}

export type DecisionReconciliationDepense =
  | { geste: 'inserer'; reserveMicros: number }
  | { geste: 'deja_enregistree'; reconciliationId: string }
  | { geste: 'refus'; code: string; message: string };

export type ResultatReconciliationDepense =
  | { ok: true; statut: 'creee' | 'deja_enregistree'; reconciliation: typeof schema.aiSpendReconciliations.$inferSelect }
  | { ok: false; code: string; message: string };

/**
 * Réconcilie une ligne « à réconcilier » avec la facture · UNE transaction :
 * verrou sur la ligne `ai_spend` (deux soumissions simultanées s'attendent),
 * lecture de l'état (ligne, réconciliation sous cette clé, réconciliation de
 * cette ligne), décision de l'appelant, AJOUT d'une ligne
 * `ai_spend_reconciliations`. Rien d'autre n'est écrit : la ligne `ai_spend`
 * garde son montant réservé et sa cause. Rejouer la même clé rend la même
 * réconciliation (aucun doublon) ; les contraintes d'unicité de 0056 tiennent
 * même si un appelant oubliait la décision.
 */
export async function reconcilierDepense(
  base: BaseDepense,
  s: SaisieReconciliationDepense,
  decider: (etat: EtatReconciliationDepense) => DecisionReconciliationDepense,
): Promise<ResultatReconciliationDepense> {
  const A = schema.aiSpend;
  const R = schema.aiSpendReconciliations;
  return base.transaction(async (tx) => {
    const [ligne] = await tx.select({ id: A.id, reconcileReason: A.reconcileReason, actualUsd: A.actualUsd })
      .from(A).where(eq(A.id, s.aiSpendId)).for('update').limit(1);
    const [parCle] = await tx.select({ id: R.id, aiSpendId: R.aiSpendId }).from(R).where(eq(R.idempotencyKey, s.idempotencyKey)).limit(1);
    const [parLigne] = await tx.select({ id: R.id, idempotencyKey: R.idempotencyKey, createdAt: R.createdAt }).from(R).where(eq(R.aiSpendId, s.aiSpendId)).limit(1);
    const d = decider({
      ligne: ligne ? { ...ligne, actualUsd: Number(ligne.actualUsd) } : null,
      parCle: parCle ?? null,
      parLigne: parLigne ?? null,
    });
    if (d.geste === 'refus') return { ok: false as const, code: d.code, message: d.message };
    if (d.geste === 'deja_enregistree') {
      const [r] = await tx.select().from(R).where(eq(R.id, d.reconciliationId)).limit(1);
      if (!r) throw new Error('réconciliation introuvable');
      return { ok: true as const, statut: 'deja_enregistree' as const, reconciliation: r };
    }
    const [r] = await tx.insert(R).values({
      aiSpendId: s.aiSpendId, reservedMicros: d.reserveMicros, billedMicros: s.billedMicros, currency: s.currency,
      providerRef: s.providerRef, reason: s.reason, authorId: s.authorId, idempotencyKey: s.idempotencyKey,
    }).returning();
    if (!r) throw new Error('réconciliation non écrite');
    return { ok: true as const, statut: 'creee' as const, reconciliation: r };
  });
}

/** L'historique des réconciliations, les plus récentes d'abord · lecture seule, sans fenêtre (l'historique ne s'efface pas). */
export async function lireDepensesReconciliees(base: BaseDepense, limite = 100) {
  const A = schema.aiSpend;
  const R = schema.aiSpendReconciliations;
  const U = schema.users;
  const rows = await base.select({
    id: R.id, aiSpendId: R.aiSpendId, appelLe: A.createdAt, provider: A.provider, model: A.model, action: A.action, cause: A.reconcileReason,
    reservedMicros: R.reservedMicros, billedMicros: R.billedMicros, currency: R.currency, providerRef: R.providerRef, reason: R.reason,
    auteur: U.email, createdAt: R.createdAt,
  }).from(R)
    .innerJoin(A, eq(A.id, R.aiSpendId))
    .leftJoin(U, eq(U.id, R.authorId))
    .orderBy(desc(R.createdAt))
    .limit(Math.max(1, Math.min(1000, Math.trunc(limite))));
  return rows.map((r) => ({ ...r, cause: r.cause ?? '', reservedMicros: Number(r.reservedMicros), billedMicros: Number(r.billedMicros) }));
}
