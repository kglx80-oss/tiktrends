import type { NormalizedAd, MetricRow } from './types';

/** Payload brut TikTok Marketing API (simplifié pour l'ingestion). */
export interface TikTokRawAd {
  ad_id: string; ad_name: string; campaign_name?: string; adgroup_name?: string;
  video_id?: string; image_ids?: string[]; status?: string; thumbnail?: string; duration?: number;
  daily: Array<{
    stat_time_day: string; spend: number; impressions: number; reach?: number; clicks: number;
    conversions?: number; total_purchase_value?: number;
    video_watched_2s?: number; video_watched_6s?: number; video_watched_15s?: number; video_views_p50?: number;
  }>;
}

export function normalizeTikTokAd(raw: TikTokRawAd): NormalizedAd {
  const isVideo = !!raw.video_id;
  const fingerprint = 'tiktok:' + (raw.video_id ?? (raw.image_ids?.[0] ?? raw.ad_id));
  const metrics: MetricRow[] = raw.daily.map((d) => ({
    fingerprint, date: d.stat_time_day,
    spend: d.spend ?? 0, impressions: d.impressions ?? 0, reach: d.reach, clicks: d.clicks ?? 0,
    conv: d.conversions ?? 0, revenue: d.total_purchase_value ?? 0,
    v2s: d.video_watched_2s, v6s: d.video_watched_6s, v15s: d.video_watched_15s, p50: d.video_views_p50,
  }));
  return {
    creative: { fingerprint, type: isVideo ? 'video' : 'image', thumbUrl: raw.thumbnail, durationS: raw.duration, title: raw.ad_name },
    adInstance: { externalAdId: raw.ad_id, fingerprint, campaignName: raw.campaign_name, adsetName: raw.adgroup_name, status: raw.status },
    metrics,
  };
}
