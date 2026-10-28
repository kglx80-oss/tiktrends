import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « jarvis ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
export const ECRANS_JARVIS: readonly EcranSpatial[] = [
  { chemin: '/jarvis', section: 'jarvis' },
  // Vague 3 · écrans sans fragment de maquette, composés dans le langage de l'écran Jarvis.
  { chemin: '/jarvis/sources', section: 'jarvis' },
  { chemin: '/jarvis/veille', section: 'jarvis' },
];
