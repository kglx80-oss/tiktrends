import { describe, expect, it } from 'vitest';
import { creditsAnnoncesLot, prixEssai, ESSAI_VARIABLES } from '../src/essai';

/**
 * S21 · le prix annoncé AVANT le clic doit être celui qui sera prélevé.
 *
 * Un essai d'accroches ou de mises en page ne produit qu'UNE image (la scène
 * est tenue) · la barre affichait pourtant le plein tarif d'un lot de N. On
 * vérifie le RÉSULTAT : l'annonce d'un essai suit les images réelles, et elle
 * est EXACTEMENT le débit serveur (`prixEssai`) · aucune sur-annonce possible.
 */
describe('S21 · crédits annoncés d’un lot', () => {
  const C = 4; // crédits par image (ex. GPT Image)

  it('un essai accroche / mise en page n’annonce qu’une image', () => {
    expect(creditsAnnoncesLot('accroche', 6, C)).toBe(C);
    expect(creditsAnnoncesLot('mise_en_page', 6, C)).toBe(C);
  });

  it('un essai d’ambiances annonce une image par publicité', () => {
    expect(creditsAnnoncesLot('univers', 6, C)).toBe(6 * C);
  });

  it('hors essai, une image par publicité', () => {
    expect(creditsAnnoncesLot(null, 6, C)).toBe(6 * C);
    expect(creditsAnnoncesLot(null, 1, C)).toBe(C);
  });

  it('pour tout essai, l’annonce est EXACTEMENT le débit serveur (prixEssai)', () => {
    for (const v of ESSAI_VARIABLES) {
      for (const n of [1, 3, 6, 12]) {
        expect(creditsAnnoncesLot(v, n, C), `${v}×${n}`).toBe(prixEssai(v, n, C));
      }
    }
  });

  it('borne les entrées aberrantes sans annoncer de négatif', () => {
    expect(creditsAnnoncesLot(null, 0, C)).toBe(C); // au moins une pub
    expect(creditsAnnoncesLot(null, 6, -3)).toBe(0); // crédits jamais négatifs
  });
});
