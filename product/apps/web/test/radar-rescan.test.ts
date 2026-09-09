import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { majSurvie, type RadarCandidate } from '@tiktrends/core';

/**
 * L'angle mort du radar · une créa vue jeune doit finir par franchir le cap.
 *
 * ── Le bug ───────────────────────────────────────────────────────────────────
 *
 * Vue à 5 jours puis figée (l'insert ne touchait rien sur conflit), elle
 * n'atteignait JAMAIS 21 jours dans notre base · le radar l'ignorait pour
 * toujours (déjà connue). On rafraîchit ses chiffres de survie à chaque
 * passage, GRATIS · `majSurvie` décide quoi réécrire.
 *
 * On teste le RÉSULTAT · les chiffres réécrits et le signal recalculé.
 */

const cand = (o: Partial<RadarCandidate>): RadarCandidate => ({
  externalId: 'x', advertiser: 'Klorea', daysRunning: 0,
  reachDelta30d: null, liveAdsCount: null, hasImage: true, hasText: true, ...o,
});

describe('majSurvie · la créa vieillit, la base suit', () => {
  it('une créa qui a franchi 21 j depuis passe à crossed_proven', () => {
    // En base : vue à 5 j, aucun signal. Fraîche : 25 j.
    const maj = majSurvie(cand({ daysRunning: 25 }), { daysRunning: 5, signal: null });
    expect(maj).not.toBeNull();
    expect(maj!.daysRunning).toBe(25);
    expect(maj!.signal).toBe('crossed_proven');
  });

  it('réécrit aussi les chiffres de portée', () => {
    const maj = majSurvie(cand({ daysRunning: 25, reachDelta30d: 1200, liveAdsCount: 8 }), { daysRunning: 5, signal: null });
    expect(maj!.reachDelta30d).toBe(1200);
    expect(maj!.liveAdsCount).toBe(8);
  });

  it('rien n’a bougé → null · pas d’écriture inutile', () => {
    expect(majSurvie(cand({ daysRunning: 25 }), { daysRunning: 25, signal: 'crossed_proven' })).toBeNull();
  });

  it('le signal peut se renforcer sans changement de jours', () => {
    // 10 j, la portée s'est mise à monter · reach_growing apparaît.
    const maj = majSurvie(cand({ daysRunning: 10, reachDelta30d: 500 }), { daysRunning: 10, signal: null });
    expect(maj).not.toBeNull();
    expect(maj!.signal).toBe('reach_growing');
  });
});

const RADAR = readFileSync(join(process.cwd(), 'lib/radar.ts'), 'utf8');

describe('le radar rafraîchit vraiment les créas connues, sans repayer', () => {
  it('il lit l’état de survie stocké et le compare au frais', () => {
    // `connues` doit ramener de quoi comparer · jours + signal stockés.
    expect(RADAR).toMatch(/daysRunning: schema\.marketCreatives\.daysRunning/);
    expect(RADAR).toMatch(/radarSignal: schema\.marketCreatives\.radarSignal/);
    expect(RADAR).toMatch(/majSurvie\(/);
  });

  it('le rafraîchissement est un UPDATE, pas une nouvelle description', () => {
    // Le bloc de rafraîchissement met à jour marketCreatives · aucune vision.
    const bloc = RADAR.slice(RADAR.indexOf('2·bis'), RADAR.indexOf('3 · Sélection'));
    expect(bloc).toMatch(/db\.update\(schema\.marketCreatives\)/);
    expect(bloc, 'le rafraîchissement ne doit RIEN décrire au modèle').not.toMatch(/analyzeAdAsset/);
  });
});
