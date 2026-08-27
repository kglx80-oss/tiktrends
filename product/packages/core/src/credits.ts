/** Crédits & ledger (CDC §F14). 1 crédit = coût API réel × 3. Report 25 %. */
export type CreditAction =
  | 'tag_video' | 'tag_image' | 'transcription_min' | 'script' | 'brief'
  | 'image' | 'review_mining' | 'report' | 'clone_image' | 'chat' | 'video' | 'suggest' | 'score';

export const CREDIT_COSTS: Record<CreditAction, number> = {
  tag_video: 2, tag_image: 1, transcription_min: 1, script: 3, brief: 5,
  image: 4, review_mining: 20, report: 6, clone_image: 5, chat: 1, video: 20,
  suggest: 1, // suggestion IA courte (angle, brief image/vidéo)
  score: 2,   // Score Jarvis (évaluation performance d'une créa)
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

/* ============ Allocation d'abonnement ============ */

export interface PlanAllocation {
  next: number;       // nouveau solde
  delta: number;      // mouvement à écrire au grand livre (peut être négatif)
  purchased: number;  // crédits achetés (recharges) conservés
}

/**
 * Nouveau solde après application de l'allocation d'une formule.
 *
 * Les crédits d'abonnement NE SE CUMULENT PAS d'un mois sur l'autre, mais les
 * recharges payées, si. Poser bêtement `solde = allocation` détruisait donc les
 * recharges à chaque renouvellement · un client ayant acheté 5 000 crédits en plus
 * de son offre les perdait le mois suivant.
 *
 * On retire du solde l'allocation précédemment accordée (`lastPlanCredits`) : ce
 * qui dépasse, ce sont les crédits achetés. On y ajoute la nouvelle allocation.
 *
 * Sert au renouvellement Stripe, au changement de formule et au pilotage interne.
 */
export function applyPlanAllocation(balance: number, lastPlanCredits: number, alloc: number): PlanAllocation {
  const bal = Math.max(0, balance || 0);
  const purchased = Math.max(0, bal - Math.max(0, lastPlanCredits || 0));
  const next = purchased + Math.max(0, alloc || 0);
  return { next, delta: next - bal, purchased };
}
