import type { CreativeMetrics } from './radar';

export interface CreativeLike { fingerprint: string; [k: string]: unknown; }
export interface MetricRowLike {
  fingerprint: string; date: string; spend: number; impressions: number; clicks: number; conv: number; revenue: number;
  v2s?: number; v3s?: number; v6s?: number; v15s?: number; p50?: number;
}

/** Dédup créas par fingerprint (une même vidéo = 1 creative, N ad_instances). CDC §F2. */
export function dedupeCreatives<T extends CreativeLike>(creatives: T[]): T[] {
  const map = new Map<string, T>();
  for (const c of creatives) if (!map.has(c.fingerprint)) map.set(c.fingerprint, c);
  return [...map.values()];
}

/** Agrège les métriques journalières au niveau creative -> entrée de computeRadar. CDC §5.6/§F2. */
export function aggregateCreativeMetrics(rows: MetricRowLike[], platform: 'tiktok' | 'meta'): CreativeMetrics[] {
  const by = new Map<string, MetricRowLike[]>();
  for (const r of rows) { const arr = by.get(r.fingerprint) ?? []; arr.push(r); by.set(r.fingerprint, arr); }
  const out: CreativeMetrics[] = [];
  for (const [fp, rs] of by) {
    const sum = (f: (r: MetricRowLike) => number) => rs.reduce((s, r) => s + (f(r) || 0), 0);
    const impressions = sum((r) => r.impressions);
    const clicks = sum((r) => r.clicks);
    const spend = sum((r) => r.spend);
    const revenue = sum((r) => r.revenue);
    const conv = sum((r) => r.conv);
    const early = platform === 'tiktok' ? sum((r) => r.v2s ?? 0) : sum((r) => r.v3s ?? 0);
    const v3 = sum((r) => r.v3s ?? 0);
    const v15 = sum((r) => r.v15s ?? 0);
    const p50 = sum((r) => r.p50 ?? 0);
    const hookRate = impressions > 0 ? early / impressions : 0;
    const holdRate = v3 > 0 ? v15 / v3 : impressions > 0 ? p50 / impressions : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const convEff = revenue > 0 ? revenue / Math.max(1, spend) : conv > 0 ? conv / Math.max(1, spend) : 0;
    out.push({ id: fp, spend, impressions, hookRate, holdRate, ctr, convEff, daysActive: rs.length });
  }
  return out;
}
