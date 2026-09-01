import { schema } from '@tiktrends/db';
import type { MarketAd } from '@tiktrends/core';

/**
 * Les colonnes d'une créa concurrente dont on se sert vraiment.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Deux endroits lisaient `marketCreatives` — la mémoire de Jarvis et l'écran
 * marché — avec un `select()` sans colonnes, six cents lignes à chaque fois.
 * Or `analysis` contient la description IA complète de la créa : six cents
 * documents JSON traversaient la base pour alimenter neuf champs qui tiennent
 * sur une ligne.
 *
 * Le mapper était copié aux deux endroits, à l'identique. Une projection et un
 * mapper partagés valent mieux que deux copies qui finiront par diverger · et
 * la divergence, ici, se serait vue comme deux chiffres de marché différents
 * selon l'écran ouvert.
 */
export const MARKET_COLS = {
  advertiser: schema.marketCreatives.advertiser,
  platform: schema.marketCreatives.platform,
  hookType: schema.marketCreatives.hookType,
  openingType: schema.marketCreatives.openingType,
  talent: schema.marketCreatives.talent,
  lengthBucket: schema.marketCreatives.lengthBucket,
  format: schema.marketCreatives.format,
  daysRunning: schema.marketCreatives.daysRunning,
  reachDelta30d: schema.marketCreatives.reachDelta30d,
  liveAdsCount: schema.marketCreatives.liveAdsCount,
} as const;

export type MarketRowRaw = {
  advertiser: string | null; platform: string | null;
  hookType: string | null; openingType: string | null; talent: string | null;
  lengthBucket: string | null; format: string | null;
  daysRunning: number; reachDelta30d: number | null; liveAdsCount: number | null;
};

export function toMarketAd(r: MarketRowRaw): MarketAd {
  return {
    advertiser: r.advertiser, platform: r.platform,
    hookType: r.hookType as MarketAd['hookType'],
    openingType: r.openingType as MarketAd['openingType'],
    talent: r.talent as MarketAd['talent'],
    lengthBucket: r.lengthBucket, format: r.format,
    daysRunning: r.daysRunning, reachDelta30d: r.reachDelta30d, liveAdsCount: r.liveAdsCount,
  };
}
