import { describe, expect, it } from 'vitest';
import { placementLanceurSupport, reserveFocusLanceur, RESERVE_FOCUS_LANCEUR_FLOTTANT } from '../src/lanceur-support';

/**
 * Lot 20 · le bouton de support et le focus clavier à 390.
 *
 * Mesuré au navigateur sur `70200777` (390 × 720, données synthétiques) · la
 * bulle fixe (314,644 → 370,700) masquait l'élément qui reçoit le focus au Tab ·
 * /jarvis/sources « Détail › » 55 %, /console un champ 29 %, /veille/formats
 * (grille) « Classées récemment » 20 %, /admin 8 %. Le navigateur fait défiler
 * le focus juste dans la fenêtre · sous la bulle.
 */
describe('lot 20 · réserve de focus du lanceur flottant', () => {
  it('flottant · le focus garde la hauteur de la bulle et sa marge libres', () => {
    expect(reserveFocusLanceur('flottant')).toBe(RESERVE_FOCUS_LANCEUR_FLOTTANT);
    // Bulle · 56 px de haut à 20 px du bas = 76 px occupés · + 20 px de marge.
    expect(RESERVE_FOCUS_LANCEUR_FLOTTANT).toBeGreaterThanOrEqual(76 + 16);
  });
  it('ancré ou absent · aucune réserve (rien ne flotte)', () => {
    expect(reserveFocusLanceur('ancre')).toBe(0);
    expect(reserveFocusLanceur('aucun')).toBe(0);
  });
  it('/veille/formats ancre le lanceur comme /veille et /saved (sélecteur Format recouvert à 390)', () => {
    expect(placementLanceurSupport('/veille/formats')).toBe('ancre');
    for (const r of ['/veille', '/saved', '/veille/scale']) expect(placementLanceurSupport(r), r).toBe('ancre');
  });
});
