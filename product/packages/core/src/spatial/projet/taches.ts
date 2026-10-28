/**
 * Spatial · fiche projet · les TÂCHES (onglet Créations) · ce que le panneau
 * V5 des tâches disait et que la ligne Spatiale doit garder : l'avancement
 * seulement quand il est RÉEL (jamais fabriqué), la fin datée, et un bandeau
 * quand des tâches sont interrompues (coût en rapprochement, relance
 * bloquée · jamais la promesse « aucun débit »). Pur.
 */

import { dateHeureParis } from './propositions';

/** « Image · lancée le 17/10 11:00 · terminée le … · avancement 40 % » · le pourcentage n'apparaît que s'il est mesuré. */
export function detailTache(t: { libelleOperation: string; creeLe: string; finiLe: string | null; progression: number | null }): string {
  const fin = t.finiLe ? ` · terminée le ${dateHeureParis(t.finiLe)}` : '';
  const avancement = typeof t.progression === 'number' && Number.isFinite(t.progression) ? ` · avancement ${Math.round(t.progression)} %` : '';
  return `${t.libelleOperation} · lancée le ${dateHeureParis(t.creeLe)}${fin}${avancement}`;
}

/** Le bandeau des tâches interrompues · `null` sans interruption. */
export function bandeauTachesInterrompues(n: number): string | null {
  if (n <= 0) return null;
  return `${n === 1 ? 'Une tâche est interrompue' : `${n} tâches sont interrompues`} · le coût est en cours de rapprochement · la relance reste bloquée jusque-là.`;
}
