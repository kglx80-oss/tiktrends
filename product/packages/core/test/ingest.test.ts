import { describe, it, expect } from 'vitest';
import { aggregateCreativeMetrics, dedupeCreatives } from '../src/ingest';

describe('ingestion', () => {
  it('dédup par fingerprint', () => {
    const out = dedupeCreatives([{ fingerprint: 'a' }, { fingerprint: 'a' }, { fingerprint: 'b' }]);
    expect(out.length).toBe(2);
  });
  it('agrège au niveau creative (TikTok hook = v2s/impr)', () => {
    const rows = [
      { fingerprint: 'v', date: '1', spend: 100, impressions: 10000, clicks: 100, conv: 10, revenue: 300, v2s: 3500, v3s: 3000, v15s: 1500 },
      { fingerprint: 'v', date: '2', spend: 100, impressions: 10000, clicks: 100, conv: 10, revenue: 300, v2s: 3500, v3s: 3000, v15s: 1500 },
    ];
    const [m] = aggregateCreativeMetrics(rows, 'tiktok');
    expect(m!.spend).toBe(200);
    expect(m!.hookRate).toBeCloseTo(0.35, 5);   // 7000/20000
    expect(m!.holdRate).toBeCloseTo(0.5, 5);    // 3000/6000
    expect(m!.ctr).toBeCloseTo(0.01, 5);
    expect(m!.convEff).toBeCloseTo(3, 5);       // ROAS 600/200
  });
});
