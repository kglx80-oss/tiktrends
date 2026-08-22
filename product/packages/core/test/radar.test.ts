import { describe, it, expect } from 'vitest';
import { computeRadar, type CreativeMetrics } from '../src/radar';

const mk = (id: string, o: Partial<CreativeMetrics>): CreativeMetrics => ({
  id, spend: 500, impressions: 50000, hookRate: 0.25, holdRate: 0.25, ctr: 0.012, convEff: 2, ...o,
});

describe('Radar (§5.6)', () => {
  it('classe les créas sous le seuil en "insufficient"', () => {
    const r = computeRadar([mk('a', { spend: 10, impressions: 200 })]);
    expect(r[0]!.bucket).toBe('insufficient');
    expect(r[0]!.eligible).toBe(false);
  });

  it('donne A à la meilleure créa sur chaque métrique (percentiles)', () => {
    const set: CreativeMetrics[] = Array.from({ length: 10 }, (_, i) =>
      mk('c' + i, { hookRate: 0.1 + i * 0.03, holdRate: 0.1 + i * 0.02, ctr: 0.005 + i * 0.001, convEff: 0.8 + i * 0.4 }),
    );
    const r = computeRadar(set);
    const best = r[r.length - 1]!;
    expect(best.grades.conv).toBe('A');
    expect(best.grades.overall).toBe('A');
    expect(best.bucket).toBe('winner');
  });

  it('repère un kill_candidate (faible sur tous les axes, conv D, ancienneté >= 7 j)', () => {
    // Fixture varié : le loser doit être bas partout (sinon un hook A -> high_potential, ce qui est correct §5.6).
    const set: CreativeMetrics[] = Array.from({ length: 10 }, (_, i) =>
      mk('c' + i, { hookRate: 0.15 + i * 0.02, holdRate: 0.15 + i * 0.02, ctr: 0.006 + i * 0.001, convEff: 1.2 + i * 0.35 }),
    );
    set.push(mk('loser', { hookRate: 0.13, holdRate: 0.13, ctr: 0.004, convEff: 0.3, daysActive: 12 }));
    const r = computeRadar(set);
    const loser = r.find((x) => x.id === 'loser')!;
    expect(loser.grades.conv).toBe('D');
    expect(loser.grades.hook).toBe('D');
    expect(loser.bucket).toBe('kill_candidate');
  });
});
