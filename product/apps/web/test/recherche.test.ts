import { describe, it, expect } from 'vitest';
import { normaliser, scoreRecherche } from '../lib/recherche';

describe('la recherche ⌘K ignore la casse ET les accents', () => {
  it('normalise en minuscules sans accents', () => {
    expect(normaliser('Créa')).toBe('crea');
    expect(normaliser('ÉLÉMENT')).toBe('element');
    expect(normaliser('Tagué')).toBe('tague');
  });

  it('« crea » trouve « Créa » · l’accent n’est plus un obstacle', () => {
    expect(scoreRecherche('crea', 'Créa'), 'un accent bloquait la recherche').toBeGreaterThan(0);
    expect(scoreRecherche('element', 'Élément')).toBeGreaterThan(0);
  });

  it('reste insensible à la casse', () => {
    expect(scoreRecherche('VEILLE', 'Veille')).toBe(100);
  });

  it('un préfixe score plus haut qu’une sous-séquence', () => {
    expect(scoreRecherche('vei', 'Veille')).toBeGreaterThan(scoreRecherche('vle', 'Veille'));
  });

  it('rend 0 quand rien ne correspond', () => {
    expect(scoreRecherche('zzz', 'Veille')).toBe(0);
  });
});
