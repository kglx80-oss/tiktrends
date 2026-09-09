import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { survivalSignal } from '@tiktrends/core';

/**
 * Le radar nocturne apprend AUSSI de TikTok, sans risque de payer à perte.
 *
 * ── Ce que ça change, et pourquoi c'est sûr ──────────────────────────────────
 *
 * Le radar planifié ne cherchait que sur Meta · « seule plateforme qui expose la
 * durée de diffusion ». Or le produit est TikTok-first · l'apprentissage
 * automatique ne pouvait pas rester borgne. On ouvre donc les DEUX plateformes.
 *
 * La sûreté ne vient pas d'un filtre de plateforme, mais de la SÉLECTION :
 * `survivalSignal` ne retient une créa que si elle porte un signal de survie
 * (`daysRunning >= 7`). Une créa TikTok sans durée fiable rend donc AUCUN signal
 * · elle est ignorée gratis, jamais analysée à perte. Le budget est protégé par
 * la même barrière qu'avant, quelle que soit la plateforme.
 */

interface Cand {
  externalId: string; advertiser: string | null; daysRunning: number;
  reachDelta30d: number | null; liveAdsCount: number | null; format: string | null;
  hasImage: boolean; hasText: boolean;
}
const cand = (o: Partial<Cand>): Cand => ({
  externalId: 'x', advertiser: null, daysRunning: 0, reachDelta30d: null,
  liveAdsCount: null, format: null, hasImage: true, hasText: true, ...o,
});

describe('la sélection protège le budget · TikTok comme Meta', () => {
  it('sans durée fiable · aucun signal · jamais analysé (le cas TikTok sans daysRunning)', () => {
    expect(survivalSignal(cand({ daysRunning: 0 }))).toBeNull();
  });
  it('une créa qui tient · signal · analysée, quelle que soit la plateforme', () => {
    expect(survivalSignal(cand({ daysRunning: 21 }))).toBe('crossed_proven');
  });
  it('trop jeune (< 7 j) · pas encore, même avec des annonces vivantes', () => {
    expect(survivalSignal(cand({ daysRunning: 3, liveAdsCount: 50 }))).toBeNull();
  });
});

const RADAR = readFileSync(join(process.cwd(), 'lib/radar.ts'), 'utf8');

describe('le radar récolte sur les deux plateformes', () => {
  it('n’ignore plus tout sauf Meta · il inclut TikTok', () => {
    expect(RADAR).toMatch(/s\.platform !== 'meta' && s\.platform !== 'tiktok'/);
  });
  it('dispatche une vraie recherche TikTok pour les marques TikTok', () => {
    expect(RADAR).toMatch(/s\.platform === 'tiktok'/);
    expect(RADAR).toMatch(/ttSearchTikTok\(/);
  });
});
