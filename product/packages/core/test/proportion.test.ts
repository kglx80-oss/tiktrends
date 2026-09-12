import { describe, expect, it } from 'vitest';
import { partDeMax } from '../src/proportion';

/**
 * La part d'une valeur sur un maximum · ce qui donne la largeur d'une barre. On
 * éprouve les bornes (jamais < 0, jamais > 1) et la sûreté (max nul → 0, pas NaN).
 */
describe('partDeMax · une part bornée et sûre', () => {
  it('rend la proportion attendue', () => {
    expect(partDeMax(50, 100)).toBe(0.5);
    expect(partDeMax(0, 100)).toBe(0);
    expect(partDeMax(100, 100)).toBe(1);
  });

  it('ne déborde jamais [0, 1]', () => {
    expect(partDeMax(150, 100)).toBe(1);   // au-delà du max → plafonné
    expect(partDeMax(-10, 100)).toBe(0);   // négatif → planché
  });

  it('reste sûre quand le max est nul ou absurde', () => {
    expect(partDeMax(50, 0)).toBe(0);          // pas de division par zéro
    expect(partDeMax(50, -100)).toBe(0);
    expect(partDeMax(Number.NaN, 100)).toBe(0);
    expect(partDeMax(50, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
