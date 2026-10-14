import { describe, it, expect } from 'vitest';
import {
  CIBLE_TACTILE_MIN,
  HAUTEUR_RANGEE_FINE,
  HAUTEUR_RANGEE_TACTILE,
  HAUTEUR_RANGEE_V5,
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
  // Lot V5 · B · le rail est plat (six modules) depuis l'UX V2 · la densité
  // 32-36 du rail à branches (30/09) n'a plus d'objet. La V5 pose UNE rangée de
  // 46 (mesurée sur la référence), au doigt comme à la souris.
  it('au doigt (tactile), la rangée ne descend jamais sous la cible tactile', () => {
    expect(hauteurRangeeRail(true)).toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN);
    expect(HAUTEUR_RANGEE_TACTILE).toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN);
  });

  it('V5 · la rangée vaut 46 (mesurée sur la référence), souris comme doigt', () => {
    expect(HAUTEUR_RANGEE_V5).toBe(46);
    expect(hauteurRangeeRail(false)).toBe(HAUTEUR_RANGEE_FINE);
    expect(HAUTEUR_RANGEE_FINE).toBe(HAUTEUR_RANGEE_V5);
    expect(hauteurRangeeRail(true)).toBe(HAUTEUR_RANGEE_V5);
  });

  it('les six modules tiennent à 720 en desktop, sous la tête et au-dessus du pied', () => {
    // Mesuré au navigateur (banc local, 1440 × 720, propriétaire, lot V5 · B) ·
    // tête du rail (mot-symbole + espace + marque) 187 px, pied (Aide exclue ·
    // pastille + profil) 164 px. Les six modules (46 + 5 d'écart) doivent tenir
    // entre les deux · « Votre espace » et l'Aide défilent si la place manque.
    const tete = 187;
    const pied = 164;
    const modules = hauteurPileTetes({ tetes: 6, entetes: 0, tactile: false }) + 5 * 5;
    expect(modules).toBeLessThanOrEqual(720 - tete - pied);
  });
});
