import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « veille ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
export const ECRANS_VEILLE: readonly EcranSpatial[] = [
  // C2 · Formats et tendances
  { chemin: '/veille/formats', section: 'veille' },
  { chemin: '/veille/formats/[format]', section: 'veille' },
  { chemin: '/veille/tendances', section: 'veille' },
  { chemin: '/veille', section: 'veille' },
  { chemin: '/veille/concurrents', section: 'veille' },
  { chemin: '/veille/scale', section: 'veille' },
  { chemin: '/saved', section: 'veille' },
  { chemin: '/radar', section: 'veille' },
  // Vague 2 · le rapport détaillé d'un concurrent (écran V5 sans fragment de maquette).
  { chemin: '/brands/[id]/competitors/[name]', section: 'veille', exclusif: true },
];
