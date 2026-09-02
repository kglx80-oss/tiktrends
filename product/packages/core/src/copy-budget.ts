/**
 * Combien de texte tient dans une mise en page.
 *
 * ── Ce qu'on rattrapait au lieu de le demander ───────────────────────────────
 *
 * `fitHeadline` réduit la police quand l'accroche est longue. C'est un filet,
 * pas une intention : sur l'affiche, dont tout l'effet tient à un titre énorme,
 * une accroche de quarante caractères passe de 92 à 64 pixels et le format perd
 * exactement ce qui le distingue.
 *
 * On demandait au modèle « 3 à 6 mots » pour toutes les mises en page, puis on
 * réparait en rapetissant. Autant le lui dire : la contrainte est connue AVANT
 * d'écrire, elle est différente selon l'endroit où le texte atterrit.
 *
 * ── Les seuils ne sont pas décoratifs ────────────────────────────────────────
 *
 * Ils sont calés sur les paliers de `fitHeadline` (16, 24, 34, 46). Rester sous
 * le palier, c'est garder la taille de base · le dépasser d'un caractère coûte
 * dix pixels d'un coup.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import type { AdLayout } from './ad-layouts';

/** Le palier de `fitHeadline` où la police atteint son plancher. */
export const HEADLINE_FLOOR = 46;

/**
 * Longueur d'accroche visée, par mise en page.
 *
 * L'affiche est la plus stricte parce qu'elle est la seule où le titre EST le
 * visuel · les autres ont une image pour porter le regard.
 */
export const HEADLINE_CHARS: Record<AdLayout, number> = {
  affiche: 24,
  champ: 34,
  split: 34,
  immersif: HEADLINE_FLOOR,
};

/** Nombre de mots visé · une contrainte en mots se suit mieux qu'en caractères. */
export const HEADLINE_WORDS: Record<AdLayout, number> = {
  affiche: 4,
  champ: 6,
  split: 6,
  immersif: 7,
};

/**
 * La consigne, en français, pour une mise en page.
 *
 * Rendue vide quand il n'y a rien à dire de particulier · une consigne qui
 * répète la règle générale la dilue.
 */
export function copyBudgetLine(layout: AdLayout): string {
  const mots = HEADLINE_WORDS[layout];
  const chars = HEADLINE_CHARS[layout];
  if (layout === 'affiche') {
    return `Cette exécution est une AFFICHE : l'accroche est imprimée en très grand, `
      + `elle EST le visuel. ${mots} mots maximum, ${chars} caractères maximum, sans sous-titre `
      + `ou alors très court. Au-delà, le titre rapetisse et le format perd tout son effet.`;
  }
  return `Accroche de ${mots} mots maximum (${chars} caractères) pour cette exécution.`;
}

/**
 * La mise en page s'adapte à l'accroche qu'on a reçue.
 *
 * ── Pourquoi on ne coupe pas le texte ────────────────────────────────────────
 *
 * On demande au modèle une accroche courte pour l'affiche. Il obéit souvent, pas
 * toujours · et rien ne le vérifiait. Deux réponses possibles devant une
 * accroche trop longue :
 *
 * - **la couper** · on ampute une phrase au milieu, et l'accroche ne veut plus
 *   rien dire. C'est le résultat le plus visiblement raté qu'on puisse produire ;
 * - **changer de mise en page** · l'affiche exige un titre court parce que le
 *   titre EST le visuel. Une accroche longue n'est pas fautive, elle n'est
 *   simplement pas une affiche.
 *
 * On change de mise en page. Le texte est ce que le modèle a écrit de mieux ; la
 * mise en page est un contenant, et un contenant se choisit d'après ce qu'on y
 * met.
 *
 * ── Le repli est l'immersive ─────────────────────────────────────────────────
 *
 * C'est celle qui tolère le plus de texte, et la seule qui prévoit un panneau
 * fait pour lui. Rabattre vers elle ne dégrade rien · c'est la mise en page qui
 * servait pour tout avant qu'il y en ait quatre.
 */
export function layoutFitsCopy(headline: string, layout: AdLayout): boolean {
  return (headline ?? '').trim().length <= HEADLINE_CHARS[layout];
}

export function layoutForCopy(headline: string, wanted: AdLayout): AdLayout {
  return layoutFitsCopy(headline, wanted) ? wanted : 'immersif';
}
