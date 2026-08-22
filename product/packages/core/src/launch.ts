/** Règles auto-scale / auto-pause (CDC §F13). Validation humaine par défaut. */
export interface LaunchSignal {
  convGrade: 'A' | 'B' | 'C' | 'D';
  daysAtGradeD: number;
  spend: number;
  bucket: string;
}
/** Auto-pause : conv = D pendant N jours ET spend > 3× CPA cible. */
export function shouldAutoPause(s: LaunchSignal, cpaTarget: number, minDays = 3): boolean {
  return s.convGrade === 'D' && s.daysAtGradeD >= minDays && s.spend >= 3 * cpaTarget;
}
export interface ScaleSuggestion { action: 'scale'; budgetDeltaPct: number; requiresHumanApproval: boolean; }
export function suggestScale(bucket: string): ScaleSuggestion | null {
  return bucket === 'winner' ? { action: 'scale', budgetDeltaPct: 20, requiresHumanApproval: true } : null;
}
