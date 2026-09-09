import { schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { summarizeAnalysis, type MarketAd, type AssetAnalysis, type RadarSignal } from '@tiktrends/core';

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

/** Le seau de durée d'une créa · une seule définition, partagée par les deux pipelines. */
export function bucketDuree(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec)) return null;
  if (sec < 10) return '<10s';
  if (sec < 15) return '10-15s';
  if (sec < 30) return '15-30s';
  if (sec < 60) return '30-60s';
  return '>60s';
}

/**
 * La ligne `marketCreatives` d'une créa décrite · UNE seule forme.
 *
 * ── La divergence que ça supprime ────────────────────────────────────────────
 *
 * Deux pipelines la produisaient — le lot on-demand (`market-learn`) et le radar
 * nocturne (`radar`) — avec des champs qui avaient déjà divergé : le radar
 * oubliait la grammaire de mise en page et de charte (`headlinePosition`,
 * `composition`, `typoRegister`, `palette`…), si bien que ses créas
 * n'alimentaient PAS `grammaireLayout`. Une seule fonction supprime la
 * divergence · les créas du radar entrent désormais dans la même grammaire.
 *
 * Le signal radar est optionnel · absent hors radar.
 */
export function ligneMarketCreative(
  ad: InspoAd,
  n: AssetAnalysis,
  ctx: { workspaceId: string; brandId: string },
  radar?: { signal: RadarSignal; reason: string },
): typeof schema.marketCreatives.$inferInsert {
  return {
    workspaceId: ctx.workspaceId, brandId: ctx.brandId,
    platform: ad.platform, externalId: ad.id,
    advertiser: ad.advertiserName ?? null,
    daysRunning: ad.daysRunning ?? 0,
    reachDelta30d: ad.reachDelta30d ?? null,
    liveAdsCount: ad.liveAdsCount ?? null,
    format: ad.mediaType ?? null,
    hookType: n.hookType, openingType: n.openingType, talent: n.talent,
    lengthBucket: bucketDuree(n.durationS),
    analysis: {
      hookSpoken: n.hookSpoken, claims: n.claims, proofElements: n.proofElements,
      unmapped: n.unmapped, summary: summarizeAnalysis(n),
      // Grammaire de mise en page ET charte · c'est ce qui arme `grammaireLayout`.
      // Le radar les oubliait · désormais il les range comme le lot on-demand.
      headlinePosition: n.headlinePosition, composition: n.composition,
      textDensity: n.textDensity, background: n.background,
      typoRegister: n.typoRegister, palette: n.palette,
      ...(radar ? { radarReason: radar.reason } : {}),
    },
    analysisConfidence: n.confidence,
    radarSignal: radar?.signal ?? null,
    analyzedAt: new Date(),
  };
}
