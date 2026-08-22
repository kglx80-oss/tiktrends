import { describe, it, expect } from 'vitest';
import { normalizeTikTokAd } from '../src/tiktok';
import { normalizeMetaAd } from '../src/meta';

describe('normalisation', () => {
  it('TikTok : fingerprint basé sur la vidéo (dédup)', () => {
    const n = normalizeTikTokAd({ ad_id: 'a1', ad_name: 'x', video_id: 'v9', daily: [{ stat_time_day: '2026-08-15', spend: 10, impressions: 1000, clicks: 10, conversions: 1, total_purchase_value: 30, video_watched_2s: 400, video_watched_15s: 200 }] });
    expect(n.creative.fingerprint).toBe('tiktok:v9');
    expect(n.creative.type).toBe('video');
    expect(n.metrics[0]!.revenue).toBe(30);
  });
  it('Meta : image -> type image', () => {
    const n = normalizeMetaAd({ id: 'm1', name: 'y', creative: { image_hash: 'h1' }, insights: [{ date_start: '2026-08-15', spend: 5, impressions: 500, clicks: 5, conversions: 1, purchase_value: 20 }] });
    expect(n.creative.fingerprint).toBe('meta:h1');
    expect(n.creative.type).toBe('image');
  });
});
