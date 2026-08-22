import { describe, it, expect } from 'vitest';
import { diagnose } from '../src/diagnostic';
describe('diagnostic Radar (§5.6)', () => {
  it('hook D -> hook_slow', () => { expect(diagnose({ hook: 'D', hold: 'B', ctr: 'B', conv: 'B' })).toContain('hook_slow'); });
  it('hook A + hold D -> promise_broken', () => { expect(diagnose({ hook: 'A', hold: 'D', ctr: 'B', conv: 'B' })).toContain('promise_broken'); });
  it('ctr A + conv D -> offer_or_landing', () => { expect(diagnose({ hook: 'B', hold: 'B', ctr: 'A', conv: 'D' })).toContain('offer_or_landing'); });
  it('tout moyen -> no_edge', () => { expect(diagnose({ hook: 'B', hold: 'B', ctr: 'B', conv: 'B' })).toEqual(['no_edge']); });
});
