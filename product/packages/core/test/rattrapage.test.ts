import { describe, expect, it } from 'vitest';
import {
  estCassee, graviteControle, reprisePreferable, budgetReprises,
  imagesAReserver, indicesARattraper, TAUX_REPRISE, type ConstatRelecture,
} from '../src/rattrapage';

/**
 * Les règles du rattrapage.
 *
 * Ce qu'on éprouve · qu'un `null` (produit non regardé) n'est jamais « cassé »,
 * qu'on garde la reprise UNIQUEMENT si elle est strictement meilleure, et que le
 * budget borne sans jamais reprendre une pub saine.
 */

const conforme: ConstatRelecture = { accrocheReecrite: false, produitFidele: true, texteLisible: true };
const sansRef: ConstatRelecture = { accrocheReecrite: false, produitFidele: null };
const produitKo: ConstatRelecture = { accrocheReecrite: false, produitFidele: false };
const accrocheKo: ConstatRelecture = { accrocheReecrite: true, produitFidele: true };
const doubleKo: ConstatRelecture = { accrocheReecrite: true, produitFidele: false };
const illisibleKo: ConstatRelecture = { accrocheReecrite: false, produitFidele: true, texteLisible: false };

describe('ce qui compte comme cassé', () => {
  it('un produit non regardé n’est pas cassé', () => {
    // `null` n'est pas « conforme » · c'est « pas de référence », et on ne
    // reprend pas une pub sur un défaut qu'on n'a pas constaté.
    expect(estCassee(sansRef)).toBe(false);
    expect(estCassee(conforme)).toBe(false);
    expect(estCassee(null)).toBe(false);
  });

  it('accroche réécrite, produit modifié ou texte illisible sont cassés', () => {
    expect(estCassee(accrocheKo)).toBe(true);
    expect(estCassee(produitKo)).toBe(true);
    expect(estCassee(illisibleKo)).toBe(true);
  });

  it('un texte non jugé (pas de texte) n’est pas cassé', () => {
    // `texteLisible` absent ou null · comme le produit sans référence, on ne
    // reprend pas sur un défaut qu'on n'a pas constaté.
    expect(estCassee({ accrocheReecrite: false, produitFidele: true })).toBe(false);
    expect(estCassee({ accrocheReecrite: false, produitFidele: true, texteLisible: null })).toBe(false);
  });

  it('l’accroche pèse plus lourd que le produit ou la lisibilité', () => {
    expect(graviteControle(accrocheKo)).toBeGreaterThan(graviteControle(produitKo));
    expect(graviteControle(accrocheKo)).toBeGreaterThan(graviteControle(illisibleKo));
    expect(graviteControle(illisibleKo), 'produit et lisibilité pèsent pareil').toBe(graviteControle(produitKo));
    expect(graviteControle(doubleKo)).toBeGreaterThan(graviteControle(accrocheKo));
    expect(graviteControle(conforme)).toBe(0);
  });
});

describe('on ne garde la reprise que si elle est meilleure', () => {
  it('une reprise qui répare remplace l’original', () => {
    expect(reprisePreferable(accrocheKo, conforme)).toBe(true);
    expect(reprisePreferable(doubleKo, produitKo)).toBe(true);
  });

  it('un échange latéral ne remplace rien', () => {
    // On a déjà payé la reprise · mais rejouer une image aussi cassée (ou
    // cassée autrement, à gravité égale) n'achète rien, et parfois recule.
    expect(reprisePreferable(accrocheKo, accrocheKo)).toBe(false);
    expect(reprisePreferable(produitKo, accrocheKo), 'une accroche cassée n’est pas un progrès sur un produit cassé').toBe(false);
  });

  it('une reprise pire est rejetée', () => {
    expect(reprisePreferable(produitKo, doubleKo)).toBe(false);
  });
});

describe('le budget de reprise borne, sans jamais reprendre une pub saine', () => {
  it('la moitié du lot, arrondie au-dessus', () => {
    expect(TAUX_REPRISE).toBe(0.5);
    expect(budgetReprises(6)).toBe(3);
    expect(budgetReprises(5)).toBe(3);
    expect(budgetReprises(1)).toBe(1);
    expect(budgetReprises(0)).toBe(0);
  });

  it('on réserve la base plus la marge, seulement quand la reprise s’applique', () => {
    // C'est ce nombre qu'on annonce avant le clic · le plafond est dit, le
    // non-utilisé remboursé.
    expect(imagesAReserver(6, true)).toBe(9);
    expect(imagesAReserver(6, false)).toBe(6);
  });

  it('reprend les plus cassées d’abord, et s’arrête au budget', () => {
    const constats = [conforme, produitKo, doubleKo, accrocheKo, sansRef];
    // budget 2 · les deux plus graves sont doubleKo (i=2) puis accrocheKo (i=3).
    expect(indicesARattraper(constats, 2)).toEqual([2, 3]);
  });

  it('un lot sain ne déclenche aucune reprise, même à gros budget', () => {
    expect(indicesARattraper([conforme, sansRef, conforme], 10)).toEqual([]);
  });
});
