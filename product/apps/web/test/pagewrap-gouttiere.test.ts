import { describe, it, expect } from 'vitest';
import { pageWrap } from '../components/ui';

/**
 * La gouttière des pages à formulaire (réglages, profil, support) suit la même
 * règle fluide que TOUT le reste de l'app.
 *
 * `pageWrap` figeait ses marges latérales à 36px · sur un téléphone, 72px de
 * marge mangés au lieu des 16px partout ailleurs (le contenu se retrouvait
 * tassé au centre). On aligne sur `clamp(16px, 4vw, 36px)` · large au bureau,
 * étroit au mobile. On vérifie le RÉSULTAT : la valeur de padding porte le
 * clamp, jamais une gouttière fixe.
 */

describe('pageWrap · gouttière fluide', () => {
  // Depuis B2 (#118), `pageWrap` EST le cadre commun (`cadrePage`) · 1200,
  // gouttières 32 desktop / 16 mobile (charte).
  it('les côtés utilisent clamp(16px, 4vw, 32px), pas une marge figée', () => {
    const p = String(pageWrap.padding ?? '');
    expect(p.includes('clamp(16px, 4vw, 32px)'), `padding fluide attendu, obtenu « ${p} »`).toBe(true);
    // Garde-fou anti-régression : plus aucune gouttière latérale fixe.
    expect(/\d+px\s+3[26]px\s+\d+px/.test(p), 'plus de gouttière figée').toBe(false);
  });

  // Lot V5 · B · la largeur max suit le cadre commun V5 (1500, au lieu de 1200).
  // Correctif « gros écart » · le cadre est COLLÉ au rail (aligné à gauche),
  // plus centré · sur un écran large, `0 auto` ouvrait un vide entre le rail et
  // le contenu (mesuré · 150 px à 1920, 470 px à 2560) et désalignait le fil.
  it('la largeur max est conservée et le cadre est collé à gauche (plus centré)', () => {
    expect(pageWrap.maxWidth).toBe(1500);
    // Marge gauche nulle, l'espace en trop à DROITE · jamais `0 auto` (centré).
    const m = String(pageWrap.margin ?? '');
    expect(m, `cadre centré « ${m} » · le gros écart revient`).not.toBe('0 auto');
    const [, droite = '', , gauche = ''] = m.split(/\s+/);
    expect(gauche === '0' || gauche === '0px', `bord gauche collé attendu, obtenu « ${m} »`).toBe(true);
    expect(droite, `espace en trop à droite (auto) attendu, obtenu « ${m} »`).toBe('auto');
  });
});
