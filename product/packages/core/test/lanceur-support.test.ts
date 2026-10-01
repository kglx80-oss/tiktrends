import { describe, expect, it } from 'vitest';
import { placementLanceurSupport } from '../src/lanceur-support';

describe('placementLanceurSupport', () => {
  it('Connexions ancre le lanceur · la bulle fixe recouvrait « Afficher » et « Connecter » à 390', () => {
    expect(placementLanceurSupport('/connections')).toBe('ancre');
  });
  it('les écrans déjà ancrés le restent', () => {
    for (const r of ['/studio/ads', '/dashboard', '/veille', '/adsmap', '/analytics']) expect(placementLanceurSupport(r), r).toBe('ancre');
  });
  it('la conversation Jarvis n’a pas de lanceur, les autres routes gardent la bulle', () => {
    expect(placementLanceurSupport('/jarvis')).toBe('aucun');
    expect(placementLanceurSupport('/jarvis/sources')).toBe('flottant');
    expect(placementLanceurSupport('/assets')).toBe('flottant');
  });
});
