/**
 * Le barème du Score Jarvis · un seul découpage, partout.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le même score sur cent se lisait différemment selon l'écran · la pastille
 * d'une vignette coupait à 75/55, la carte de détail à 80/60/45, l'analyse
 * concurrentielle à 75/45, l'anneau Jarvis à 80. Une créa à 58 était « à itérer »
 * ici, « moyenne » là, « modérée » ailleurs · le même chiffre, trois verdicts.
 *
 * Le barème est une décision produit, pas un réglage d'affichage · il vit donc
 * ici, une fois, et chaque écran le lit. Trois paliers, décidés par le
 * propriétaire : gagnant ≥ 75, à itérer 55-74, à jeter < 55.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

export type NiveauScore = 'fort' | 'correct' | 'faible';

/** Les bornes, une seule fois · gagnant ≥ 75, à itérer ≥ 55, à jeter en dessous. */
export const SEUIL_FORT = 75;
export const SEUIL_CORRECT = 55;

/** Dans quel palier tombe un score sur cent. */
export function niveauScore(score: number): NiveauScore {
  if (score >= SEUIL_FORT) return 'fort';
  if (score >= SEUIL_CORRECT) return 'correct';
  return 'faible';
}

/** Ce qu'on en dit à l'écran · une étiquette par palier. */
export const LABEL_NIVEAU: Record<NiveauScore, string> = {
  fort: 'Élevée',
  correct: 'Modérée',
  faible: 'Faible',
};

/** La couleur du palier · vert / orange / rouge, cohérente d'un écran à l'autre. */
export const COULEUR_NIVEAU: Record<NiveauScore, string> = {
  fort: '#18cc8c',
  correct: '#f5a623',
  faible: '#ff4d6d',
};
