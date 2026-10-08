import { and, eq, gte, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Plafond de dépense · le versant BASE, partagé par les processus qui ne sont
 * pas l'application web (le worker des studios).
 *
 * Pourquoi ici : la règle de décision vit dans `@tiktrends/core`
 * (`checkBudget`), mais `@tiktrends/db` ne dépend pas du noyau, et
 * `@tiktrends/integrations` ne dépend pas de la base (aucune dépendance
 * ajoutée). Ce module ne DÉCIDE donc rien : il lit la même somme que
 * `spentUsd()` (`apps/web/lib/spend-guard.ts` · `sum(actual_usd)` de
 * `ai_spend` depuis le début de la fenêtre) et écrit la même ligne, en
 * laissant la décision à l'appelant (`decider`, qui appelle `checkBudget`).
 *
 * Deux différences voulues avec la barrière web, toutes deux du côté prudent :
 *  · lecture et écriture se font sous un verrou consultatif de transaction :
 *    deux workers ne passent pas le même reste en même temps ;
 *  · une écriture impossible REFUSE la dépense (la barrière web journalise et
 *    laisse passer) : sans ligne, pas d'appel.
 */

// Tout client drizzle Postgres (postgres-js en production, pglite en test).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BaseDepense = PgDatabase<PgQueryResultHKT, any, any>;

/** Clé du verrou consultatif partagé par toutes les réservations du worker. */
export const VERROU_PLAFOND = 7_243_100_917;

export interface LigneDepense {
  /** Identifiant DÉRIVÉ du job (`idDepenseDuJob`) · une ligne par job, jamais deux. */
  id: string;
  workspaceId: string | null;
  provider: string;
  model: string | null;
  action: string;
  usd: number;
}

export type ReservationDepense =
  | { ok: true; depenseAvantUsd: number }
  | { ok: false; raison: string; dejaEngagee: boolean };

/** Dépense de la fenêtre · la même somme que `spentUsd()` du web. */
export async function depenseDepuis(base: BaseDepense, depuis: Date): Promise<number> {
  const [r] = await base.select({ total: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)` })
    .from(schema.aiSpend).where(gte(schema.aiSpend.createdAt, depuis));
  return Number(r?.total ?? 0);
}

/**
 * Réserve une dépense AVANT l'appel payant · verrou, somme, décision, ligne,
 * dans UNE transaction. Une ligne déjà présente pour cet identifiant veut dire
 * qu'une soumission a déjà été engagée pour ce job : refus, la ligne existante
 * n'est pas touchée.
 */
export async function reserverDepense(
  base: BaseDepense,
  ligne: LigneDepense,
  o: { depuis: Date; decider: (depenseUsd: number) => { allowed: boolean; reason: string } },
): Promise<ReservationDepense> {
  return base.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${VERROU_PLAFOND})`);
    const [deja] = await tx.select({ id: schema.aiSpend.id }).from(schema.aiSpend).where(eq(schema.aiSpend.id, ligne.id)).limit(1);
    if (deja) return { ok: false as const, raison: 'une soumission a déjà été engagée pour ce job', dejaEngagee: true };
    const depense = await depenseDepuis(tx as unknown as BaseDepense, o.depuis);
    const d = o.decider(depense);
    if (!d.allowed) return { ok: false as const, raison: d.reason, dejaEngagee: false };
    await tx.insert(schema.aiSpend).values({
      id: ligne.id, workspaceId: ligne.workspaceId, provider: ligne.provider, model: ligne.model, action: ligne.action,
      estimatedUsd: ligne.usd, actualUsd: ligne.usd,
    });
    return { ok: true as const, depenseAvantUsd: depense };
  });
}

/**
 * Rend une dépense que le fournisseur n'a pas facturée · comme `annuleCoutFixe`
 * du web : la ligne reste (l'essai demeure lisible), seul `actual_usd` tombe à 0.
 * Rend vrai si une ligne a été rendue.
 */
export async function annulerDepense(base: BaseDepense, id: string): Promise<boolean> {
  const r = await base.update(schema.aiSpend).set({ actualUsd: 0 })
    .where(and(eq(schema.aiSpend.id, id), sql`${schema.aiSpend.actualUsd} > 0`))
    .returning({ id: schema.aiSpend.id });
  return r.length > 0;
}
