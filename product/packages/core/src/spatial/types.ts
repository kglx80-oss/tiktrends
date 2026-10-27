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

/** Couleur de barre du navigateur sous Spatial · le fond de la maquette (`html,body{background:#0b1220}`). */
export const COULEUR_BARRE_SPATIALE = '#0b1220';
