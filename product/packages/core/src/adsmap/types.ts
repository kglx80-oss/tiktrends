/**
 * ADSMAP · types partagés entre les invariants et le moteur de verdict.
 * Regroupés ici pour qu'une seule définition fasse foi : deux déclarations du
 * même enum finissent toujours par diverger.
 */

export type AdStatus = 'draft' | 'proposed' | 'ready' | 'live' | 'paused' | 'done';
export type AdType = 'ideation' | 'iteration' | 'imitation' | 'new';
export type VerdictValue = 'winner' | 'baby_winner' | 'loser' | 'inconclusive' | 'insufficient_delivery' | 'relative_winner';
export type FunnelStage = 'hook' | 'hold' | 'click' | 'convert';
export type KillReason = 'hook' | 'click' | 'convert' | 'cost';
export type TestedVariable =
  | 'hook' | 'opening_visual' | 'body' | 'length' | 'cta' | 'format' | 'offer' | 'landing'
  | 'avatar_on_screen' | 'proof' | 'audio' | 'angle' | 'desire' | 'none_control';
