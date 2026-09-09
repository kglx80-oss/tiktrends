/**
 * Mesurer le seuil « éprouvé » au lieu de le poser d'instinct.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * `PROVEN_DAYS = 21` est un chiffre rond, écrit de tête · exactement ce que la
 * doctrine du dépôt interdit : « les valeurs écrites de tête se sont révélées
 * fausses de moitié à trois reprises ». On ne le change PAS ici · on construit
 * l'instrument qui permettra de le décider sur la donnée, avec de la marge.
 *
 * Ce module ne fait que de l'arithmétique sur une liste d'âges (les
 * `daysRunning` des créas concurrentes déjà vues). L'écran admin lui passe la
 * donnée réelle · le module reste pur, donc testable.
 *
 * ── Deux règles de la doctrine, appliquées ───────────────────────────────────
 *
 * • « Comparer à la référence, jamais à zéro » et « minimum d'effectif avant
 *   qu'un groupe ait le droit de parler » · sous un effectif plancher, on se
 *   TAIT (`recommande: null`). Le silence est une conclusion valable.
 * • « Choisir avec de la marge » · la recommandation est le premier palier où il
 *   ne reste que la MINORITÉ persistante (part au-delà ≤ seuil de minorité), pas
 *   le point exact de bascule.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/** Un palier de la courbe · combien de créas atteignent cet âge, et quelle part. */
export interface PalierSurvie {
  jour: number;
  /** Combien de créas ont un âge ≥ `jour`. */
  effectif: number;
  /** Part du total au-delà de ce seuil · 0..1. */
  partAuDela: number;
}

export interface AnalyseSurvie {
  effectifTotal: number;
  /** Âges de rupture · p50, p75, p90 de `daysRunning`. */
  mediane: number;
  p75: number;
  p90: number;
  /** La courbe, sur une grille de seuils lisibles. */
  paliers: PalierSurvie[];
  /** Le seuil mesuré, avec marge · null quand la donnée n'a pas le droit de parler. */
  recommande: number | null;
  /** Ce qui explique la recommandation, ou le silence. */
  raison: string;
}

/** La grille de seuils qu'on mesure · lisible, pas trop dense. */
export const SEUILS_SURVIE = [7, 14, 21, 28, 35, 42, 60, 90];
/** Sous cet effectif total, on se tait · un taux sur trop peu de créas ne dit rien. */
export const EFFECTIF_PLANCHER = 40;
/** Le seuil « éprouvé » est là où il ne reste que cette part du marché, au plus. */
export const PART_MINORITE = 0.2;
/** Et la cohorte survivante doit compter au moins ça pour avoir le droit de parler. */
export const COHORTE_MIN = 10;

function quantile(triees: number[], q: number): number {
  if (triees.length === 0) return 0;
  const pos = q * (triees.length - 1);
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  if (bas === haut) return triees[bas]!;
  return Math.round(triees[bas]! + (pos - bas) * (triees[haut]! - triees[bas]!));
}

export function analyseSurvie(joursBruts: number[]): AnalyseSurvie {
  const jours = joursBruts.filter((j) => Number.isFinite(j) && j >= 0).sort((a, b) => a - b);
  const effectifTotal = jours.length;

  const paliers: PalierSurvie[] = SEUILS_SURVIE.map((jour) => {
    const effectif = jours.filter((j) => j >= jour).length;
    return { jour, effectif, partAuDela: effectifTotal ? effectif / effectifTotal : 0 };
  });

  if (effectifTotal < EFFECTIF_PLANCHER) {
    return {
      effectifTotal, mediane: quantile(jours, 0.5), p75: quantile(jours, 0.75), p90: quantile(jours, 0.9),
      paliers, recommande: null,
      raison: `Effectif insuffisant (${effectifTotal} < ${EFFECTIF_PLANCHER}) · le silence est une conclusion valable. Continue d'accumuler des créas décrites.`,
    };
  }

  // Le premier palier où il ne reste que la minorité persistante, ET où cette
  // cohorte est assez nombreuse pour parler.
  const candidat = paliers.find((p) => p.partAuDela <= PART_MINORITE && p.effectif >= COHORTE_MIN);

  if (!candidat) {
    return {
      effectifTotal, mediane: quantile(jours, 0.5), p75: quantile(jours, 0.75), p90: quantile(jours, 0.9),
      paliers, recommande: null,
      raison: `Aucun palier clair · aucun seuil ne laisse une minorité persistante d'au moins ${COHORTE_MIN} créas. Élargir la grille ou attendre plus de données.`,
    };
  }

  return {
    effectifTotal, mediane: quantile(jours, 0.5), p75: quantile(jours, 0.75), p90: quantile(jours, 0.9),
    paliers, recommande: candidat.jour,
    raison: `À ${candidat.jour} j, il ne reste que ${Math.round(candidat.partAuDela * 100)} % du marché (${candidat.effectif} créas) · c'est la minorité qui tient. Choisir ce seuil, ou juste au-dessus pour la marge.`,
  };
}
