import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDominant, consigneAngleMarche } from '@tiktrends/core';

/**
 * Le brief arme aussi le FORMAT gagnant · vidéo ou statique, quand ça penche
 * nettement. Un marché mitigé ne dit rien · silence (null).
 *
 * On teste le RÉSULTAT · le format déduit et la clause ajoutée à la consigne.
 */

describe('formatDominant · seulement quand ça penche nettement', () => {
  it('beaucoup de vidéo → video', () => {
    expect(formatDominant(0.8)).toBe('video');
    expect(formatDominant(0.66)).toBe('video');
  });
  it('beaucoup de statique → statique', () => {
    expect(formatDominant(0.2)).toBe('statique');
    expect(formatDominant(0.34)).toBe('statique');
  });
  it('mitigé → null · pas de signal', () => {
    expect(formatDominant(0.5)).toBeNull();
    expect(formatDominant(0.6)).toBeNull();
    expect(formatDominant(null)).toBeNull();
    expect(formatDominant(undefined)).toBeNull();
  });
});

describe('consigneAngleMarche · l’angle ET le format', () => {
  it('ajoute la clause VIDÉO quand le marché y gagne', () => {
    const c = consigneAngleMarche({ angleLabel: 'Témoignage', marque: 'Klorea', partVideo: 0.9 })!;
    expect(c).toMatch(/VIDÉO/);
    expect(c).toMatch(/sans recopier/);   // l'essentiel survit
  });
  it('ajoute la clause STATIQUE quand le marché y gagne', () => {
    const c = consigneAngleMarche({ angleLabel: 'Offre / promo', marque: 'Klorea', partVideo: 0.1 })!;
    expect(c).toMatch(/STATIQUE/);
  });
  it('marché mitigé · aucune clause de format', () => {
    const c = consigneAngleMarche({ angleLabel: 'Témoignage', marque: 'Klorea', partVideo: 0.5 })!;
    expect(c).not.toMatch(/VIDÉO|STATIQUE/);
  });
  it('sans partVideo · rétrocompatible, angle seul', () => {
    const c = consigneAngleMarche({ angleLabel: 'Témoignage', marque: 'Klorea' })!;
    expect(c).toContain('Témoignage');
    expect(c).not.toMatch(/VIDÉO|STATIQUE/);
  });
});

const MARQUES = readFileSync(join(process.cwd(), 'components/MarquesSuivies.tsx'), 'utf8');

describe('le CTA studio arme le format', () => {
  it('la consigne passe partVideo au studio', () => {
    expect(MARQUES).toMatch(/consigneAngleMarche\(\{[^}]*partVideo: brief\.partVideo/);
  });
});
