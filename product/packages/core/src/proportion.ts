/**
 * La part d'une valeur par rapport à un maximum · pour rendre un chiffre nu
 * lisible d'un coup d'œil (une barre proportionnée vaut mieux qu'un nombre isolé).
 *
 * Bornée à [0, 1] et sûre quand le maximum est nul ou absurde · une largeur de
 * barre ne doit jamais déborder ni devenir NaN. Pur : aucune dépendance.
 */
export function partDeMax(valeur: number, max: number): number {
  if (!Number.isFinite(valeur) || !Number.isFinite(max) || max <= 0) return 0;
  const p = valeur / max;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
