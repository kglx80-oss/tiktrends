import { describe, expect, it } from 'vitest';
import { idsHomonymes } from '../src/carte-homonymes';

/**
 * CDC v7 · N06 · on ne distingue QUE les titres qui se confondent.
 */
describe('idsHomonymes · les titres partagés, et eux seuls', () => {
  it('un titre unique n’est jamais marqué', () => {
    const h = idsHomonymes([{ id: 'a', titre: 'Alpha' }, { id: 'b', titre: 'Beta' }]);
    expect(h.size).toBe(0);
  });

  it('deux titres identiques marquent LES DEUX', () => {
    const h = idsHomonymes([{ id: 'a', titre: 'Ma piscine' }, { id: 'b', titre: 'Ma piscine' }, { id: 'c', titre: 'Autre' }]);
    expect(h.has('a')).toBe(true);
    expect(h.has('b')).toBe(true);
    expect(h.has('c'), 'un titre unique reste net').toBe(false);
  });

  it('casse et espaces ne créent pas de faux uniques', () => {
    const h = idsHomonymes([{ id: 'a', titre: '  Ma  Piscine ' }, { id: 'b', titre: 'ma piscine' }]);
    expect(h.has('a')).toBe(true);
    expect(h.has('b')).toBe(true);
  });

  it('un titre vide ne compte pas comme homonyme · rien à distinguer', () => {
    const h = idsHomonymes([{ id: 'a', titre: '' }, { id: 'b', titre: '   ' }]);
    expect(h.size).toBe(0);
  });
});
