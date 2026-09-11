/**
 * Le verdict du marché, ramené sur la carte de la créa.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Chaque créa générée peut être suivie dans ADSMAP · elle y reçoit, une fois
 * lancée et mesurée, un verdict tiré des vrais chiffres (`computeVerdict`). Ce
 * verdict — « a-t-elle gagné ? », la seule question qui décide de l'itération —
 * vivait en base et n'était lu QUE dans les analyses ADSMAP et admin. Sur la
 * carte du Studio, là où l'on itère, il était absent. On voyait la prédiction
 * (le score Jarvis) et la relecture (la copie), jamais le résultat payé.
 *
 * ── Ce que ce fichier décide, et ce qu'il ne décide pas ──────────────────────
 *
 * Il traduit un état de base (suivie ? verdict arbitré ? lequel) en un état
 * d'affichage nommé, avec un libellé court et un ton. Rien d'autre · pas de
 * couleur, pas de badge, pas de requête. La règle est pure, un test l'exerce.
 *
 * ── Deux prudences ───────────────────────────────────────────────────────────
 *
 * 1. **Un verdict non arbitré ne se montre pas comme un verdict.** La table
 *    range un `computed` (provisoire, il peut bouger) et un `validated` (arbitré).
 *    L'attribution ne compte que le second · la carte fait pareil. Un calcul
 *    provisoire s'affiche « en mesure », pas « a perdu » · annoncer une défaite
 *    qui n'est pas tranchée serait mentir, et dans le mauvais sens.
 *
 * 2. **Suivie sans verdict = en mesure, pas rien.** Une créa poussée dans la
 *    carte mais pas encore tranchée a un état à elle · c'est ce qui distingue
 *    « lancée, on attend » de « jamais suivie ». Non suivie ne rend aucun état ·
 *    la carte propose déjà de la suivre, inutile de le répéter en badge.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { VerdictValue } from './types';

/** L'état d'affichage du verdict sur une carte · fermé, donc traduisible. */
export type EtatVerdictCarte =
  | 'gagnante'
  | 'petite_gagnante'
  | 'gagnante_relative'
  | 'perdante'
  | 'non_concluant'
  | 'diffusion_faible'
  | 'en_mesure';

export interface EtatVerdictSource {
  /** La créa est-elle rattachée à une ad ADSMAP (un `adsmapAdId` a été posé). */
  suivie: boolean;
  /** Le verdict le plus abouti connu · `null` quand aucun n'a été calculé. */
  verdict: VerdictValue | null;
  /** Ce verdict est-il ARBITRÉ (`validated`) · un `computed` seul ne l'est pas. */
  arbitre: boolean;
}

/**
 * L'état à montrer, ou `null` quand il n'y a rien à dire (créa non suivie).
 */
export function etatVerdictCarte(s: EtatVerdictSource): EtatVerdictCarte | null {
  if (!s.suivie) return null;
  // Suivie mais pas de verdict arbitré · on attend la mesure. Un `computed`
  // provisoire tombe ici aussi : il n'a pas tranché.
  if (!s.arbitre || !s.verdict) return 'en_mesure';
  switch (s.verdict) {
    case 'winner': return 'gagnante';
    case 'baby_winner': return 'petite_gagnante';
    case 'relative_winner': return 'gagnante_relative';
    case 'loser': return 'perdante';
    case 'insufficient_delivery': return 'diffusion_faible';
    case 'inconclusive': return 'non_concluant';
  }
}

/** Le ton d'un état · décide de la couleur sans la nommer ici. */
export type TonVerdictCarte = 'win' | 'lose' | 'neutre' | 'attente';

export const VERDICT_CARTE: Record<EtatVerdictCarte, { court: string; ton: TonVerdictCarte }> = {
  gagnante: { court: 'A gagné', ton: 'win' },
  petite_gagnante: { court: 'Gagne · à itérer', ton: 'win' },
  gagnante_relative: { court: 'Gagne (relatif)', ton: 'win' },
  perdante: { court: 'A perdu', ton: 'lose' },
  non_concluant: { court: 'Non concluant', ton: 'neutre' },
  diffusion_faible: { court: 'Diffusion trop faible', ton: 'neutre' },
  en_mesure: { court: 'En mesure', ton: 'attente' },
};
