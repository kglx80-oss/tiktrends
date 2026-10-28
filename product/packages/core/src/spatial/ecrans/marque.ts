import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « marque ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 */
// `exclusif` · les pages V5 de la fiche et de la création sont retirées (vague 2) ·
// les sous-écrans n'en ont jamais eu. La liste `/brands` est portée en vague 3.
export const ECRANS_MARQUE: readonly EcranSpatial[] = [
  // Vague 3 · la liste des marques (écran sans fragment de maquette).
  { chemin: '/brands', section: 'marque' },
  // `/brands/new` d'abord · le segment dynamique `[id]` l'avalerait sinon
  // (la création d'une marque ne doit pas tomber sur une fiche introuvable).
  { chemin: '/brands/new', section: 'marque', exclusif: true },
  { chemin: '/brands/[id]', section: 'marque', exclusif: true },
  { chemin: '/brands/[id]/identite', section: 'marque', exclusif: true },
  { chemin: '/brands/[id]/offre', section: 'marque', exclusif: true },
  { chemin: '/brands/[id]/personas', section: 'marque', exclusif: true },
  { chemin: '/brands/[id]/regles', section: 'marque', exclusif: true },
];
