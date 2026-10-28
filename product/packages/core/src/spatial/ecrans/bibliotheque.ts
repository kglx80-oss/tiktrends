import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « bibliotheque ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) · un chemin absent n'a aucune page
 * (404) · l'ancienne interface est retirée. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
export const ECRANS_BIBLIOTHEQUE: readonly EcranSpatial[] = [
  // La page V5 est retirée (vague 2).
  { chemin: '/assets', section: 'bibliotheque' },
];
