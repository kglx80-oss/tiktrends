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
    expect(placementLanceurSupport('/brands/new')).toBe('flottant');
  });
  it('Assets et Radar produits ancrent le lanceur (puce « Audio », « Retravailler au Studio » recouverts)', () => {
    expect(placementLanceurSupport('/assets')).toBe('ancre');
    expect(placementLanceurSupport('/radar')).toBe('ancre');
  });
  it('Sauvegardes ancre le lanceur (★, « Site ↗ », « + Suivre » recouverts une fois remplie)', () => {
    expect(placementLanceurSupport('/saved')).toBe('ancre');
  });
  it('Tagging ancre le lanceur · la bulle masquait la valeur et la barre de « Persona / Femme 30–45 » à 390', () => {
    expect(placementLanceurSupport('/tags')).toBe('ancre');
    // Lot 8 · mesuré au recouvrement des textes et chiffres, écrans remplis.
    for (const r of ['/team', '/usage', '/credits', '/support']) expect(placementLanceurSupport(r), r).toBe('ancre');
    expect(placementLanceurSupport('/support/un-ticket'), 'un ticket seul ne recouvrait rien').toBe('flottant');
    // Lot 9 · Studio rempli, mesuré à 390 et 1280×720.
    for (const r of ['/studio', '/studio/image', '/studio/video', '/studio/textes']) expect(placementLanceurSupport(r), r).toBe('ancre');
  });
});
