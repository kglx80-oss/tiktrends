import type { Theme } from '../themes';
import { PAPIER_CLAIR } from './theme-clair';

/** Les sections d'accent de la maquette Spatial (`body[data-sec]`). */
export const SECTIONS_SPATIALES = ['accueil', 'studios', 'veille', 'resultats', 'bibliotheque', 'jarvis', 'mcp', 'marque', 'reglages', 'admin'] as const;
export type SectionSpatiale = (typeof SECTIONS_SPATIALES)[number];

/**
 * Un écran porté · son chemin PUBLIC (celui que voit le navigateur) et sa
 * section d'accent. Segment dynamique noté `[nom]` (comme l'App Router).
 */
export interface EcranSpatial {
  chemin: string;
  section: SectionSpatiale;
}

/** Couleur de barre du navigateur sous Spatial, par thème · le fond de la
 *  maquette (`html,body{background:#0b1220}`) en sombre, le papier du thème
 *  clair dérivé (`theme-clair.ts`) en clair. Indexée par thème RÉSOLU · en
 *  « auto », `couleurBarreViewport` en tire une couleur par réglage de
 *  l'appareil, et `scriptThemeAuto` la suit quand ce réglage change. */
export const COULEUR_BARRE_SPATIALE: Record<Theme, string> = { sombre: '#0b1220', clair: PAPIER_CLAIR };
