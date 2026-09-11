import { describe, it, expect } from 'vitest';
import { epochDuJeton, sessionEpochValide } from '../lib/session-epoch';

/** La règle pure de révocation de session · testée sur son RÉSULTAT. */
describe('époque de session', () => {
  describe('epochDuJeton', () => {
    it('lit l’entier figé dans le jeton', () => {
      expect(epochDuJeton({ ep: 3 })).toBe(3);
    });
    it('jeton sans époque = 0 · un ancien cookie (avant la colonne) reste lisible', () => {
      expect(epochDuJeton({ uid: 'x' })).toBe(0);
      expect(epochDuJeton({})).toBe(0);
      expect(epochDuJeton(null)).toBe(0);
    });
    it('valeur douteuse = 0, du côté sûr', () => {
      expect(epochDuJeton({ ep: -1 })).toBe(0);
      expect(epochDuJeton({ ep: 1.5 })).toBe(0);
      expect(epochDuJeton({ ep: 'abc' })).toBe(0);
    });
  });

  describe('sessionEpochValide', () => {
    it('même époque = valide', () => {
      expect(sessionEpochValide(2, 2)).toBe(true);
      expect(sessionEpochValide(0, 0)).toBe(true);
    });
    it('époque révolue = invalide · c’est ce qui coupe le jeton après un reset', () => {
      // Jeton émis à l'époque 2, compte passé à 3 (reset) → refusé.
      expect(sessionEpochValide(2, 3)).toBe(false);
      // Ancien cookie sans époque (0) après le premier incrément → refusé.
      expect(sessionEpochValide(0, 1)).toBe(false);
    });
  });
});
