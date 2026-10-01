/**
 * La taille minimale d'une cible tactile · un bouton trop petit se rate au doigt,
 * et le parcours se paie en clics manqués sous volume.
 *
 * ── Le seuil, mesuré et non posé d'instinct ──────────────────────────────────
 *
 * Les repères publics : WCAG 2.5.8 (AA, 2.2) plancher à 24 px · WCAG 2.5.5 (AAA)
 * 44 px · Apple HIG 44 pt · Material 48 dp. La charte validée (design.md) retient
 * **44 px** · l'exigence AAA et Apple HIG. Un carré plus petit doit être ÉLARGI
 * (zone cliquable effective centrée sur le minimum), pas forcément agrandi
 * visuellement · une icône peut rester petite dans un bouton de 44.
 */
export const CIBLE_TACTILE_MIN = 44;

/**
 * Plancher au pointeur FIN (souris) · WCAG 2.5.8 (AA). Une liste dense en
 * desktop peut y descendre ; au doigt, jamais sous `CIBLE_TACTILE_MIN`.
 */
export const CIBLE_POINTEUR_FIN_MIN = 24;

/**
 * La hauteur minimale d'une cible selon le pointeur · 44 au doigt (tactile ou
 * écran étroit), 24 à la souris, pour garder la densité desktop. Mesuré en
 * recette A (#120) · les en-têtes de catégorie de la feuille de route des
 * connexions faisaient 24 px partout, téléphone compris.
 */
export function cibleSelonPointeur(tactile: boolean): number {
  return tactile ? CIBLE_TACTILE_MIN : CIBLE_POINTEUR_FIN_MIN;
}

/** Une cible est accessible si ses deux dimensions atteignent le minimum. */
export function cibleAccessible(largeur: number, hauteur: number, min = CIBLE_TACTILE_MIN): boolean {
  return largeur >= min && hauteur >= min;
}
