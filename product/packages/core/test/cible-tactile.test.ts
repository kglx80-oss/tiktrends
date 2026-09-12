import { describe, expect, it } from 'vitest';
import { CIBLE_TACTILE_MIN, cibleAccessible } from '../src/cible-tactile';

/**
 * Le seuil de cible tactile · ce qui décide qu'un bouton se rate au doigt ou non.
 * On éprouve le seuil retenu (40) et l'accessibilité aux DEUX dimensions.
 */
describe('cible-tactile · le minimum maison', () => {
  it('le minimum maison est 40 px', () => {
    expect(CIBLE_TACTILE_MIN).toBe(40);
  });

  it('une cible n’est accessible que si SES DEUX dimensions atteignent le minimum', () => {
    expect(cibleAccessible(40, 40)).toBe(true);
    expect(cibleAccessible(48, 48)).toBe(true);
    expect(cibleAccessible(30, 30)).toBe(false); // le ★ de la veille avant ce durcissement
    expect(cibleAccessible(40, 24)).toBe(false); // large mais trop plat
    expect(cibleAccessible(24, 40)).toBe(false); // haut mais trop étroit
  });

  it('le seuil par défaut de cibleAccessible EST le minimum maison', () => {
    // 39 échoue, 40 passe · la frontière est bien à CIBLE_TACTILE_MIN.
    expect(cibleAccessible(CIBLE_TACTILE_MIN - 1, 100)).toBe(false);
    expect(cibleAccessible(CIBLE_TACTILE_MIN, 100)).toBe(true);
  });
});
