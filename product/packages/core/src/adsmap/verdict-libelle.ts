/**
 * Le libellé, le ton et la limite d'un verdict de marché · SOURCE UNIQUE.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Le même verdict portait trois libellés selon l'écran (« Gagnante », « Gagnante
 * (relatif) », « Gagne (relatif) ») et des couleurs différentes · la table, le
 * canvas, le tiroir et le partage recopiaient chacun leur carte. Une gagnante
 * RELATIVE (elle a battu ses voisines, mais sans seuil absolu tranché · souvent
 * sans CPA) s'affichait en ton de victoire et se comptait comme gagnante. Le CDC
 * v6 (R01) l'interdit · la certitude gonfle d'un écran à l'autre au moment où
 * l'on s'apprête à créer, dépenser ou partager.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Un seul qualificatif par verdict, partout. La relative est PROMETTEUSE, pas
 * gagnée · ton neutre, limite dite en clair. Le décompte des gagnantes et le
 * taux de réussite ne portent que sur les verdicts ÉVALUÉS au protocole absolu
 * (gagnante, petite gagnante, perdante) · la relative et les non-concluants en
 * sont exclus, avec leurs exclusions explicites.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { verdictEffectif, type VerdictValue } from './types';
import type { TonVerdictCarte } from './verdict-carte';

export interface LibelleVerdict {
  /** Libellé court, pour un badge. */
  court: string;
  /** Ton d'affichage (décide de la couleur ailleurs, sans la nommer ici). */
  ton: TonVerdictCarte;
  /** Limite à dire en clair (nom accessible), quand la preuve est partielle. */
  note?: string;
}

/** Le qualificatif de chaque verdict · la seule carte, tous écrans. */
export const LIBELLE_VERDICT: Record<VerdictValue, LibelleVerdict> = {
  winner: { court: 'Gagnante', ton: 'win' },
  baby_winner: { court: 'Gagnante naissante', ton: 'win' },
  // Prometteuse, pas gagnée · la limite est portée, pas seulement suggérée.
  relative_winner: { court: 'Prometteuse · relatif', ton: 'neutre', note: 'comparaison relative seulement, sans seuil absolu' },
  loser: { court: 'Perdante', ton: 'lose' },
  inconclusive: { court: 'Non concluant', ton: 'neutre' },
  insufficient_delivery: { court: 'Sous-diffusée', ton: 'neutre' },
};

/**
 * Les gagnantes ÉVALUÉES au protocole absolu · ce qui a le droit de compter
 * comme un succès. La relative n'en est pas (comparaison relative seulement).
 */
export const GAGNANTES_ABSOLUES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner']);

/**
 * Les verdicts ÉVALUABLES au protocole absolu · le dénominateur d'un taux de
 * réussite honnête (une perdante est évaluée, elle a été mesurée et a perdu).
 * En sont exclus : la relative (non évaluée en absolu), le non-concluant et la
 * sous-diffusée (pas de verdict exploitable).
 */
export const EVALUABLES_ABSOLU: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner', 'loser']);

/** Vrai si `v` compte comme un succès évalué (gagnante ou petite gagnante). */
export function estGagnanteAbsolue(v: VerdictValue | null | undefined): boolean {
  return !!v && GAGNANTES_ABSOLUES.has(v);
}

/**
 * Vrai si le verdict est un succès VALIDÉ PAR PROTOCOLE · gagnante ou petite
 * gagnante ET comparable. Un gagnant non comparable (historique déclaré, importé)
 * n'en est pas · c'est ce gate qu'il faut pour « Cette créa gagne », le partage
 * et le décompte, jamais `estGagnanteAbsolue` seul (qui ignore la comparabilité).
 */
export function estGagnanteValidee(v: VerdictValue | null | undefined, comparable: boolean): boolean {
  return comparable && !!v && GAGNANTES_ABSOLUES.has(v);
}

export interface TauxReussite {
  /** Le taux, ou `null` quand aucun test n'est évaluable (« Non calculable »). */
  taux: number | null;
  /** Numérateur · gagnantes évaluées en absolu. */
  succes: number;
  /** Dénominateur · tests évaluables en absolu. */
  evaluables: number;
  /** Prometteuses (relatives) · montrées à part, jamais dans le taux. */
  prometteuses: number;
  /** Exclus du taux faute de verdict évaluable (non-concluant, sous-diffusé, en mesure). */
  exclus: number;
}

/**
 * Le taux de réussite honnête · VALIDÉ PAR PROTOCOLE. Numérateur, dénominateur et
 * exclusions explicites. `taux` est `null` (« Non calculable ») quand rien n'est
 * évaluable · jamais 0 %, qui ferait croire à un échec mesuré.
 *
 * La comparabilité décide · un verdict n'entre au dénominateur que s'il a été
 * évalué au protocole (`comparable`). Un gagnant NON comparable (historique
 * déclaré, importé) est RÉTROGRADÉ en prometteuse · il ne compte ni comme succès
 * ni comme évaluable. C'est ce qui sépare le taux déclaré du taux validé (CDC v7
 * · N02) · sans mesure admissible, on n'affiche aucun taux de réussite validée.
 * Une valeur `null`/absente compte comme « en mesure » (exclue).
 */
export function tauxReussite(verdicts: ReadonlyArray<{ value: VerdictValue | null | undefined; comparable: boolean }>): TauxReussite {
  let succes = 0, evaluables = 0, prometteuses = 0, exclus = 0;
  for (const { value, comparable } of verdicts) {
    const eff = verdictEffectif(value, comparable);
    if (comparable && eff && EVALUABLES_ABSOLU.has(eff)) {
      evaluables++;
      if (GAGNANTES_ABSOLUES.has(eff)) succes++;
    } else if (eff === 'relative_winner') {
      prometteuses++;
    } else {
      exclus++;
    }
  }
  return { taux: evaluables ? succes / evaluables : null, succes, evaluables, prometteuses, exclus };
}

/**
 * Le mot unique pour un taux non mesurable · « Non calculable », jamais « 0 % »
 * qui ferait croire à un échec mesuré. Une seule source pour tous les écrans ·
 * Adsmap et Jarvis doivent dire le même mot du même vide (CDC v7 · N02).
 */
export const TAUX_NON_CALCULABLE = 'Non calculable';

/** Un taux (fraction 0..1) mis en toutes lettres · `null` → « Non calculable ». */
export function libelleTauxFraction(taux: number | null): string {
  return taux === null ? TAUX_NON_CALCULABLE : `${Math.round(taux * 100)} %`;
}

/**
 * Le pré-score d'un concept · CDC v8 · R04.
 *
 * « X % de réussite ATTENDUE » se lisait comme un engagement chiffré · un chiffre
 * calculé sur l'historique posé comme une promesse sur CETTE créa. Le pré-score
 * est une estimation lue sur les tests passés, et c'est le test à venir qui la
 * tranche. On le dit dans le libellé même · le fragment porte son statut
 * (estimation) et son ancrage (les tests passés), et la réserve dit ce qui le
 * confirme. Source unique du fragment · les deux générateurs de synthèse (avis
 * de pré-lancement, mémoire Jarvis) doivent le dire à l'identique.
 */
export const RESERVE_ESTIMATION = 'estimation à confirmer par le test';

/** La part de réussite estimée d'un concept, dite comme une estimation. */
export function reussiteEstimee(pConclusiveWin: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, pConclusiveWin)) * 100);
  return `${pct} % de réussite estimée au vu des tests passés`;
}
