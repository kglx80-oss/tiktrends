import { describe, it, expect } from 'vitest';
import { shouldAutoPause, suggestScale } from '../src/launch';
describe('launch (§F13)', () => {
  it('auto-pause si conv D, >= 3 j, spend > 3x CPA', () => {
    expect(shouldAutoPause({ convGrade: 'D', daysAtGradeD: 4, spend: 400, bucket: 'kill_candidate' }, 100)).toBe(true);
    expect(shouldAutoPause({ convGrade: 'D', daysAtGradeD: 2, spend: 400, bucket: 'iteration' }, 100)).toBe(false);
  });
  it('suggère un scale +20% pour un winner (validation humaine)', () => {
    const s = suggestScale('winner');
    expect(s?.budgetDeltaPct).toBe(20);
    expect(s?.requiresHumanApproval).toBe(true);
    expect(suggestScale('iteration')).toBeNull();
  });
});
