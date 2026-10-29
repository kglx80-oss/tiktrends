/**
 * Spatial · les CIBLES TACTILES au téléphone.
 *
 * La maquette dessine pour la souris · `.btn.sm` à 34 px de haut, les puces à
 * 32-35 px, la cloche à 40 px, l'avatar à 38 px, les onglets de sous-navigation
 * à 33 px, les interrupteurs à 26-28 px. Mesuré au banc (planche finale, 36
 * écrans à 390 px) · 918 éléments interactifs sous 44 px, presque tous issus de
 * ces quelques primitives répétées sur chaque page.
 *
 * `spatial.css` est figée à l'octet (garde `spatial-fondation`) · on n'y ajoute
 * aucune règle. La coquille applique donc, au téléphone SEULEMENT, un style en
 * ligne aux primitives listées ici. Le rendu serveur et le bureau ne changent
 * pas (la parité avec la maquette tient à 1280).
 *
 * Deux façons d'atteindre la cible ·
 *  · `agrandir` · l'élément porte un fond ou une bordure (bouton, puce, onglet,
 *    pastille) · il grandit jusqu'à la cible (`min-height` / `min-width`), son
 *    contenu reste centré.
 *  · `deborder` · l'élément a une géométrie dessinée qu'un agrandissement
 *    casserait (le bouton glissant d'un interrupteur est posé en haut de sa
 *    piste) · la ZONE tactile s'étend par une bordure transparente, le fond est
 *    rogné à la boîte intérieure (`background-clip: padding-box`) et une marge
 *    négative de la même largeur garde la mise en page · rien ne bouge à l'œil.
 *    La maquette compte les bordures dans la taille (`*{box-sizing:border-box}`)
 *    · la largeur et la hauteur posées ajoutent donc les deux bordures, sans
 *    quoi la piste serait écrasée d'autant.
 *
 * Les seuils · 44 px (WCAG 2.5.5, niveau AAA ; 44 pt des consignes Apple), le
 * plancher absolu à 24 px (WCAG 2.5.8, niveau AA). Ils valent À L'ÉCRAN · la
 * maquette zoome la vue de trois sections (`ZOOM_VUE_SECTION`), la valeur posée
 * y est divisée d'autant.
 */

export const CIBLE_TACTILE_PX = 44;
export const CIBLE_MINIMALE_PX = 24;

/**
 * Le zoom que `spatial.css` applique à la vue d'une section
 * (`body[data-sec=…] #win>.view{zoom:…}`) · 44 px posés dans la Veille n'en
 * font que 39,6 à l'écran. Recopié de la feuille, une garde web le relit.
 */
export const ZOOM_VUE_SECTION: Readonly<Record<string, number>> = { veille: 0.9, resultats: 0.95, bibliotheque: 0.95 };

/** La cible à poser (px CSS) pour qu'elle fasse `CIBLE_TACTILE_PX` à l'écran sous ce zoom. */
export function cibleSousZoom(zoom = 1): number {
  return Math.ceil(CIBLE_TACTILE_PX / (zoom > 0 ? zoom : 1));
}

/**
 * Ce qui est INTERACTIF · le même filtre que la mesure du banc. Une primitive
 * n'est touchée que si l'élément est interactif (`span.me` · un avatar affiché,
 * `.msg.me` · une bulle de conversation, ne le sont pas).
 */
export const SELECTEUR_INTERACTIF =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[role=switch],[role=checkbox],[role=radio],[role=menuitem]';

export type ModeCibleTactile = 'agrandir' | 'deborder';

export interface PrimitiveTactile {
  /** Sélecteur CSS de la primitive (classes de `spatial.css`). */
  selecteur: string;
  /** Ce que la maquette lui donne, mesuré au banc à 390 px · le défaut corrigé. */
  motif: string;
  mode: ModeCibleTactile;
  /** `deborder` · la largeur et la hauteur dessinées par `spatial.css` (px), et son rayon. */
  largeur?: number;
  hauteur?: number;
  rayon?: number;
  /** `agrandir` · des propriétés en plus (centrer un lien qui n'est pas une boîte flexible). */
  style?: Readonly<Record<string, string>>;
}

/**
 * Les champs de saisie de TEXTE · une case à cocher, un bouton radio, un
 * curseur ou un sélecteur de fichier ne grandissent pas (leur dessin natif se
 * déformerait) · ils vivent dans un `<label>` qui porte la cible.
 */
const CHAMPS_TEXTE = ['input:not([type])', ...['text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date'].map((t) => `input[type=${t}]`)].join(',');

/** Centrer le libellé d'un lien qui grandit (un `<a>` n'est pas centré verticalement par nature). */
const CENTRER: Readonly<Record<string, string>> = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

/**
 * Les primitives PARTAGÉES · chacune revient sur la plupart des écrans. Une
 * entrée = une classe de la maquette ; l'ordre ne compte pas.
 */
