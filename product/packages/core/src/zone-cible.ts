import { CIBLE_TACTILE_MIN } from './cible-tactile';

/**
 * Une zone cliquable de 44 px SANS grossir le rendu (recette #106b).
 *
 * ── Le problème mesuré ───────────────────────────────────────────────────────
 *
 * Sur la fiche Marque (1280, Chrome), le lien « ‹ Marques » faisait 15 px de
 * haut, les onglets 40, les liens d'en-tête 37, le crayon « Renommer » 34. Les
 * grossir aurait changé une mise en page validée en recette visuelle.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * On ÉTEND la zone cliquable autour du visuel, sans déplacer ni agrandir ce
 * qu'on voit · l'élément reçoit un rembourrage transparent `haut`/`bas`, annulé
 * dans la mise en page par une marge négative de même valeur (ou porté par un
 * lien en ligne, dont le rembourrage vertical n'occupe pas de place). Le
 * manque est partagé moitié-moitié, sauf quand la place libre d'un côté est
 * bornée (un voisin cliquable ou peint par-dessus juste en dessous) · ce côté
 * prend ce qu'il peut, l'autre le reste. Jamais d'extension négative.
 *
 * Pur · ce module ne rend rien, il DÉCIDE les deux extensions. Un test les
 * vérifie au résultat (les nombres) et un test de rendu lit le HTML.
 */
export interface ExtensionCible {
  /** Rembourrage transparent ajouté au-dessus du visuel (px). */
  haut: number;
  /** Rembourrage transparent ajouté sous le visuel (px). */
  bas: number;
}

export function extensionCible(
  hauteurVisuelle: number,
  { libreHaut = Infinity, libreBas = Infinity, cible = CIBLE_TACTILE_MIN }: { libreHaut?: number; libreBas?: number; cible?: number } = {},
): ExtensionCible {
  const manque = Math.max(0, Math.ceil(cible - hauteurVisuelle));
  if (manque === 0) return { haut: 0, bas: 0 };
  let bas = Math.min(Math.floor(manque / 2), Math.max(0, libreBas));
  let haut = manque - bas;
  if (haut > libreHaut) { haut = Math.max(0, libreHaut); bas = Math.min(manque - haut, Math.max(0, libreBas)); }
  return { haut, bas };
}

/**
 * Hauteurs VISUELLES mesurées sur la fiche Marque (Chrome, 1440 · 1280×720 ·
 * 390, identiques aux trois largeurs) et la place libre mesurée sous chacune ·
 * la source des extensions, plutôt qu'un nombre posé de tête.
 *
 * | Élément               | visuel | libre dessous                       |
 * | --------------------- | ------ | ----------------------------------- |
 * | « ‹ Marques »         | 15     | 10 (marge avant l'en-tête)          |
 * | onglet                | 40     | 0  (le soulignement tient au filet) |
 * | lien d'en-tête (pill) | 37     | 4  (rangée de 46 centrée)           |
 * | crayon « Renommer »   | 34     | 0  (le sous-titre colle à la rangée) |
 */
export const FICHE_MARQUE_MESURES = {
  retour: { visuel: 15, libreBas: 10 },
  onglet: { visuel: 40, libreBas: 0 },
  lienEntete: { visuel: 37, libreBas: 4 },
  // Sous le crayon · le sous-titre (« Profil à compléter ») colle à la rangée ·
  // mesuré · zone 40 avec 5/5 · on étend vers le haut (marge libre de 10).
  renommer: { visuel: 34, libreBas: 0 },
} as const;
