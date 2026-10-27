import { describe, expect, it } from 'vitest';
import { libelleMecanique, pourcentFr } from '../src/index';

/** Vu au banc riche (27/10) : valeurs machine affichées brutes dans Résultats. */
describe('Résultats · valeurs machine en clair', () => {
  it('mécanisme d’angle, ouverture, accroche · le libellé, jamais le code', () => {
    expect(libelleMecanique('problem_agitate')).toBe('Problème agité');
    expect(libelleMecanique('statistic_shock')).toBe('Chiffre choc');
    expect(libelleMecanique('before_after')).toBe('Avant / après');
    expect(libelleMecanique('face_talking')).toBe('Visage qui parle');
    expect(libelleMecanique('question')).toBe('Question');
    expect(libelleMecanique('code_inconnu')).toBe('code inconnu');
    expect(libelleMecanique('')).toBeNull();
    expect(libelleMecanique(null)).toBeNull();
  });

  it('un taux s’écrit à la française, une décimale · absent quand il n’y a pas de mesure', () => {
    expect(pourcentFr(0.419, '–')).toBe('41,9 %');
    expect(pourcentFr(0.018, '–')).toBe('1,8 %');
    expect(pourcentFr(1.2346, '–')).toBe('123,5 %');
    expect(pourcentFr(null, '–')).toBe('–');
    expect(pourcentFr(Number.NaN, 'n.c.')).toBe('n.c.');
  });
});
