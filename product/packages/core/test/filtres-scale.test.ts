import { describe, it, expect } from 'vitest';
import { lireFiltresScale, ecrireFiltresScale, FILTRES_SCALE_DEFAUT } from '../src';

describe('Ce qui scale · filtres dans l’URL (lot 18B)', () => {
  const admis = { annonceurs: ['Old Spice.', 'Neutrogena'], angles: ['other'] };
  it('aller-retour · seuls les écarts au défaut sont écrits, la niche reste', () => {
    const f = { type: 'video' as const, annonceur: 'Old Spice.', angle: 'other', texte: 'peau', tri: 'duration' as const };
    const s = ecrireFiltresScale('?q=caf%C3%A9&country=FR', f);
    expect(s).toBe('?q=caf%C3%A9&country=FR&type=video&annonceur=Old+Spice.&angle=other&texte=peau&tri=duration');
    expect(lireFiltresScale(s, admis)).toEqual(f);
    expect(ecrireFiltresScale(s, FILTRES_SCALE_DEFAUT)).toBe('?q=caf%C3%A9&country=FR');
  });
  it('un annonceur ou un angle absent de l’échantillon, une valeur inconnue · défaut', () => {
    expect(lireFiltresScale('?annonceur=Inconnu&angle=offer&type=gif&tri=x', admis)).toEqual(FILTRES_SCALE_DEFAUT);
  });
});
