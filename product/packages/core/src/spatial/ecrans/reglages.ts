import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « reglages ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
// `exclusif` · la page V5 est retirée (vague 2) · le middleware sert l'écran
// par Spatial même en mode `?ui=v5`.
export const ECRANS_REGLAGES: readonly EcranSpatial[] = [
  { chemin: '/settings', section: 'reglages', exclusif: true },
  { chemin: '/settings/partenaires', section: 'reglages', exclusif: true },
  { chemin: '/team', section: 'reglages', exclusif: true },
  { chemin: '/connections', section: 'reglages', exclusif: true },
  { chemin: '/usage', section: 'reglages', exclusif: true },
  { chemin: '/billing', section: 'reglages', exclusif: true },
  // Vague 4 · le support de l'espace (écrans V5 sans fragment de maquette).
  { chemin: '/support', section: 'reglages', exclusif: true },
  { chemin: '/support/[id]', section: 'reglages', exclusif: true },
];
