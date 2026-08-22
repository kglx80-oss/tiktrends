/** Formes normalisées communes (indépendantes de la plateforme). */
export type Platform = 'tiktok' | 'meta';

export interface NormalizedCreative {
  fingerprint: string;
  type: 'video' | 'image' | 'carousel';
  thumbUrl?: string;
  durationS?: number;
  title: string;
}
export interface NormalizedAdInstance {
  externalAdId: string;
  fingerprint: string;
  campaignName?: string;
  adsetName?: string;
  status?: string;
}
export interface MetricRow {
  fingerprint: string;
  date: string;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  conv: number;
  revenue: number;
  v2s?: number; v3s?: number; v6s?: number; v15s?: number; p50?: number;
}
export interface NormalizedAd {
  creative: NormalizedCreative;
  adInstance: NormalizedAdInstance;
  metrics: MetricRow[];
}
