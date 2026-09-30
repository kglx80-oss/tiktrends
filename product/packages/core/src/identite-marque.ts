/**
 * L'identité visuelle d'une marque · ses deux sections ancrées, leurs libellés,
 * et l'ancrage qui les rend lisibles après un saut.
 *
 * ── Une seule source pour les libellés ───────────────────────────────────────
 *
 * Le rail « Marque », l'index de la fiche et les titres de section lisent les
 * MÊMES libellés · « Styles » (`#couleurs`) et « Brand kits » (`#charte`), les
 * mots demandés par Kevin. Chaque section porte un sous-titre qui dit ce qu'elle
 * CONTIENT réellement · couleurs et typographie d'un côté, logo, variantes et
 * style déduit de l'autre · un kit PAR marque (le pluriel nomme la rubrique, il
 * ne promet pas plusieurs kits). Les ancres `#couleurs` / `#charte` restent
 * stables · l'étape d'onboarding « Définir la charte » vise toujours `#charte`.
 *
 * ── L'ancrage, mesuré ────────────────────────────────────────────────────────
 *
 * La barre d'en-tête de l'app est COLLANTE (sticky, haut de fenêtre). Après un
 * saut d'ancre, l'index des sections restait au-dessus de la section atteinte ·
 * donc glissé SOUS l'en-tête, puces coupées (recette #710, et en production
 * après #709). L'index devient lui aussi collant, juste sous l'en-tête · il reste
 * à l'écran, entier. Les sections réservent en marge d'ancrage la hauteur de
 * l'en-tête + celle de la barre d'index + une respiration · leur titre tombe
 * sous l'index, jamais dessous.
 *
 * Mesuré en recette CDP (30/09, fiche marque, 1440×900 · 1280×720 · 390×844) :
 *   en-tête de l'app ............ 65 px aux trois largeurs
 *   index (une ligne de puces) .. 36,8 px (une seule ligne aux trois largeurs)
 * La barre d'index ajoute 10 px de marge haut et bas autour des puces.
 */

export interface SectionIdentite {
  /** Ancre stable dans la fiche (`#couleurs`, `#charte`). */
  id: 'couleurs' | 'charte';
  /** Libellé commun · rail, index, titre de section. */
  libelle: string;
  /** Ce que la section contient VRAIMENT · affiché sous le titre. */
  sousTitre: string;
  /** Icône du jeu partagé (`components/Icon`). */
  icone: 'palette' | 'layers';
}

export const SECTIONS_IDENTITE: readonly SectionIdentite[] = [
  { id: 'couleurs', libelle: 'Styles',     sousTitre: 'Couleurs et typographie de la marque · appliquées à chaque créa générée.', icone: 'palette' },
  { id: 'charte',   libelle: 'Brand kits', sousTitre: 'Le kit de cette marque · logo, variantes et style déduit du site, appliqués à tes pubs.', icone: 'layers' },
];

/** Hauteur mesurée de l'en-tête collant de l'app (px). */
export const HAUTEUR_ENTETE_APP = 65;
/** Marge verticale de la barre d'index autour des puces (px, haut et bas). */
export const MARGE_BARRE_INDEX = 10;
/** Hauteur mesurée d'une ligne de puces d'index (px). */
export const HAUTEUR_PUCES_INDEX = 37;
/** Respiration entre la barre d'index et le titre de section atteint (px). */
export const RESPIRATION_ANCRE = 12;

/** Hauteur de la barre d'index collante (puces + marges). */
export const HAUTEUR_BARRE_INDEX = HAUTEUR_PUCES_INDEX + 2 * MARGE_BARRE_INDEX;

/** Marge d'ancrage d'une section · son titre tombe SOUS l'en-tête ET l'index. */
export const MARGE_ANCRE_SECTION = HAUTEUR_ENTETE_APP + HAUTEUR_BARRE_INDEX + RESPIRATION_ANCRE;

/**
 * Seuil de la section ACTIVE (balayage par le haut) · une section est « celle où
 * je suis » dès que son haut a atteint sa position d'ancrage (+ une tolérance
 * d'arrondi). Plus bas que la marge d'ancrage, un saut vers une section ne
 * l'allumerait pas · c'est la cohérence clic → surlignage.
 */
export const SEUIL_SECTION_ACTIVE = MARGE_ANCRE_SECTION + 6;
