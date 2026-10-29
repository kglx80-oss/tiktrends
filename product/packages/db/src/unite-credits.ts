import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Conversion d'un espace dans la nouvelle unité de crédit (÷ 10) · MIROIR SQL
 * de la règle pure `convertirSoldes` (`packages/core/src/offre/unite.ts`),
 * commun au site et au worker.
 *
 * À poser en UN seul UPDATE conditionnel (`conditionConversionUnite`) · deux
 * conversions concurrentes ne peuvent pas multiplier deux fois (la seconde ne
 * trouve plus la ligne), un second passage ne fait rien. Les expressions de
 * droite lisent l'ANCIENNE ligne (sémantique Postgres de SET).
 */
const W = schema.workspaces;

/** Facteur et marqueurs · dupliqués du noyau (la base ne dépend pas du noyau), gardés égaux par `offre-unite-db.test.ts`. */
export const FACTEUR_UNITE_DB = 10;
export const MOTIF_CONVERSION_UNITE_DB = `Conversion des crédits · nouvelle unité (×${FACTEUR_UNITE_DB})`;
export const REF_CONVERSION_UNITE_DB = 'unite-credit-x10';

/** Les colonnes converties · chaque compteur ×10, la poche jamais suivie (null) reste null. */
export function setConversionUnite(maintenant: Date) {
  const f = FACTEUR_UNITE_DB;
  return {
    creditsBalance: sql`${W.creditsBalance} * ${f}`,
    lastPlanCredits: sql`${W.lastPlanCredits} * ${f}`,
    trialCredits: sql`${W.trialCredits} * ${f}`,
    planCreditsLeft: sql`${W.planCreditsLeft} * ${f}`,
    extraCreditsSpent: sql`${W.extraCreditsSpent} * ${f}`,
    creditUnit: f,
    creditUnitConvertedAt: maintenant,
  };
}

/** La ligne à convertir · cet espace (ou tous), encore en ancienne unité. */
export function conditionConversionUnite(workspaceId?: string): SQL {
  const ancienne = eq(W.creditUnit, 1);
  return workspaceId ? and(eq(W.id, workspaceId), ancienne)! : ancienne;
}

/** Un client drizzle ou une transaction ouverte (site, worker). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executeur = Pick<PgDatabase<PgQueryResultHKT, any>, 'update' | 'insert'>;

/**
 * Convertit un espace (ou, sans identifiant, TOUS les espaces encore en
 * ancienne unité) et écrit la ligne de journal de chacun · à appeler dans la
 * transaction qui va écrire le solde. Rend le nombre d'espaces convertis.
 */
export async function convertirUnite(ex: Executeur, workspaceId?: string, maintenant: Date = new Date()): Promise<number> {
  const rows = await ex.update(W).set(setConversionUnite(maintenant)).where(conditionConversionUnite(workspaceId))
    .returning({ id: W.id, solde: W.creditsBalance });
  const lignes = rows
    .map((r) => ({ workspaceId: r.id, delta: r.solde - r.solde / FACTEUR_UNITE_DB, reason: MOTIF_CONVERSION_UNITE_DB, refId: REF_CONVERSION_UNITE_DB }))
    .filter((l) => l.delta !== 0);
  if (lignes.length) await ex.insert(schema.creditLedger).values(lignes);
  return rows.length;
}
