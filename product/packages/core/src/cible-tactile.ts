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

/** Une cible est accessible si ses deux dimensions atteignent le minimum. */
export function cibleAccessible(largeur: number, hauteur: number, min = CIBLE_TACTILE_MIN): boolean {
  return largeur >= min && hauteur >= min;
}
