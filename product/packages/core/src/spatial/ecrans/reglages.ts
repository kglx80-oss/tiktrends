import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « reglages ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) · un chemin absent n'a aucune page
 * (404) · l'ancienne interface est retirée. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
// Les pages V5 sont retirées (vague 2 et 4).
export const ECRANS_REGLAGES: readonly EcranSpatial[] = [
  // Vague 4 · écrans V5 sans fragment de maquette · « Mon profil » (menu profil)
  // et « Tagging » (échantillon de démonstration nommé · accent de la Veille,
  // sa rubrique dans l'ancienne navigation).
  { chemin: '/profile', section: 'reglages' },
  { chemin: '/tags', section: 'veille' },
  { chemin: '/settings', section: 'reglages' },
  { chemin: '/settings/partenaires', section: 'reglages' },
  { chemin: '/team', section: 'reglages' },
  { chemin: '/connections', section: 'reglages' },
  { chemin: '/usage', section: 'reglages' },
  { chemin: '/billing', section: 'reglages' },
  // Vague 4 · le support de l'espace (écrans V5 sans fragment de maquette).
  { chemin: '/support', section: 'reglages' },
  { chemin: '/support/[id]', section: 'reglages' },
];
