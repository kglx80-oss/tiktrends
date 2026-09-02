/**
 * Le cadrage demandé au modèle · il dépend de la coquille où l'image atterrit.
 *
 * ── Ce qui était demandé, et à qui ───────────────────────────────────────────
 *
 * Une seule consigne partait pour toutes les créas :
 *
 *   « garde le sujet dans les deux tiers hauts ; garde le tiers bas plus calme
 *     pour qu'un panneau de texte puisse s'y poser. »
 *
 * Elle décrit exactement UNE mise en page · l'immersive. Depuis qu'il y en a
 * quatre, elle est fausse pour trois d'entre elles :
 *
 * - le **champ de couleur** recadre l'image dans une carte à mi-hauteur · le
 *   tiers bas réservé est purement et simplement jeté ;
 * - la **moitié / moitié** ne garde que le haut · on demande de calmer une zone
 *   qui ne sera pas visible ;
 * - l'**affiche** met l'image en bas de page, sous un titre géant · réserver de
 *   la place pour un texte qui est ailleurs gâche la moitié du cadre.
 *
 * On payait donc une image composée pour une page qu'elle n'allait pas occuper.
 *
 * ── Ce que la consigne dit maintenant ────────────────────────────────────────
 *
 * Où sera l'image, ce qui la recadrera, et où le texte ne sera PAS. C'est la
 * seule chose que le modèle a besoin de savoir pour cadrer utile.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

import type { AdLayout } from './ad-layouts';

/**
 * Le rapport dans lequel l'image sera effectivement vue.
 *
 * Le modèle rend toujours du 4:5 · c'est la coquille qui recadre ensuite. Lui
 * dire ce que le recadrage gardera évite qu'il place le sujet dans la zone qui
 * sera coupée.
 */
const CADRE: Record<AdLayout, string> = {
  immersif:
    'The image fills the entire vertical frame and a text panel will be laid over its lower third. '
    + 'Keep the main subject in the upper two thirds; keep the lower third calmer and less busy.',
  champ:
    'The image will be cropped into a rounded card occupying the middle of the page, roughly square. '
    + 'Centre the main subject with comfortable margin on all four sides · anything near the top or bottom edge will be cut. '
    + 'No text will be laid over it, so the composition can be full and detailed.',
  split:
    'Only the TOP half of the image will be shown · the bottom half will be cut away entirely. '
    + 'Place the main subject in the upper half and let it read as a wide, horizontal composition. '
    + 'No text will be laid over it.',
  affiche:
    'The image sits at the bottom of a light poster, below a very large headline, as a wide horizontal band. '
    + 'Compose it as a clean, uncluttered product shot with generous empty space · it supports the type, it does not compete with it. '
    + 'Bright, airy lighting suits this layout; no text will be laid over the image.',
};

/**
 * La consigne de cadrage pour une coquille.
 *
 * Sans coquille connue — une passerelle, un clonage, une créa d'avant — on rend
 * celle de l'immersive. C'est la mise en page que ces créas recevront, et c'est
 * ce qui garde leur rendu identique.
 */
export function sceneFraming(layout?: AdLayout | null): string {
  return `Composition: ${CADRE[layout ?? 'immersif']} `
    + 'Vertical 4:5 framing, high-end commercial look, crisp focus, natural depth of field.';
}

/**
 * Le cadrage d'une scène qui servira PLUSIEURS coquilles.
 *
 * ── Pourquoi ça existe, et ce que ça coûte ───────────────────────────────────
 *
 * Un lot d'essai sur la mise en page compose la MÊME image dans quatre
 * coquilles · c'est ce qui rend la comparaison honnête, et c'est aussi ce qui
 * rend le lot presque gratuit, une seule image étant produite.
 *
 * Mais les quatre recadrages ne gardent pas la même zone. Une consigne taillée
 * pour l'une est fausse pour les trois autres.
 *
 * On demande donc l'intersection : sujet centré, marge confortable partout,
 * périphérie calme. C'est un COMPROMIS, pas un optimum · chaque coquille aurait
 * fait mieux avec sa consigne propre. Le dire ici évite qu'on s'étonne plus
 * tard qu'un essai de mise en page rende des images un peu plus sages.
 */
export function sceneFramingPolyvalent(): string {
  return 'Composition: the SAME image will be cropped several different ways · full frame, top half only, '
    + 'a centred square card, and a wide bottom band. Centre the main subject with generous margin on all '
    + 'four sides and keep the periphery calm and uncluttered, so that every one of those crops still reads. '
    + 'Vertical 4:5 framing, high-end commercial look, crisp focus, natural depth of field.';
}
