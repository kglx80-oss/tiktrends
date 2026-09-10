/**
 * La géométrie de la coquille · desktop vs mobile, en une décision pure.
 *
 * Le rail faisait 250px fixes, quelle que soit la largeur. Sur un téléphone il
 * mangeait l'écran et le contenu débordait. Ici, une règle sans DOM ni fenêtre,
 * donc testable · le composant n'a plus qu'à appliquer ce qu'elle renvoie.
 *
 * Desktop · deux colonnes, le rail collé (sticky), toujours visible.
 * Mobile · une colonne, le rail sort du flux en tiroir · un hamburger l'ouvre,
 * un voile le referme. Le chemin desktop est INCHANGÉ · `mobile` faux redonne
 * exactement l'ancienne géométrie.
 */
export interface EtatChrome {
  mobile: boolean;
  /** Rail replié en barre d'icônes (préférence desktop). */
  collapsed: boolean;
  /** Tiroir ouvert (mobile uniquement). */
  drawerOuvert: boolean;
}

export interface Chrome {
  /** `grid-template-columns` de la coquille. */
  colonnes: string;
  /** Le rail sort du flux (position fixe, hors-écran quand fermé). */
  railTiroir: boolean;
  /** Le rail est à l'écran. */
  railVisible: boolean;
  /** Le bouton hamburger d'ouverture est affiché. */
  hamburger: boolean;
  /** Le voile sombre cliquable est affiché. */
  voile: boolean;
  /** Largeur du rail, en pixels. */
  largeurRail: number;
}

export function chromeCoquille({ mobile, collapsed, drawerOuvert }: EtatChrome): Chrome {
  const largeurRail = collapsed ? 72 : 250;
  if (!mobile) {
    return { colonnes: `${largeurRail}px minmax(0,1fr)`, railTiroir: false, railVisible: true, hamburger: false, voile: false, largeurRail };
  }
  return { colonnes: '1fr', railTiroir: true, railVisible: drawerOuvert, hamburger: true, voile: drawerOuvert, largeurRail };
}
