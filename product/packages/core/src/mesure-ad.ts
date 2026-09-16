/**
 * L'immuabilité d'une MESURE de pub · une note, une conformité, une lisibilité
 * ne valent que pour le TEXTE sur lequel elles ont été calculées.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * On peut réécrire les textes d'une pub sans régénérer l'image (l'overlay est
 * recomposé à la volée · aucun crédit). Mais la recette porte aussi la relecture
 * de Jarvis · score, conformité produit, lisibilité. Si on garde ces mesures en
 * changeant les mots, la grille affiche un score et un « texte lisible » calculés
 * sur d'AUTRES mots que ceux qu'on voit · une mesure en cachette, contraire à la
 * règle « une pub non relue reste en mesure » (déjà tenue pour les déclinaisons,
 * qui repartent sans le score du parent).
 *
 * ── Règle ────────────────────────────────────────────────────────────────────
 *
 * Quand un texte éditable change, on RETIRE la mesure · la pub redevient « en
 * mesure » jusqu'à une nouvelle relecture. Quand rien ne change (« Appliquer »
 * sans édition), on garde la mesure · elle décrit toujours ce qu'on voit.
 *
 * Pur, sans base ni modèle · testable.
 */

/** Les clés qui portent une MESURE d'une pub · calculées sur un texte donné. */
export const CLES_MESURE_AD = [
  'jarvisScore', 'copieConforme', 'produitFidele', 'ecartsProduit', 'texteLisible', 'problemesLisibilite',
] as const;

/** Les champs de texte éditables d'une pub · ceux dont un changement périme la mesure. */
export const CLES_TEXTE_AD = ['kicker', 'headline', 'subhead', 'cta', 'badge'] as const;

const norm = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Vrai si au moins un texte éditable diffère entre deux états de recette. */
export function texteAdModifie(avant: Record<string, unknown>, apres: Record<string, unknown>): boolean {
  return CLES_TEXTE_AD.some((k) => norm(avant[k]) !== norm(apres[k]));
}

/**
 * La recette débarrassée de toute mesure devenue caduque · une copie, sans les
 * clés de `CLES_MESURE_AD`. À appeler quand le texte change.
 */
export function sansMesure<T extends Record<string, unknown>>(rec: T): T {
  const copie = { ...rec };
  for (const k of CLES_MESURE_AD) delete copie[k];
  return copie;
}
