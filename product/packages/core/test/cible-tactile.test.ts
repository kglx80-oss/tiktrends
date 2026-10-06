import { describe, expect, it } from 'vitest';
import { CIBLE_TACTILE_MIN, CIBLE_POINTEUR_FIN_MIN, boitesSeRecouvrent, cibleAccessible, cibleSelonPointeur, cotePileRetours } from '../src/cible-tactile';

/**
 * Le seuil de cible tactile · ce qui décide qu'un bouton se rate au doigt ou non.
 * On éprouve le seuil retenu (44, la charte design.md · AAA / Apple HIG) et
 * l'accessibilité aux DEUX dimensions.
 */
describe('cible-tactile · le minimum maison', () => {
  it('le minimum de la charte est 44 px (AAA / Apple HIG)', () => {
    expect(CIBLE_TACTILE_MIN).toBe(44);
  });

  it('une cible n’est accessible que si SES DEUX dimensions atteignent le minimum', () => {
    expect(cibleAccessible(44, 44)).toBe(true);
    expect(cibleAccessible(48, 48)).toBe(true);
    expect(cibleAccessible(40, 40)).toBe(false); // sous la charte 44 désormais
    expect(cibleAccessible(30, 30)).toBe(false); // le ★ de la veille avant ce durcissement
    expect(cibleAccessible(44, 24)).toBe(false); // large mais trop plat
    expect(cibleAccessible(24, 44)).toBe(false); // haut mais trop étroit
  });

  it('le seuil par défaut de cibleAccessible EST le minimum maison', () => {
    // 39 échoue, 40 passe · la frontière est bien à CIBLE_TACTILE_MIN.
    expect(cibleAccessible(CIBLE_TACTILE_MIN - 1, 100)).toBe(false);
    expect(cibleAccessible(CIBLE_TACTILE_MIN, 100)).toBe(true);
  });
});

describe('cibleSelonPointeur · 44 au doigt, densité AA à la souris', () => {
  it('au doigt, jamais sous la cible tactile', () => {
    expect(cibleSelonPointeur(true)).toBe(CIBLE_TACTILE_MIN);
  });
  it('à la souris, le plancher WCAG 2.5.8 (24), jamais moins', () => {
    expect(cibleSelonPointeur(false)).toBe(CIBLE_POINTEUR_FIN_MIN);
    expect(CIBLE_POINTEUR_FIN_MIN).toBeGreaterThanOrEqual(24);
    expect(CIBLE_POINTEUR_FIN_MIN).toBeLessThan(CIBLE_TACTILE_MIN);
  });
});

describe('cotePileRetours · le retour ne recouvre pas le geste qui l’a déclenché (message 56)', () => {
  const b = (gauche: number, haut: number, droite: number, bas: number) => ({ gauche, haut, droite, bas });
  it('mesure de la recette à 390 × 720 · le ★ sous la pile basse → la pile passe en haut', () => {
    expect(cotePileRetours(b(16, 615, 374, 696), b(323, 604, 367, 648), 720), 'le retour recouvre le ★').toBe('haut');
  });
  it('mesure à 1440 · aucun recouvrement → la pile reste en bas', () => {
    expect(cotePileRetours(b(510, 615, 930, 696), b(465, 406, 509, 450), 720)).toBe('bas');
  });
  it('sans ancre, la pile reste en bas', () => {
    expect(cotePileRetours(b(16, 615, 374, 696), null, 720)).toBe('bas');
  });
  it('si le haut recouvrirait aussi l’ancre, on ne bouge pas (rien de mieux)', () => {
    expect(cotePileRetours(b(16, 300, 374, 420), b(20, 280, 60, 440), 720)).toBe('bas');
  });
  it('la marge compte · 4 px au-dessus de la pile suffisent à basculer, 20 px non', () => {
    expect(cotePileRetours(b(16, 615, 374, 696), b(323, 567, 367, 611), 720)).toBe('haut');
    expect(cotePileRetours(b(16, 615, 374, 696), b(323, 551, 367, 595), 720)).toBe('bas');
  });
  it('boitesSeRecouvrent · bords qui se touchent sans marge ne se recouvrent pas', () => {
    expect(boitesSeRecouvrent(b(0, 0, 10, 10), b(10, 0, 20, 10))).toBe(false);
    expect(boitesSeRecouvrent(b(0, 0, 10, 10), b(9, 0, 20, 10))).toBe(true);
  });
});
