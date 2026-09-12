/**
 * La taille minimale d'une cible tactile · un bouton trop petit se rate au doigt,
 * et le parcours se paie en clics manqués sous volume.
 *
 * ── Le seuil, mesuré et non posé d'instinct ──────────────────────────────────
 *
 * Les repères publics : WCAG 2.5.8 (AA, 2.2) plancher à 24 px · WCAG 2.5.5 (AAA)
 * 44 px · Apple HIG 44 pt · Material 48 dp. On retient **40 px** comme minimum
 * maison : au-dessus du plancher AA, sous les cibles pleines des OS, et c'est le
 * seuil que le produit s'était fixé. Un carré plus petit doit être ÉLARGI (zone
 * cliquable centrée sur le minimum), pas forcément agrandi visuellement.
 */
export const CIBLE_TACTILE_MIN = 40;

/** Une cible est accessible si ses deux dimensions atteignent le minimum. */
export function cibleAccessible(largeur: number, hauteur: number, min = CIBLE_TACTILE_MIN): boolean {
  return largeur >= min && hauteur >= min;
}
