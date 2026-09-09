import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InspoAd } from '@tiktrends/integrations';
import type { AssetAnalysis } from '@tiktrends/core';
import { bucketDuree, ligneMarketCreative } from '../lib/market-rows';

/**
 * Une SEULE forme de ligne marketCreatives, partagée par les deux pipelines.
 *
 * ── La divergence qu'on supprime ─────────────────────────────────────────────
 *
 * Le lot on-demand rangeait la grammaire de mise en page ET de charte
 * (headlinePosition, composition, typoRegister, palette…). Le radar nocturne
 * décrivait les MÊMES créas mais oubliait ces champs · ses créas n'entraient
 * donc pas dans `grammaireLayout`. Deux copies qui avaient déjà divergé.
 *
 * On teste le RÉSULTAT · la ligne construite porte toujours ces champs, radar ou
 * pas · c'est ce qui garantit que les créas du radar entrent dans la même
 * grammaire.
 */

const ad = (o: Partial<InspoAd> = {}): InspoAd => ({
  id: 'ext1', platform: 'tiktok', advertiserName: 'Klorea',
  daysRunning: 30, mediaType: 'video', body: 'Focus sans crash', ...o,
} as InspoAd);

const analyse = (): AssetAnalysis => ({
  hookType: null, openingType: null, talent: null, durationS: 20,
  hookSpoken: 'Tu en as marre ?', claims: ['-30%'], proofElements: ['avis vérifiés'],
  productFirstSec: 2, ctaFirstSec: 18, cutsFirst10s: 4, hasCaptions: true,
  headlinePosition: 'top', composition: 'lifestyle', textDensity: 'moderate', background: 'light',
  typoRegister: 'serif', palette: 'pastel', confidence: 0.8, unmapped: {},
} as unknown as AssetAnalysis);

describe('bucketDuree · les seuils, une seule fois', () => {
  it('classe la durée, null quand inconnue', () => {
    expect(bucketDuree(null)).toBeNull();
    expect(bucketDuree(5)).toBe('<10s');
    expect(bucketDuree(20)).toBe('15-30s');
    expect(bucketDuree(90)).toBe('>60s');
  });
});

describe('ligneMarketCreative · une forme, la grammaire complète', () => {
  it('range la créa sous SA plateforme et son identifiant', () => {
    const row = ligneMarketCreative(ad(), analyse(), { workspaceId: 'w', brandId: 'b' });
    expect(row.platform).toBe('tiktok');
    expect(row.externalId).toBe('ext1');
    expect(row.lengthBucket).toBe('15-30s');
  });

  it('porte TOUJOURS la grammaire de layout et de charte · le trou du radar', () => {
    const a = ligneMarketCreative(ad(), analyse(), { workspaceId: 'w', brandId: 'b' }) as { analysis: Record<string, unknown> };
    expect(a.analysis.headlinePosition).toBe('top');
    expect(a.analysis.typoRegister).toBe('serif');
    expect(a.analysis.palette).toBe('pastel');
    expect(a.analysis.summary).toBeTruthy();
  });

  it('hors radar · aucun signal, aucune raison radar', () => {
    const row = ligneMarketCreative(ad(), analyse(), { workspaceId: 'w', brandId: 'b' }) as { radarSignal: unknown; analysis: Record<string, unknown> };
    expect(row.radarSignal).toBeNull();
    expect(row.analysis.radarReason).toBeUndefined();
  });

  it('avec radar · le signal ET la raison sont là, ET la grammaire aussi', () => {
    const row = ligneMarketCreative(ad(), analyse(), { workspaceId: 'w', brandId: 'b' }, { signal: 'crossed_proven', reason: 'paie depuis 30 j' }) as { radarSignal: unknown; analysis: Record<string, unknown> };
    expect(row.radarSignal).toBe('crossed_proven');
    expect(row.analysis.radarReason).toBe('paie depuis 30 j');
    // La régression qu'on interdit · le radar carie DÉSORMAIS la grammaire.
    expect(row.analysis.headlinePosition).toBe('top');
  });
});

const LEARN = readFileSync(join(process.cwd(), 'app/actions/market-learn.ts'), 'utf8');
const RADAR = readFileSync(join(process.cwd(), 'lib/radar.ts'), 'utf8');

describe('les deux pipelines passent par la fonction partagée', () => {
  it('market-learn et radar construisent la ligne au même endroit', () => {
    expect(LEARN).toMatch(/ligneMarketCreative\(/);
    expect(RADAR).toMatch(/ligneMarketCreative\(/);
    // Plus d'insert `.values({ ...` en dur dans les deux · une seule forme.
    expect(RADAR, 'le radar ne construit plus la ligne à la main').not.toMatch(/lengthBucket: bucket\(/);
  });
});
