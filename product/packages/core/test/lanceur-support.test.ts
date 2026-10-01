import { describe, expect, it } from 'vitest';
import { placementLanceurSupport } from '../src/lanceur-support';

describe('placementLanceurSupport', () => {
  it('Connexions ancre le lanceur · la bulle fixe recouvrait « Afficher » et « Connecter » à 390', () => {
    expect(placementLanceurSupport('/connections')).toBe('ancre');
  });
  it('Réglages ancre le lanceur · la bulle masquait le texte White-label à 390', () => {
    expect(placementLanceurSupport('/settings')).toBe('ancre');
  });
  it('fiche Marque ancre le lanceur (champ « Site » recouvert à 390), pas la création ni les sous-pages', () => {
    expect(placementLanceurSupport('/brands/a6132eb0-492c-40de-b73b-3d1644a014dc')).toBe('ancre');
    expect(placementLanceurSupport('/brands/new')).toBe('flottant');
    expect(placementLanceurSupport('/brands/x/competitors/Rival')).toBe('flottant');
  });
  it('Ce qui scale ancre le lanceur (Tri, Copier, ☆, + Suivre recouverts)', () => {
    expect(placementLanceurSupport('/veille/scale')).toBe('ancre');
  });
  it('les écrans déjà ancrés le restent', () => {
    for (const r of ['/studio/ads', '/dashboard', '/veille', '/adsmap', '/analytics']) expect(placementLanceurSupport(r), r).toBe('ancre');
  });
  it('la conversation Jarvis n’a pas de lanceur, les autres routes gardent la bulle', () => {
    expect(placementLanceurSupport('/jarvis')).toBe('aucun');
    expect(placementLanceurSupport('/jarvis/sources')).toBe('flottant');
    expect(placementLanceurSupport('/team')).toBe('flottant');
  });
  it('Assets et Radar produits ancrent le lanceur (puce « Audio », « Retravailler au Studio » recouverts)', () => {
    expect(placementLanceurSupport('/assets')).toBe('ancre');
    expect(placementLanceurSupport('/radar')).toBe('ancre');
  });
});
