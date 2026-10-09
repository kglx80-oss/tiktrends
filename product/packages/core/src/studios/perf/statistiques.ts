/**
 * Studios · L8-C · résumé d'une série de tirages chronométrés.
 *
 * Pur. Le chronomètre vit chez l'appelant (test, script) ; ici on ne fait que
 * résumer des durées en millisecondes. Centile au RANG LE PLUS PROCHE (sans
 * interpolation) : sur 20 tirages, le p95 est le 19e plus court, une valeur
 * réellement observée.
 */

export interface ResumeTirages { n: number; medianeMs: number; p95Ms: number; maxMs: number }

/** Centile `q` (0 < q ≤ 1) au rang le plus proche · `NaN` sur une série vide. */
export function centile(valeurs: readonly number[], q: number): number {
  if (valeurs.length === 0) return Number.NaN;
  const tri = [...valeurs].sort((a, b) => a - b);
  const rang = Math.min(tri.length, Math.max(1, Math.ceil(q * tri.length)));
  return tri[rang - 1]!;
}

const arrondi = (x: number) => Math.round(x * 100) / 100;

export function resumerTirages(valeurs: readonly number[]): ResumeTirages {
  return {
    n: valeurs.length,
    medianeMs: arrondi(centile(valeurs, 0.5)),
    p95Ms: arrondi(centile(valeurs, 0.95)),
    maxMs: arrondi(valeurs.length ? Math.max(...valeurs) : Number.NaN),
  };
}
