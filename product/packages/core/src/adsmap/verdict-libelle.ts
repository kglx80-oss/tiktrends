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

import type { VerdictValue } from './types';
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
 * Le taux de réussite honnête d'un ensemble de verdicts · numérateur,
 * dénominateur et exclusions explicites. `taux` est `null` (« Non calculable »)
 * quand rien n'est évaluable · jamais 0 %, qui ferait croire à un échec mesuré.
 * Une valeur `null`/absente compte comme « en mesure » (exclue).
 */
export function tauxReussite(verdicts: ReadonlyArray<VerdictValue | null | undefined>): TauxReussite {
  let succes = 0, evaluables = 0, prometteuses = 0, exclus = 0;
  for (const v of verdicts) {
    if (v && EVALUABLES_ABSOLU.has(v)) {
      evaluables++;
      if (GAGNANTES_ABSOLUES.has(v)) succes++;
    } else if (v === 'relative_winner') {
      prometteuses++;
    } else {
      exclus++;
    }
  }
  return { taux: evaluables ? succes / evaluables : null, succes, evaluables, prometteuses, exclus };
}
