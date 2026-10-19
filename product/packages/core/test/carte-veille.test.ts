import { describe, expect, it } from 'vitest';
import { bandeauVeille, PROVEN_DAYS } from '../src';

describe('bandeauVeille · présentation V5 de la carte, sur données réelles', () => {
  it('plateforme en marque blanche · meta/facebook → Meta, tiktok → TikTok, google → Google', () => {
    expect(bandeauVeille({ platform: 'meta' }).plateforme).toBe('Meta');
    expect(bandeauVeille({ platform: 'facebook' }).plateforme).toBe('Meta');
    expect(bandeauVeille({ platform: 'tiktok' }).plateforme).toBe('TikTok');
    expect(bandeauVeille({ platform: 'google' }).plateforme).toBe('Google');
    expect(bandeauVeille({ platform: undefined }).plateforme).toBe('Meta');
  });

  it('format · vidéo/image connus ; rien d’autre (pas de durée ni de ratio, absents de la source)', () => {
    expect(bandeauVeille({ mediaType: 'video' }).media).toBe('Vidéo');
    expect(bandeauVeille({ mediaType: 'image' }).media).toBe('Image');
    expect(bandeauVeille({ mediaType: 'carousel' }).media).toBe(null);
    expect(bandeauVeille({}).media).toBe(null);
  });

  it('statut · « active » → Active, sinon Inactive · jours plancher à 0', () => {
    expect(bandeauVeille({ status: 'active', daysRunning: 63 }).statut).toEqual({ actif: true, texte: 'Active', jours: 63 });
    expect(bandeauVeille({ status: 'inactive', daysRunning: 7 }).statut).toEqual({ actif: false, texte: 'Inactive', jours: 7 });
    expect(bandeauVeille({ daysRunning: -4 }).statut.jours).toBe(0);
    expect(bandeauVeille({ daysRunning: 12.9 }).statut.jours).toBe(12);
  });

  it('jauge · 0 à 1, pleine au seuil de piste éprouvée (PROVEN_DAYS), sans dépasser', () => {
    expect(bandeauVeille({ daysRunning: 0 }).jauge).toBe(0);
    expect(bandeauVeille({ daysRunning: PROVEN_DAYS }).jauge).toBe(1);
    expect(bandeauVeille({ daysRunning: PROVEN_DAYS * 3 }).jauge).toBe(1);
    const partiel = bandeauVeille({ daysRunning: 7 }).jauge; // 7/21 = un tiers
    expect(partiel).toBeGreaterThan(0.3);
    expect(partiel).toBeLessThan(0.34);
  });
});
