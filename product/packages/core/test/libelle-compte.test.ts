import { describe, it, expect } from 'vitest';
import { phraseCompte } from '../src/libelle-compte';

/**
 * Le défaut vu sur la page de garde du Studio, mot pour mot : « Aucune visuel »,
 * « Aucune brief ». Un nom masculin prenait l'accord féminin. On fige donc
 * l'accord des deux genres à zéro, et le pluriel au-delà.
 */
describe('la phrase d’un compteur accorde « aucun » au genre', () => {
  it('zéro, masculin → « Aucun »', () => {
    expect(phraseCompte(0, 'visuel', 'm')).toBe('Aucun visuel pour l’instant');
    expect(phraseCompte(0, 'brief', 'm')).toBe('Aucun brief pour l’instant');
  });

  it('zéro, féminin → « Aucune »', () => {
    expect(phraseCompte(0, 'pub', 'f')).toBe('Aucune pub pour l’instant');
    expect(phraseCompte(0, 'vidéo', 'f')).toBe('Aucune vidéo pour l’instant');
  });

  it('un seul · pas de pluriel, pas de « aucun »', () => {
    expect(phraseCompte(1, 'vidéo', 'f')).toBe('1 vidéo');
    expect(phraseCompte(1, 'visuel', 'm')).toBe('1 visuel');
  });

  it('plusieurs · pluriel', () => {
    expect(phraseCompte(41, 'pub', 'f')).toBe('41 pubs');
    expect(phraseCompte(3, 'brief', 'm')).toBe('3 briefs');
  });
});
