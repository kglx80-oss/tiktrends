import { describe, it, expect } from 'vitest';
import {
  CIBLE_TACTILE_MIN,
  HAUTEUR_RANGEE_FINE,
  HAUTEUR_RANGEE_TACTILE,
  hauteurRangeeRail,
  hauteurPileTetes,
} from '../src/index';

/**
 * La densité du rail · une rangée par pointeur (H2 · nav façon Flora).
 *
 * On vérifie le RÉSULTAT (les hauteurs décidées), pas qu'une fonction est
 * appelée. La règle : 44 au doigt (jamais moins), une rangée fine DANS 32-36 à
 * la souris, et une pile de têtes qui, en fine, tient là où la même pile en
 * tactile déborderait.
 */
describe('rail · densité par pointeur', () => {
  it('au doigt (tactile), la rangée ne descend jamais sous la cible tactile', () => {
    expect(hauteurRangeeRail(true)).toBe(CIBLE_TACTILE_MIN);
    expect(HAUTEUR_RANGEE_TACTILE).toBe(CIBLE_TACTILE_MIN);
  });

  it('à la souris (fine), la rangée est DANS la fourchette 32-36, avec marge', () => {
    expect(hauteurRangeeRail(false)).toBe(HAUTEUR_RANGEE_FINE);
    expect(HAUTEUR_RANGEE_FINE).toBeGreaterThanOrEqual(32);
    expect(HAUTEUR_RANGEE_FINE).toBeLessThanOrEqual(36);
  });

  it('la rangée fine est STRICTEMENT plus courte que la tactile · c’est le levier de densité', () => {
    expect(hauteurRangeeRail(false)).toBeLessThan(hauteurRangeeRail(true));
  });

  it('densifier fait GAGNER exactement la hauteur des têtes économisée', () => {
    // À nombre d'entrées égal, passer du tactile au fin ne touche pas les en-têtes
    // de section (mêmes libellés) · le gain est exactement le raccourcissement des
    // têtes. C'est un RÉSULTAT vérifiable, pas un seuil posé d'instinct : la valeur
    // absolue « tient-il à 720 » se mesure au navigateur (recette 720, requise).
    const tetes = 8;
    const entetes = 4;
    const fine = hauteurPileTetes({ tetes, entetes, tactile: false });
    const tactile = hauteurPileTetes({ tetes, entetes, tactile: true });
    expect(fine).toBeLessThan(tactile);
    expect(tactile - fine).toBe(tetes * (HAUTEUR_RANGEE_TACTILE - HAUTEUR_RANGEE_FINE));
  });
});
