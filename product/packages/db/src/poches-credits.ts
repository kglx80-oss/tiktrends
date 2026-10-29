import { sql, type SQL } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Poches de crédits · le MIROIR SQL des règles pures du noyau
 * (`debiterPoches`, `rembourserPoches`, `pocheAbonnement`, dans
 * `packages/core/src/credits.ts`), commun au site et au worker.
 *
 * Pourquoi un miroir et pas une lecture puis une écriture : le débit reste UN
 * seul UPDATE conditionnel (deux requêtes concurrentes ne passent pas la même
 * vérification de solde). Les expressions de droite lisent l'ANCIENNE ligne
 * (sémantique Postgres de SET), exactement les entrées des fonctions du noyau.
 * La garde `apps/web/test/credits-poches-db.test.ts` compare la base à ces
 * fonctions, opération par opération : un écart entre les deux la fait tomber.
 */
const W = schema.workspaces;

/** `pocheAbonnement` · min(abonnement restant, ou dernière allocation si jamais suivi ; solde), jamais négatif. */
const abonnement: SQL = sql`least(greatest(0, coalesce(${W.planCreditsLeft}, ${W.lastPlanCredits})), greatest(0, ${W.creditsBalance}))`;

/** `debiterPoches` · l'abonnement d'abord. À poser avec une condition `credits_balance >= cout`. */
export function setDebitPoches(cout: number) {
  return {
    creditsBalance: sql`${W.creditsBalance} - ${cout}`,
    planCreditsLeft: sql`greatest(0, ${abonnement} - ${cout})`,
    extraCreditsSpent: sql`greatest(0, ${W.extraCreditsSpent}) + greatest(0, ${cout} - ${abonnement})`,
  };
}

/** `rembourserPoches` · rend d'abord ce qui a été pris hors abonnement, puis l'abonnement. */
export function setRemboursementPoches(montant: number) {
  return {
    creditsBalance: sql`${W.creditsBalance} + ${montant}`,
    planCreditsLeft: sql`${abonnement} + greatest(0, ${montant} - greatest(0, ${W.extraCreditsSpent}))`,
    extraCreditsSpent: sql`greatest(0, greatest(0, ${W.extraCreditsSpent}) - ${montant})`,
  };
}
