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
  /**
   * Seul Spatial sert cet écran · sa page V5 est RETIRÉE. Le middleware le
   * réécrit même en mode V5 (`?ui=v5`), et la garde `spatial-fondation` refuse
   * qu'il garde une page dans l'ancienne interface. À poser seulement quand
   * TOUS les gestes de la page V5 ont leur équivalent Spatial.
   */
  exclusif?: true;
}

/** Couleur de barre du navigateur sous Spatial · le fond de la maquette (`html,body{background:#0b1220}`). */
export const COULEUR_BARRE_SPATIALE = '#0b1220';
