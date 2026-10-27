import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « studios ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
export const ECRANS_STUDIOS: readonly EcranSpatial[] = [
  // D2 · projet, éditeur, vidéo.
  { chemin: '/studio/projets/[id]', section: 'studios' },
  { chemin: '/studio/projets/[id]/image', section: 'studios' },
  { chemin: '/studio/projets/[id]/video', section: 'studios' },
];
