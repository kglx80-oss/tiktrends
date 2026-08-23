import { fixtures, normalizeTikTokAd, normalizeMetaAd, type NormalizedAd } from '@tiktrends/integrations';
import { dedupeCreatives, aggregateCreativeMetrics, computeRadar, diagnose, DIAGNOSIS_FR, type RadarResult } from '@tiktrends/core';

export interface AnalysisRow {
  platform: 'tiktok' | 'meta';
  title: string;
  fingerprint: string;
  thumbUrl?: string;
  spend: number;
  impressions: number;
  ctr: number;
  hookRate: number;
  holdRate: number;
  convEff: number;
  daysActive: number;
  grades: RadarResult['grades'];
  globalScore: number;
  bucket: RadarResult['bucket'];
  eligible: boolean;
  diagnosis: string[];
}

/** Pipeline d'analyse complet (fixtures -> normalisation -> dédup -> agrégation -> Radar + diagnostic). */
export function buildAnalysis(): AnalysisRow[] {
  const groups: Array<{ p: 'tiktok' | 'meta'; ads: NormalizedAd[] }> = [
    { p: 'tiktok', ads: (fixtures.tiktok as { ads: unknown[] }).ads.map((a) => normalizeTikTokAd(a as never)) as NormalizedAd[] },
    { p: 'meta', ads: (fixtures.meta as { ads: unknown[] }).ads.map((a) => normalizeMetaAd(a as never)) as NormalizedAd[] },
  ];
  const rows: AnalysisRow[] = [];
  for (const { p, ads } of groups) {
    const creatives = dedupeCreatives(ads.map((a) => a.creative));
    const metrics = aggregateCreativeMetrics(ads.flatMap((a) => a.metrics), p);
    const radar = computeRadar(metrics, p);
    for (const m of metrics) {
      const c = creatives.find((x) => x.fingerprint === m.id);
      const r = radar.find((x) => x.id === m.id)!;
      rows.push({
        platform: p, title: c?.title ?? m.id, fingerprint: m.id, thumbUrl: c?.thumbUrl,
        spend: m.spend, impressions: m.impressions, ctr: m.ctr, hookRate: m.hookRate, holdRate: m.holdRate,
        convEff: m.convEff, daysActive: m.daysActive ?? 0,
        grades: r.grades, globalScore: r.globalScore, bucket: r.bucket, eligible: r.eligible,
        diagnosis: r.eligible ? diagnose(r.grades).map((code) => DIAGNOSIS_FR[code]) : ['Volume insuffisant pour évaluer (spend/impressions trop faibles).'],
      });
    }
  }
  return rows.sort((a, b) => b.globalScore - a.globalScore || b.spend - a.spend);
}

export interface BucketDef { key: RadarResult['bucket']; label: string; action: string; color: string }
export const BUCKETS: BucketDef[] = [
  { key: 'winner',         label: 'Winners',          action: 'Scaler',      color: '#18cc8c' },
  { key: 'high_potential', label: 'Fort potentiel',   action: 'Pousser',     color: '#7aa2ff' },
  { key: 'iteration',      label: 'À itérer',         action: 'Itérer',      color: '#f5a623' },
  { key: 'fatigued',       label: 'Fatiguées',        action: 'Rafraîchir',  color: '#ff8c42' },
  { key: 'kill_candidate', label: 'À couper',         action: 'Couper',      color: '#ff4d6d' },
  { key: 'insufficient',   label: 'Insuffisant',      action: 'Observer',    color: '#9a8a98' },
];
export const bucketDef = (k: RadarResult['bucket']): BucketDef => BUCKETS.find((b) => b.key === k) ?? BUCKETS[5]!;

export interface Totals { spend: number; impressions: number; avgCtr: number; avgRoas: number; count: number; eligible: number }
export function analysisTotals(rows: AnalysisRow[]): Totals {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const eligible = rows.filter((r) => r.eligible);
  const avgRoas = eligible.length ? eligible.reduce((s, r) => s + r.convEff, 0) / eligible.length : 0;
  const avgCtr = impressions ? rows.reduce((s, r) => s + r.ctr * r.impressions, 0) / impressions : 0;
  return { spend, impressions, avgCtr, avgRoas, count: rows.length, eligible: eligible.length };
}
