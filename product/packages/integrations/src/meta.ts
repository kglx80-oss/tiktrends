import type { NormalizedAd, MetricRow } from './types';

/** Payload brut Meta Marketing API (simplifié). */
export interface MetaRawAd {
  id: string; name: string; status?: string;
  campaign?: { name?: string }; adset?: { name?: string };
  creative?: { video_id?: string; image_hash?: string; thumbnail_url?: string };
  insights: Array<{
    date_start: string; spend: number; impressions: number; reach?: number; clicks: number;
    conversions?: number; purchase_value?: number;
    video_3s?: number; video_thruplay?: number; video_p50?: number;
  }>;
}

export function normalizeMetaAd(raw: MetaRawAd): NormalizedAd {
  const vid = raw.creative?.video_id;
  const fingerprint = 'meta:' + (vid ?? raw.creative?.image_hash ?? raw.id);
  const metrics: MetricRow[] = raw.insights.map((d) => ({
    fingerprint, date: d.date_start,
    spend: d.spend ?? 0, impressions: d.impressions ?? 0, reach: d.reach, clicks: d.clicks ?? 0,
    conv: d.conversions ?? 0, revenue: d.purchase_value ?? 0,
    v3s: d.video_3s, v15s: d.video_thruplay, p50: d.video_p50,
  }));
  return {
    creative: { fingerprint, type: vid ? 'video' : 'image', thumbUrl: raw.creative?.thumbnail_url, title: raw.name },
    adInstance: { externalAdId: raw.id, fingerprint, campaignName: raw.campaign?.name, adsetName: raw.adset?.name, status: raw.status },
    metrics,
  };
}
