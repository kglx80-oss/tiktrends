/** Inspo via Trendtrack (CDC §F6). Interface + normalisation vers library_ads. */
export interface TrendtrackClient {
  searchAds(q: { query?: string; platform?: 'tiktok' | 'meta'; industry?: string; sort?: 'recent' | 'longest_running' }): Promise<TrendtrackRawAd[]>;
  searchAdvertisers(q: { query: string }): Promise<unknown[]>;
}
export interface TrendtrackRawAd {
  id: string; platform: 'tiktok' | 'meta'; brand_name?: string; media_url?: string;
  format?: string; duration_s?: number; first_seen?: string; last_seen?: string; is_active?: boolean;
  landing_url?: string; copy?: Record<string, unknown>; transcript?: string;
}
export interface NormalizedLibraryAd {
  source: 'trendtrack'; externalId: string; platform: 'tiktok' | 'meta'; brandName?: string;
  mediaUrl?: string; format?: string; durationS?: number; firstSeen?: string; lastSeen?: string;
  isActive: boolean; landingUrl?: string; copy?: Record<string, unknown>; transcript?: string;
  raw: TrendtrackRawAd;
}
export function normalizeTrendtrackAd(raw: TrendtrackRawAd): NormalizedLibraryAd {
  return {
    source: 'trendtrack', externalId: raw.id, platform: raw.platform, brandName: raw.brand_name,
    mediaUrl: raw.media_url, format: raw.format, durationS: raw.duration_s,
    firstSeen: raw.first_seen, lastSeen: raw.last_seen, isActive: raw.is_active ?? true,
    landingUrl: raw.landing_url, copy: raw.copy, transcript: raw.transcript, raw,
  };
}
/** "Diffusée depuis le plus longtemps" = proxy de perf (CDC §2.1). */
export function daysRunning(ad: { firstSeen?: string; lastSeen?: string }, now = '2026-08-22'): number {
  if (!ad.firstSeen) return 0;
  const a = Date.parse(ad.firstSeen), b = Date.parse(ad.lastSeen ?? now);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}
