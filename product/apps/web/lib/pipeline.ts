import { fixtures, normalizeTikTokAd, normalizeMetaAd, type NormalizedAd } from '@tiktrends/integrations';
import { dedupeCreatives, aggregateCreativeMetrics, computeRadar } from '@tiktrends/core';

export interface DashboardRow {
  platform: 'tiktok' | 'meta';
  title: string;
  fingerprint: string;
  spend: number;
  impressions: number;
  ctr: number;
  roas: number;
  grade: string;
  bucket: string;
}

/** Pipeline complet (fixtures -> normalisation -> dédup -> agrégation -> Radar). */
export function buildDashboard(): DashboardRow[] {
  const tt = (fixtures.tiktok as { ads: unknown[] }).ads.map((a) => normalizeTikTokAd(a as never)) as NormalizedAd[];
  const mt = (fixtures.meta as { ads: unknown[] }).ads.map((a) => normalizeMetaAd(a as never)) as NormalizedAd[];
  const groups: Array<{ p: 'tiktok' | 'meta'; ads: NormalizedAd[] }> = [
    { p: 'tiktok', ads: tt },
    { p: 'meta', ads: mt },
  ];
  const rows: DashboardRow[] = [];
  for (const { p, ads } of groups) {
    const creatives = dedupeCreatives(ads.map((a) => a.creative));
    const metrics = aggregateCreativeMetrics(ads.flatMap((a) => a.metrics), p);
    const radar = computeRadar(metrics, p);
    for (const m of metrics) {
      const c = creatives.find((x) => x.fingerprint === m.id);
      const r = radar.find((x) => x.id === m.id);
      rows.push({
        platform: p, title: c?.title ?? m.id, fingerprint: m.id,
        spend: m.spend, impressions: m.impressions, ctr: m.ctr, roas: m.convEff,
        grade: r?.grades.overall ?? 'D', bucket: r?.bucket ?? 'insufficient',
      });
    }
  }
  return rows.sort((a, b) => b.spend - a.spend);
}
