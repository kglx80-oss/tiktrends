/** Statut d'une période d'essai / compte de test (crédits avec période). */
export interface TrialStatus { isTrial: boolean; expired: boolean; daysLeft: number | null }

export function trialStatus(w: { trialEndsAt: Date | string | null | undefined; accountKind?: string | null }, now = Date.now()): TrialStatus {
  const end = w.trialEndsAt ? new Date(w.trialEndsAt).getTime() : null;
  const isTrial = !!end || w.accountKind === 'beta' || w.accountKind === 'staff';
  if (!end) return { isTrial, expired: false, daysLeft: null };
  const ms = end - now;
  return { isTrial: true, expired: ms <= 0, daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)) };
}

export const TRIAL_DEFAULT_DAYS = 14;
export const TRIAL_DEFAULT_CREDITS = 3000; // nouvelle unité (÷ 10) · les 300 d'avant ×10
