'use server';

import { gardePlateforme } from '../prompts/garde-prompts';
import { approuverBudgetBenchmark, planEtDevis } from './programme';

/**
 * Commandes ADMIN « IA et Studios » du benchmark · prêtes à brancher sur
 * l'onglet Évaluations (`app/(app)/admin/ia-studios/`, hors du périmètre de
 * ce lot). Garde : `prompt.evaluate` (accès total d'équipe seulement, SEC-09).
 *
 *  - `devisBenchmarkAction` : le devis agrégé, lu avant le clic (aucun appel) ;
 *  - `approuverBudgetBenchmarkAction` : enregistre l'approbation d'un budget
 *    sur CE devis et CETTE release. Elle ne lance rien : la campagne réelle
 *    reste une commande explicite (`bench:studios --reel --budget-usd X`), qui
 *    revérifie tout avant le premier appel.
 */

export interface ReponseBenchmark<T> { ok: boolean; donnees?: T; message?: string; motifs?: Array<{ code: string; message: string }>; traceId?: string }

export async function devisBenchmarkAction(e: { cas?: unknown }): Promise<ReponseBenchmark<{ totalUsdMicros: number | null; nonChiffrables: string[]; empreinte: string | null }>> {
  const g = await gardePlateforme('prompt.evaluate');
  if (!g.ok) return { ok: false, message: g.message, traceId: g.traceId };
  const cas = Array.isArray(e.cas) && e.cas.every((x) => typeof x === 'string') ? (e.cas as string[]) : null;
  const pd = planEtDevis(cas);
  if (!pd.ok) return { ok: false, motifs: pd.refus, traceId: g.ctx.traceId };
  return {
    ok: true, traceId: g.ctx.traceId,
    donnees: pd.devis.ok
      ? { totalUsdMicros: pd.devis.totalUsdMicros, nonChiffrables: [], empreinte: pd.devis.empreinte }
      : { totalUsdMicros: null, nonChiffrables: pd.devis.nonChiffrables, empreinte: null },
  };
}

export async function approuverBudgetBenchmarkAction(e: { releaseId: unknown; cas?: unknown; budgetUsd: unknown; motif: unknown }): Promise<ReponseBenchmark<{ approbationId: string; expireLe: string }>> {
  const g = await gardePlateforme('prompt.evaluate');
  if (!g.ok) return { ok: false, message: g.message, traceId: g.traceId };
  try {
    const r = await approuverBudgetBenchmark(g.acteur, e);
    if (!r.ok) return { ok: false, message: 'Approbation refusée · voir les motifs.', motifs: r.refus, traceId: g.ctx.traceId };
    return { ok: true, donnees: { approbationId: r.approbationId, expireLe: r.expireLe }, traceId: g.ctx.traceId };
  } catch (err) {
    console.error(`[benchmark] ${g.ctx.traceId}`, (err as Error).message);
    return { ok: false, message: 'L’enregistrement a échoué · rien n’a été approuvé.', traceId: g.ctx.traceId };
  }
}
