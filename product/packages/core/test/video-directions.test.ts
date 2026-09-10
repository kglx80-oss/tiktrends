import { describe, it, expect } from 'vitest';
import { VIDEO_DIRECTIONS, videoDirectionByKey, directionMouvementPrompt, promptVideo } from '../src/video-directions';

describe('les directions de mouvement vidéo', () => {
  it('chaque direction nomme caméra, rythme et énergie', () => {
    for (const d of VIDEO_DIRECTIONS) {
      expect(d.camera, `${d.key} sans caméra`).toBeTruthy();
      expect(d.rythme, `${d.key} sans rythme`).toBeTruthy();
      expect(d.energie, `${d.key} sans énergie`).toBeTruthy();
    }
  });

  it('les clés sont uniques', () => {
    const cles = VIDEO_DIRECTIONS.map((d) => d.key);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('la direction écrite nomme les trois fragments', () => {
    const d = videoDirectionByKey('demo_geste')!;
    const p = directionMouvementPrompt(d);
    expect(p).toContain('Camera:');
    expect(p).toContain('Pacing:');
    expect(p).toContain('Energy:');
  });
});

describe('promptVideo · le mouvement augmenté de la direction', () => {
  it('sans direction, le mouvement passe intact', () => {
    expect(promptVideo('léger zoom', null)).toBe('léger zoom');
    expect(promptVideo('  x  ', undefined)).toBe('x');
  });

  it('avec direction, le bloc caméra/rythme/énergie entre', () => {
    const out = promptVideo('léger zoom', 'ugc_selfie');
    expect(out).toContain('léger zoom');
    expect(out).toContain('Camera:');
  });

  it('une clé inconnue ne casse rien', () => {
    expect(promptVideo('léger zoom', 'nope')).toBe('léger zoom');
  });
});
