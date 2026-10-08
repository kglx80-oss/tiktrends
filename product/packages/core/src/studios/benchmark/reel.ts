/**
 * Benchmark Studios · garde du mode RÉEL.
 *
 * Une campagne réelle dépense de l'argent : elle est REFUSÉE tant que TOUTES
 * les conditions ne sont pas réunies, et chaque refus est dit (tous les
 * motifs, pas seulement le premier) :
 *
 *  1. un budget explicite `--budget-usd X`, lisible et positif ;
 *  2. un devis agrégé CHIFFRABLE, et X ≥ ce devis ;
 *  3. X ≤ ce qui reste du plafond `AI_SPEND_CAP_USD` (30 jours glissants) ;
 *  4. une approbation ADMIN enregistrée, non consommée, non expirée, sur CE
 *     devis (empreinte), CETTE release (empreinte) et un budget ≥ X ;
 *  5. une release exécutable par le registre, et des exécuteurs qui couvrent
 *     le plan (un média sans fournisseur branché n'est jamais simulé en réel).
 *
 * Pendant l'exécution : `peutLancer` arrête la campagne AVANT l'appel dont le
 * plafond ferait dépasser le budget (dépense cumulée + borne de l'appel).
 *
 * Pur : l'état (plafond, approbation, release) est lu par le serveur.
 */

import { constatBench, type ConstatBench } from './cas';
import type { DevisAgrege } from './devis';

export interface ApprobationBudget {
  id: string;
  releaseId: string;
  releaseHash: string;
  devisEmpreinte: string;
  budgetUsdMicros: number;
  approuvePar: string | null;
  le: string;
  expireLe: string;
  consommee: boolean;
}

/** Validité d'une approbation · politique, pas une mesure : le temps de lancer la campagne approuvée, pas plus. */
export const VALIDITE_APPROBATION_MS = 24 * 60 * 60 * 1000;

/** `--budget-usd` → micro-dollars entiers · `null` si absent ou illisible. */
export function lireBudgetUsd(brut: string | undefined | null): { ok: true; micros: number } | { ok: false; code: 'BUDGET_ABSENT' | 'BUDGET_INVALIDE' } {
  if (brut === undefined || brut === null || brut.trim() === '') return { ok: false, code: 'BUDGET_ABSENT' };
  const t = brut.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return { ok: false, code: 'BUDGET_INVALIDE' };
  const micros = Math.round(Number(t) * 1_000_000);
  if (!Number.isSafeInteger(micros) || micros <= 0) return { ok: false, code: 'BUDGET_INVALIDE' };
  return { ok: true, micros };
}

export interface EtatReel {
  budgetBrut: string | undefined | null;
  devis: DevisAgrege;
  plafond: { capUsd: number; depenseUsd: number; bloque: boolean };
  approbation: ApprobationBudget | null;
  release: { id: string; hash: string; executable: boolean; motif: string | null } | null;
  executeurs: { manques: string[] };
  maintenant: Date;
}

export type AutorisationReelle = { ok: true; budgetUsdMicros: number; approbationId: string } | { ok: false; refus: ConstatBench[] };

export function autoriserCampagneReelle(e: EtatReel): AutorisationReelle {
  const refus: ConstatBench[] = [];
  const b = lireBudgetUsd(e.budgetBrut);
  if (!b.ok) refus.push(constatBench(b.code, '--budget-usd', b.code === 'BUDGET_ABSENT' ? 'Aucun budget explicite · passer --budget-usd X (en dollars).' : `Budget illisible « ${String(e.budgetBrut)} ».`));
  if (!e.devis.ok) refus.push(constatBench('DEVIS_NON_CHIFFRABLE', e.devis.nonChiffrables.join(','), `Devis agrégé refusé · cas non chiffrables : ${e.devis.nonChiffrables.join(', ') || 'aucun cas'}.`));
  if (b.ok && e.devis.ok && b.micros < e.devis.totalUsdMicros) refus.push(constatBench('BUDGET_INFERIEUR_AU_DEVIS', '--budget-usd', `Budget ${b.micros} µ$ < devis agrégé ${e.devis.totalUsdMicros} µ$.`));
  const reste = Math.floor((e.plafond.capUsd - e.plafond.depenseUsd) * 1_000_000);
  if (e.plafond.bloque) refus.push(constatBench('PLAFOND_ATTEINT', 'AI_SPEND_CAP_USD', 'Plafond de dépense atteint · rien ne part.'));
  else if (b.ok && !(b.micros <= reste)) refus.push(constatBench('BUDGET_AU_DELA_DU_PLAFOND', 'AI_SPEND_CAP_USD', `Budget ${b.micros} µ$ > reste du plafond ${Math.max(0, reste)} µ$.`));

  const a = e.approbation;
  if (!a) refus.push(constatBench('APPROBATION_ABSENTE', 'approbation', 'Aucune approbation ADMIN enregistrée pour ce devis et cette release.'));
  else {
    if (a.consommee) refus.push(constatBench('APPROBATION_CONSOMMEE', a.id, 'Approbation déjà utilisée par une campagne.'));
    if (!(Date.parse(a.expireLe) > e.maintenant.getTime())) refus.push(constatBench('APPROBATION_EXPIREE', a.id, `Approbation expirée le ${a.expireLe}.`));
    if (!e.devis.ok || a.devisEmpreinte !== e.devis.empreinte) refus.push(constatBench('APPROBATION_AUTRE_DEVIS', a.id, 'L’approbation vise un autre devis (empreinte différente).'));
    if (!e.release || a.releaseId !== e.release.id || a.releaseHash !== e.release.hash) refus.push(constatBench('APPROBATION_AUTRE_RELEASE', a.id, 'L’approbation vise une autre release.'));
    if (b.ok && a.budgetUsdMicros < b.micros) refus.push(constatBench('APPROBATION_BUDGET_INFERIEUR', a.id, `Budget approuvé ${a.budgetUsdMicros} µ$ < budget demandé ${b.micros} µ$.`));
  }
  if (!e.release) refus.push(constatBench('RELEASE_ABSENTE', 'release', 'Aucune release désignée.'));
  else if (!e.release.executable) refus.push(constatBench('RELEASE_NON_EXECUTABLE', e.release.id, e.release.motif ?? 'Release non exécutable par le registre.'));
  if (e.executeurs.manques.length) refus.push(constatBench('EXECUTEUR_NON_BRANCHE', e.executeurs.manques.join(','), `Aucun exécuteur réel pour : ${e.executeurs.manques.join(', ')}.`));

  if (refus.length || !b.ok || !a) return { ok: false, refus };
  return { ok: true, budgetUsdMicros: b.micros, approbationId: a.id };
}

/** Avant chaque appel payant : la dépense cumulée PLUS le plafond de l'appel tient-elle dans le budget ? */
export function peutLancer(cumulMicros: number, borneAppelMicros: number | null, budgetMicros: number): boolean {
  if (borneAppelMicros === null) return false;
  return cumulMicros + borneAppelMicros <= budgetMicros;
}