export const PRIMITIVES_TACTILES: readonly PrimitiveTactile[] = [
  { selecteur: '.btn', mode: 'agrandir', motif: 'bouton · `.btn.sm` 34 px, `.btn` 42 px, `.btn.icon` 42 px de large' },
  { selecteur: '.chip', mode: 'agrandir', motif: 'puce de filtre · 32 à 35 px' },
  { selecteur: '.seg a', mode: 'agrandir', style: CENTRER, motif: 'onglet de sous-navigation (`nav.seg.subnav`) · 33 px' },
  { selecteur: '.seg button', mode: 'agrandir', motif: 'segment de période ou de vue · 33 px' },
  { selecteur: '.bell', mode: 'agrandir', motif: 'cloche de l’en-tête · 40 × 40' },
  { selecteur: '.me', mode: 'agrandir', motif: 'avatar de l’en-tête (menu profil) · 38 × 38' },
  { selecteur: '.credit', mode: 'agrandir', motif: 'pastille de crédits de l’en-tête · 40 px' },
  { selecteur: '.sw2', mode: 'deborder', largeur: 44, hauteur: 26, rayon: 20, motif: 'interrupteur · piste de 44 × 26' },
  { selecteur: '.tg', mode: 'deborder', largeur: 46, hauteur: 28, rayon: 30, motif: 'interrupteur · piste de 46 × 28' },
  // Les champs et les contrôles-texte · les 19 cibles sous 24 px de la planche.
  { selecteur: 'select', mode: 'agrandir', motif: 'liste déroulante (tri, filtre, ton) · 38 à 40 px' },
  { selecteur: CHAMPS_TEXTE, mode: 'agrandir', motif: 'champ de saisie · 18 à 22 px posé dans une pilule (recherche, question à Jarvis), 36 à 40 sinon' },
  { selecteur: 'summary', mode: 'agrandir', style: { alignContent: 'center' }, motif: 'résumé dépliable (« Réglages avancés du produit ») · 16 à 18 px' },
  { selecteur: '.cfgm', mode: 'agrandir', motif: 'lien-bouton « Voir les 9 étapes » de la configuration · 14 px' },
  { selecteur: '.more', mode: 'agrandir', style: CENTRER, motif: 'lien « Tous les projets » / « Détail » d’un en-tête de section · 21 px' },
  { selecteur: '.dmore', mode: 'agrandir', motif: 'lien « Toutes les connexions » de la Bibliothèque · 20 px' },
  { selecteur: '.tnc', mode: 'deborder', largeur: 22, hauteur: 22, rayon: 6, motif: 'flèche « Replier » d’un dossier de l’arbre · 22 × 22, dessin gardé' },
  // Les onglets, listes et icônes propres à un écran · Studios, Fiche projet, Pubs du moment, Sauvegardes, Bibliothèque, Admin.
  { selecteur: '.pacts a', mode: 'agrandir', motif: 'geste « Itérer » d’une carte projet (Studios) · 30 × 30' },
  { selecteur: '.pacts button', mode: 'agrandir', motif: 'geste « Archiver » / « Restaurer » d’une carte projet (Studios) · 30 × 30' },
  { selecteur: '.pill', mode: 'agrandir', motif: 'pastille cliquable « Ouvrir la fiche », « Cibler Jarvis » (fiche projet) · 27 px' },
  { selecteur: '.xtabs button', mode: 'agrandir', motif: 'onglets « Toutes les pubs / Tendance / Suivies » (Pubs du moment) · 26 px' },
  { selecteur: '.xfc', mode: 'agrandir', motif: 'tri et filtres (Pubs du moment) · 29 à 31 px' },
  { selecteur: '.xi', mode: 'agrandir', motif: 'icône « Sauvegarder » d’une carte (Pubs du moment) · 32 × 32' },
  { selecteur: '.play', mode: 'agrandir', motif: 'lecture d’une vidéo sauvegardée · 46 px, 41 sous le zoom de la Veille' },
  { selecteur: '.colls nav button', mode: 'agrandir', motif: 'collections (Sauvegardes) · 35 px' },
  { selecteur: '.btabs button', mode: 'agrandir', motif: 'espaces « Assets de la marque / Créations » (Bibliothèque) · 38 px' },
  { selecteur: '.dsec button', mode: 'agrandir', motif: 'sections « Mon drive / Récents / Corbeille » (Bibliothèque) · 35 px' },
  { selecteur: '.crumb button', mode: 'agrandir', motif: 'fil d’Ariane du drive (Bibliothèque) · 27 px' },
  { selecteur: '.tnb', mode: 'agrandir', motif: 'dossier de l’arbre (Bibliothèque) · 31 px' },
  { selecteur: '.facts button', mode: 'agrandir', motif: 'case de sélection d’un dossier (Bibliothèque) · 28 × 28' },
  { selecteur: '.astrip-b', mode: 'agrandir', motif: 'retour à l’outil du bandeau Admin+ · 28 px' },
];

/** La largeur de bordure transparente qui porte une piste de `hauteur` px à la cible. */
export function debordTactile(hauteur: number, cible = CIBLE_TACTILE_PX): number {
  return Math.max(0, Math.ceil((cible - hauteur) / 2));
}

/**
 * Le style en ligne (propriétés React, camelCase) qu'une primitive reçoit au
 * téléphone, sous le zoom de la vue qui la contient (1 hors de la vue). Jamais de couleur visible ni de taille dessinée changée en mode
 * `deborder` · seule la zone qui reçoit le doigt grandit.
 */
export function styleCibleTactile(p: PrimitiveTactile, zoom = 1): Record<string, string> {
  const cible = cibleSousZoom(zoom);
  if (p.mode === 'agrandir') {
    return { minHeight: `${cible}px`, minWidth: `${cible}px`, ...(p.style ?? {}) };
  }
  const b = debordTactile(p.hauteur ?? 0, cible);
  return {
    // Boîte de bordure (`border-box`) · dessin + deux bordures.
    width: `${(p.largeur ?? 0) + 2 * b}px`,
    height: `${(p.hauteur ?? 0) + 2 * b}px`,
    borderWidth: `${b}px`,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundClip: 'padding-box',
    margin: `-${b}px`,
    // Le rayon extérieur porte la bordure · la boîte intérieure garde le rayon de la maquette.
    borderRadius: `${(p.rayon ?? 0) + b}px`,
  };
}
