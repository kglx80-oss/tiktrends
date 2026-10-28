import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apercuImage } from '@tiktrends/core';

/**
 * L'aperçu d'un statique ne doit plus tomber sur « Aperçu indisponible ».
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * La source ne pose un `thumbnailUrl` que sur la vidéo. Une image fixe porte son
 * visuel dans `mediaUrl`. L'affichage ne lisait que `thumbnailUrl` · un statique
 * qui AVAIT une image montrait « Aperçu indisponible ».
 *
 * On teste le RÉSULTAT · l'URL choisie, pas la présence d'un appel.
 */

describe('apercuImage · quelle image on montre', () => {
  it('vidéo avec thumbnail → le thumbnail', () => {
    expect(apercuImage({ isVideo: true, thumbnailUrl: 't.jpg', mediaUrl: 'v.mp4' })).toBe('t.jpg');
  });

  it('vidéo SANS thumbnail → rien · on ne met jamais un .mp4 dans un <img>', () => {
    expect(apercuImage({ isVideo: true, thumbnailUrl: null, mediaUrl: 'v.mp4' })).toBeNull();
  });

  it('statique SANS thumbnail mais AVEC média → le média · c’est la correction', () => {
    expect(apercuImage({ isVideo: false, thumbnailUrl: null, mediaUrl: 'photo.jpg' })).toBe('photo.jpg');
  });

  it('statique avec thumbnail → le thumbnail (priorité)', () => {
    expect(apercuImage({ isVideo: false, thumbnailUrl: 't.jpg', mediaUrl: 'photo.jpg' })).toBe('t.jpg');
  });

  it('rien à montrer → null', () => {
    expect(apercuImage({ isVideo: false, thumbnailUrl: null, mediaUrl: null })).toBeNull();
    expect(apercuImage({ isVideo: undefined, thumbnailUrl: undefined, mediaUrl: undefined })).toBeNull();
  });
});

// Vague 4 · les cartes de la Veille sont celles de Spatial (AdMedia et SwipeFile V5 retirés).
const ECRANS = ['app/(spatial)/sp/veille/cartes.ts', 'app/(spatial)/sp/veille/scale/page.tsx', 'app/(spatial)/sp/saved/page.tsx', 'app/(spatial)/sp/radar/page.tsx']
  .map((f) => [f, readFileSync(join(process.cwd(), f), 'utf8')] as const);

describe('les affichages passent par la règle partagée', () => {
  it('chaque écran de la Veille choisit l’aperçu avec apercuImage · jamais thumbnailUrl seul', () => {
    for (const [f, src] of ECRANS) {
      expect(src, f).toMatch(/apercuImage\(\{ isVideo/);
      expect(src, `${f} lit encore thumbnailUrl seul pour l’image`).not.toMatch(/image: (?:ad|a\.ad|e\.snapshot)\??\.thumbnailUrl/);
    }
  });
});
