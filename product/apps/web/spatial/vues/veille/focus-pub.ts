/**
 * Lot 7 V5 · rendre le focus à la pub qui a ouvert le détail · module SANS
 * « use client » (un module client n'exporte que composants, hooks et types ·
 * garde `spatial-fondation`), importé par la carte et par les listes.
 */

/** L'attribut qui désigne le bouton d'ouverture du détail d'une pub · le focus y revient à la fermeture. */
export const ATTR_OUVRIR_DETAIL = 'data-ouvrir-detail';

/** Rendre le focus au bouton qui a ouvert le détail de CETTE pub (`cle`), au rendu suivant. */
export function rendreFocusPub(cle: string) {
  setTimeout(() => {
    const cible = [...document.querySelectorAll<HTMLElement>(`[${ATTR_OUVRIR_DETAIL}]`)].find((e) => e.getAttribute(ATTR_OUVRIR_DETAIL) === cle);
    cible?.focus();
  }, 0);
}

