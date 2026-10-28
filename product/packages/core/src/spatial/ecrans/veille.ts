import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « veille ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) · un chemin absent n'a aucune page
 * (404) · l'ancienne interface est retirée. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Vague 4 · les pages V5 `/veille`, `/veille/formats`, `/veille/scale`,
 * `/radar` et `/saved` sont retirées, leurs gestes vivent dans ces écrans.
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
  { chemin: '/brands/[id]/competitors/[name]', section: 'veille' },
];
