import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « marque ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
export const ECRANS_MARQUE: readonly EcranSpatial[] = [
  // `/brands/new` d'abord · le segment dynamique `[id]` l'avalerait sinon
  // (la création d'une marque ne doit pas tomber sur une fiche introuvable).
  { chemin: '/brands/new', section: 'marque' },
  { chemin: '/brands/[id]', section: 'marque' },
  { chemin: '/brands/[id]/identite', section: 'marque' },
  { chemin: '/brands/[id]/offre', section: 'marque' },
  { chemin: '/brands/[id]/personas', section: 'marque' },
  { chemin: '/brands/[id]/regles', section: 'marque' },
];
