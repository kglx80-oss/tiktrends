/**
 * ADSMAP · types partagés entre les invariants et le moteur de verdict.
 * Regroupés ici pour qu'une seule définition fasse foi : deux déclarations du
 * même enum finissent toujours par diverger.
 */

export type AdStatus = 'draft' | 'proposed' | 'ready' | 'live' | 'paused' | 'done';
export type AdType = 'ideation' | 'iteration' | 'imitation' | 'new';
export type VerdictValue = 'winner' | 'baby_winner' | 'loser' | 'inconclusive' | 'insufficient_delivery' | 'relative_winner';

/**
 * Le verdict EFFECTIF pour l'affichage et le décompte, selon sa comparabilité.
 *
 * ── Pourquoi ici, au plus près du type ───────────────────────────────────────
 *
 * Un verdict gagnant n'a de sens EN ABSOLU que si l'ad a eu une chance comparable
 * (protocole respecté). Un gagnant NON comparable — importé de l'ancien tableur,
 * ou retenu sans que le moteur ait tourné sur des métriques comparables — est un
 * historique DÉCLARÉ, pas une victoire prouvée. L'afficher « Gagnante » et le
 * compter comme un succès gonfle la certitude au moment où l'on crée, dépense ou
 * partage (CDC v7 · N02). On le RÉTROGRADE donc en « prometteuse relative » pour
 * l'affichage et le décompte · le verdict brut reste la provenance, montrée à part.
 *
 * La règle vit ici — pas dans verdict-carte ni verdict-libelle — pour que les
 * deux la partagent sans dépendance croisée.
 */
export function verdictEffectif(value: VerdictValue | null | undefined, comparable: boolean): VerdictValue | null {
  if (!value) return null;
  if (!comparable && (value === 'winner' || value === 'baby_winner')) return 'relative_winner';
  return value;
}
export type FunnelStage = 'hook' | 'hold' | 'click' | 'convert';
export type KillReason = 'hook' | 'click' | 'convert' | 'cost';
export type TestedVariable =
  | 'hook' | 'opening_visual' | 'body' | 'length' | 'cta' | 'format' | 'offer' | 'landing'
  | 'avatar_on_screen' | 'proof' | 'audio' | 'angle' | 'desire' | 'none_control';
