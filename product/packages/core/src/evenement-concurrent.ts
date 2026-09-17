/**
 * Typer les événements des concurrents suivis (CDC v7 · N10).
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le fil « Nouveautés des concurrents » ne disait qu'une chose · « NOUVEAU ».
 * Or une pub fraîchement détectée n'a pas le même poids selon qu'elle vient
 * d'être lancée, qu'elle TIENT depuis des semaines, ou que sa portée MONTE
 * encore. Le propriétaire cherche « ce qui est prouvé, pas le énième lancement »
 * · un badge unique noie ce signal.
 *
 * Ce module classe chaque pub de veille en événements DÉRIVABLES de l'instantané
 * lui-même · pas de stockage nouveau. Il en résulte trois natures · une
 * nouveauté (on vient de la détecter), une diffusion durable (elle tient au-delà
 * du seuil éprouvé) et une croissance (sa portée progresse encore). L'ordre rend
 * d'abord le signal le plus fort · un concurrent qui reconduit une créa depuis
 * des semaines dit plus qu'un simple lancement.
 *
 * « Offre changée » du cahier des charges reste HORS PÉRIMÈTRE ici · il exige de
 * comparer à un état antérieur STOCKÉ (le prix ou l'offre d'hier), donc une
 * mémoire par pub qui n'existe pas encore. On ne l'invente pas d'instinct · on
 * le livrera quand l'historique par pub sera là.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import { PROVEN_DAYS } from './adsmap/market-stats';

/**
 * Le plancher d'observation d'une croissance · une portée qui monte n'a de sens
 * qu'après quelques jours de diffusion. MÊME valeur que la branche « montée
 * précoce » d'`isProven` (`market-stats`) · les deux lectures du même signal ne
 * doivent pas diverger.
 */
export const JOURS_CROISSANCE_MIN = 7;

/** Les natures d'événement qu'une pub de veille peut porter, du plus fort au plus faible. */
export type EvenementConcurrent = 'diffusion_durable' | 'croissance' | 'nouveaute';

export const EVENEMENT_LABEL: Record<EvenementConcurrent, string> = {
  diffusion_durable: 'Diffusion durable',
  croissance: 'En croissance',
  nouveaute: 'Nouveauté',
};

/** Une phrase courte qui dit POURQUOI l'événement compte · sert d'infobulle. */
export const EVENEMENT_RAISON: Record<EvenementConcurrent, string> = {
  diffusion_durable: `Tient depuis plus de ${PROVEN_DAYS} jours · une reconduction, pas un lancement.`,
  croissance: 'Sa portée progresse encore · le concurrent pousse le budget.',
  nouveaute: 'Détectée au dernier scan · pas encore vue.',
};

/** Ce qu'il faut savoir d'une pub pour en dériver ses événements. */
export interface InstantanePub {
  daysRunning?: number | null;
  reachDelta30d?: number | null;
}

/**
 * Les événements portés par une pub de veille, du plus fort au plus faible.
 *
 * `nouveau` vient du DÉTECTEUR (la pub n'a pas encore été vue), pas de la pub
 * elle-même · les deux autres se lisent sur l'instantané. Une même pub peut
 * cumuler les trois · fraîchement détectée, installée depuis des semaines ET
 * encore en croissance est le cas le plus intéressant à cloner.
 */
export function evenementsConcurrent(pub: InstantanePub, ctx: { nouveau: boolean }): EvenementConcurrent[] {
  const out: EvenementConcurrent[] = [];
  const jours = pub.daysRunning ?? 0;
  const delta = pub.reachDelta30d ?? 0;

  if (jours >= PROVEN_DAYS) out.push('diffusion_durable');
  if (delta > 0 && jours >= JOURS_CROISSANCE_MIN) out.push('croissance');
  if (ctx.nouveau) out.push('nouveaute');

  return out;
}
