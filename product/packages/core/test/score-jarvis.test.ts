import { describe, expect, it } from 'vitest';
import { niveauScore, LABEL_NIVEAU, COULEUR_NIVEAU, SEUIL_FORT, SEUIL_CORRECT } from '../src/score-jarvis';

/**
 * Le barème unique du Score Jarvis · gagnant ≥ 75, à itérer 55-74, à jeter < 55.
 * On vérifie les BORNES exactes, là où un décalage d'un point se cache.
 */
describe('niveauScore · un seul barème, bornes comprises', () => {
  it('gagnant à partir de 75 · pas à 74', () => {
    expect(niveauScore(75)).toBe('fort');
    expect(niveauScore(74)).toBe('correct');
    expect(niveauScore(100)).toBe('fort');
  });

  it('à itérer de 55 à 74 · pas à 54', () => {
    expect(niveauScore(55)).toBe('correct');
    expect(niveauScore(74)).toBe('correct');
    expect(niveauScore(54)).toBe('faible');
  });

  it('à jeter en dessous de 55', () => {
    expect(niveauScore(0)).toBe('faible');
    expect(niveauScore(54)).toBe('faible');
  });

  it('les bornes exportées sont bien 75 et 55', () => {
    expect(SEUIL_FORT).toBe(75);
    expect(SEUIL_CORRECT).toBe(55);
  });

  it('chaque palier a une étiquette et une couleur', () => {
    for (const n of ['fort', 'correct', 'faible'] as const) {
      expect(LABEL_NIVEAU[n]).toBeTruthy();
      expect(COULEUR_NIVEAU[n]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
