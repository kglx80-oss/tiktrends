import { describe, it, expect } from 'vitest';
import { costFor, canAfford, applyLedger, computeRollover } from '../src/credits';
describe('crédits (§F14)', () => {
  it('coût par action (unités)', () => {
    expect(costFor('tag_video')).toBe(2);
    expect(costFor('image', 4)).toBe(16);
    expect(costFor('transcription_min', 2.4)).toBe(3); // arrondi sup
  });
  it('canAfford', () => { expect(canAfford(5, 'brief')).toBe(true); expect(canAfford(4, 'brief')).toBe(false); });
  it('ledger + report 25%', () => {
    expect(applyLedger(100, [{ delta: -20, reason: 'brief' }, { delta: 50, reason: 'topup' }])).toBe(130);
    expect(computeRollover(80)).toBe(20);
  });
});
