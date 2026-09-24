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
  it('les côtés utilisent clamp(16px, 4vw, 36px), pas une marge figée', () => {
    const p = String(pageWrap.padding ?? '');
    expect(p.includes('clamp(16px, 4vw, 36px)'), `padding fluide attendu, obtenu « ${p} »`).toBe(true);
    // Garde-fou anti-régression : plus aucune gouttière latérale fixe.
    expect(/\d+px\s+36px\s+\d+px/.test(p), 'plus de gouttière figée à 36px').toBe(false);
  });

  it('la largeur max et le centrage sont conservés', () => {
    expect(pageWrap.maxWidth).toBe(860);
    expect(pageWrap.margin).toBe('0 auto');
  });
});
