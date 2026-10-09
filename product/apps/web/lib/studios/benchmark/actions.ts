'use server';

import { gardePlateforme } from '../prompts/garde-prompts';
import { approuverBudgetBenchmark, joindreFichesRevue, planEtDevis } from './programme';

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

/** Taille maximale d'un rapport ou d'un lot de fiches collé dans l'écran · un rapport.json complet fait quelques dizaines de Ko. */
const OCTETS_MAX_JSON_BENCHMARK = 2 * 1024 * 1024;

/**
 * Joint les fiches de revue HUMAINE remplies au rapport d'une campagne RÉELLE
 * (lot F-D). Le serveur relit le rapport joint (empreinte), les traces en
 * base, valide les fiches et recalcule le verdict ; il ne publie rien et ne
 * pose pas « benchmark approuvé ».
 */
export async function joindreFichesBenchmarkAction(e: { releaseId: unknown; rapport: unknown; fiches: unknown }): Promise<ReponseBenchmark<{ evaluationId: string; passed: boolean; motifs: string[] }>> {
  const g = await gardePlateforme('prompt.evaluate');
  if (!g.ok) return { ok: false, message: g.message, traceId: g.traceId };
  const lire = (x: unknown): unknown => {
    if (typeof x !== 'string' || x.length > OCTETS_MAX_JSON_BENCHMARK) return undefined;
    try { return JSON.parse(x); } catch { return undefined; }
  };
  const rapport = lire(e?.rapport);
  const fiches = lire(e?.fiches);
  if (rapport === undefined || fiches === undefined) return { ok: false, message: 'Rapport ou fiches illisibles · colle le contenu de rapport.json et la liste des fiches (JSON).', traceId: g.ctx.traceId };
  try {
    const r = await joindreFichesRevue(g.acteur, { releaseId: e.releaseId, rapport, fiches });
    if (!r.ok) return { ok: false, message: 'Fiches refusées · voir les motifs.', motifs: r.refus, traceId: g.ctx.traceId };
    return { ok: true, donnees: { evaluationId: r.evaluationId, passed: r.passed, motifs: r.motifs }, traceId: g.ctx.traceId };
  } catch (err) {
    console.error(`[benchmark] ${g.ctx.traceId}`, (err as Error).message);
    return { ok: false, message: 'L’enregistrement a échoué · rien n’a été joint.', traceId: g.ctx.traceId };
  }
}
