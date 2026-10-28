import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « jarvis ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) · un chemin absent n'a aucune page
 * (404) · l'ancienne interface est retirée. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
// Vague 3 · les pages V5 `/jarvis`, `/jarvis/sources` et `/jarvis/veille`
// sont retirées · leurs gestes vivent dans Spatial.
export const ECRANS_JARVIS: readonly EcranSpatial[] = [
  { chemin: '/jarvis', section: 'jarvis' },
  // Vague 3 · écrans sans fragment de maquette, composés dans le langage de l'écran Jarvis.
  { chemin: '/jarvis/sources', section: 'jarvis' },
  { chemin: '/jarvis/veille', section: 'jarvis' },
];
