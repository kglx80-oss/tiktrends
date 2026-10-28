import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « veille ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * Vague 4 · toute la rubrique est EXCLUSIVE · servie par Spatial même en mode
 * V5 (`?ui=v5`) · les pages V5 `/veille`, `/veille/formats`, `/veille/scale`,
 * `/radar` et `/saved` sont retirées, leurs gestes vivent dans ces écrans.
 */
export const ECRANS_VEILLE: readonly EcranSpatial[] = [
  // C2 · Formats et tendances
  { chemin: '/veille/formats', section: 'veille', exclusif: true },
  { chemin: '/veille/formats/[format]', section: 'veille', exclusif: true },
  { chemin: '/veille/tendances', section: 'veille', exclusif: true },
  { chemin: '/veille', section: 'veille', exclusif: true },
  { chemin: '/veille/concurrents', section: 'veille', exclusif: true },
  { chemin: '/veille/scale', section: 'veille', exclusif: true },
  { chemin: '/saved', section: 'veille', exclusif: true },
  { chemin: '/radar', section: 'veille', exclusif: true },
  // Vague 2 · le rapport détaillé d'un concurrent (écran V5 sans fragment de maquette).
  { chemin: '/brands/[id]/competitors/[name]', section: 'veille', exclusif: true },
];
