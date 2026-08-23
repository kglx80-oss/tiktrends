/** Crédits & ledger (CDC §F14). 1 crédit = coût API réel × 3. Report 25 %. */
export type CreditAction =
  | 'tag_video' | 'tag_image' | 'transcription_min' | 'script' | 'brief'
  | 'image' | 'review_mining' | 'report' | 'clone_image' | 'chat' | 'video';

export const CREDIT_COSTS: Record<CreditAction, number> = {
  tag_video: 2, tag_image: 1, transcription_min: 1, script: 3, brief: 5,
  image: 4, review_mining: 20, report: 5, clone_image: 5, chat: 1, video: 12,
};

export function costFor(action: CreditAction, units = 1): number {
  return CREDIT_COSTS[action] * Math.max(1, Math.ceil(units));
}
export function canAfford(balance: number, action: CreditAction, units = 1): boolean {
  return balance >= costFor(action, units);
}
export interface LedgerEntry { delta: number; reason: string; refId?: string; }
export function applyLedger(balance: number, entries: LedgerEntry[]): number {
  return entries.reduce((b, e) => b + e.delta, balance);
}
/** Report partiel : 25 % des crédits non utilisés en fin de cycle. */
export function computeRollover(unused: number): number {
  return Math.floor(Math.max(0, unused) * 0.25);
}
