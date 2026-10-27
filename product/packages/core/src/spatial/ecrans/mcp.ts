import type { EcranSpatial } from '../types';

/**
 * Écrans Spatial PORTÉS de la rubrique « mcp ». Un chemin listé ici est servi
 * par l'arbre Spatial (`app/(spatial)/sp`) quand `tt_ui=spatial` · un chemin
 * absent reste servi par l'ancienne interface. Un fichier par rubrique · deux
 * chantiers parallèles ne se disputent jamais la même ligne.
 *
 * `/mcp` est une adresse NOUVELLE (aucun écran V5) · la page dit « bientôt ».
 * L'entrée du rail reste verrouillée sans lien (`entreesRail`) · la relier est
 * une décision du chef de projet.
 */
export const ECRANS_MCP: readonly EcranSpatial[] = [
  { chemin: '/mcp', section: 'mcp' },
];
