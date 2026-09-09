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

const ADMEDIA = readFileSync(join(process.cwd(), 'components/AdMedia.tsx'), 'utf8');
const SWIPE = readFileSync(join(process.cwd(), 'app/(app)/veille/scale/SwipeFile.tsx'), 'utf8');

describe('les deux affichages passent par la règle partagée', () => {
  it('AdMedia et SwipeFile choisissent l’aperçu avec apercuImage', () => {
    expect(ADMEDIA).toMatch(/apercuImage\(/);
    expect(SWIPE).toMatch(/apercuImage\(/);
    // Le repli ne se déclenche plus sur la seule absence de thumbnail.
    expect(ADMEDIA, 'AdMedia lit encore thumbnailUrl seul pour l’image').not.toMatch(/\?\s*<img src=\{thumbnailUrl\}/);
  });
});
