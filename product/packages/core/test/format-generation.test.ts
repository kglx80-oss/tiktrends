import { describe, expect, it } from 'vitest';
import { formatAdPourGeneration, generationSuivable, type GenerationKind } from '../src/adsmap/format-generation';

/**
 * La boucle create→test doit se refermer pour les trois types de CRÉATIVES
 * (pub, image, vidéo), pas seulement les pubs. Les textes (script, copie) ne
 * sont pas des ads à arbitrer · ils ne se suivent pas.
 */
describe('formatAdPourGeneration · le format Adsmap d’une créa générée', () => {
  it('une pub et un visuel entrent en « static »', () => {
    expect(formatAdPourGeneration('ad')).toBe('static');
    expect(formatAdPourGeneration('image')).toBe('static');
  });

  it('une vidéo entre en « video_ugc »', () => {
    expect(formatAdPourGeneration('video')).toBe('video_ugc');
  });

  it('un texte (script, copie) ne se teste pas · null', () => {
    expect(formatAdPourGeneration('script')).toBeNull();
    expect(formatAdPourGeneration('copy')).toBeNull();
  });

  it('generationSuivable · vrai pour les créatives, faux pour les textes', () => {
    const suivables: GenerationKind[] = ['ad', 'image', 'video'];
    const nonSuivables: GenerationKind[] = ['script', 'copy'];
    for (const k of suivables) expect(generationSuivable(k), `${k} doit être suivable`).toBe(true);
    for (const k of nonSuivables) expect(generationSuivable(k), `${k} ne doit pas être suivable`).toBe(false);
  });

  it('INVARIANT · tout format renvoyé est un format vidéo ou une image fixe, jamais vide', () => {
    const valides = new Set(['video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif']);
    for (const k of ['ad', 'image', 'video'] as GenerationKind[]) {
      const f = formatAdPourGeneration(k);
      expect(f, `${k} doit avoir un format`).not.toBeNull();
      expect(valides.has(f!), `${k} → ${f} n’est pas un format Adsmap valide`).toBe(true);
    }
  });
});
