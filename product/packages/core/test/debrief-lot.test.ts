import { describe, expect, it } from 'vitest';
import { debriefLot, type RelecturePub } from '../src/adsmap/debrief-lot';

/**
 * Le débrief d'un lot entière.
 *
 * Il COMPTE, il ne conclut pas · pas d'intervalle, pas de minimum d'effectif.
 * Ce qu'on éprouve ici, c'est que « tout bon » ne s'allume que sur les deux
 * écarts éliminatoires, et que le silence (rien à relire) reste `null`.
 */

function lot(n: number, o: Partial<RelecturePub> = {}): RelecturePub[] {
  return Array.from({ length: n }, () => ({
    accrocheReecrite: o.accrocheReecrite ?? false,
    copieMineure: o.copieMineure ?? false,
    produitFidele: o.produitFidele === undefined ? true : o.produitFidele,
  }));
}

describe('rien à relire', () => {
  it('un lot sans relecture ne prétend rien', () => {
    // C'est le cas d'un lot composé, ou d'une relecture qui n'a pas tourné.
    // Rendre « 0 conforme » le ferait lire comme un échec là où il n'y a eu
    // aucune mesure.
    expect(debriefLot([])).toBeNull();
  });
});

describe('« tout bon » ne s’allume que sur l’éliminatoire', () => {
  it('tout conforme et tout fidèle · le lot est publiable', () => {
    const d = debriefLot(lot(6))!;
    expect(d.n).toBe(6);
    expect(d.toutBon).toBe(true);
    expect(d.resume).toContain('toutes les accroches sont conformes');
    expect(d.resume).toContain('6 produits fidèles sur 6 avec photo');
  });

  it('une accroche réécrite casse « tout bon »', () => {
    const d = debriefLot([...lot(5), ...lot(1, { accrocheReecrite: true })])!;
    expect(d.accrocheReecrite).toBe(1);
    expect(d.accrocheConforme).toBe(5);
    expect(d.toutBon, 'une accroche réécrite doit suffire à retirer le lot du publiable').toBe(false);
    expect(d.resume).toContain('5 accroches conformes, 1 réécrite');
  });

  it('un écart MINEUR ne casse pas « tout bon »', () => {
    // La différence qui compte · un accent perdu se corrige, une accroche
    // réécrite change ce que la pub dit. Confondre les deux ferait rejeter des
    // lots parfaitement utilisables.
    const d = debriefLot([...lot(4), ...lot(2, { copieMineure: true })])!;
    expect(d.accrocheMineure).toBe(2);
    expect(d.accrocheReecrite).toBe(0);
    expect(d.toutBon, 'un écart mineur n’est pas éliminatoire').toBe(true);
    expect(d.resume).toContain('2 avec un écart mineur');
  });

  it('un produit modifié casse « tout bon »', () => {
    const d = debriefLot([...lot(3), ...lot(1, { produitFidele: false })])!;
    expect(d.produitInfidele).toBe(1);
    expect(d.toutBon).toBe(false);
    expect(d.resume).toContain('3 produits fidèles sur 4 avec photo, 1 modifié');
  });
});

describe('le produit ne se compte que sur les pubs avec référence', () => {
  it('les pubs sans photo n’entrent pas au dénominateur', () => {
    // Même règle que le cumul · sans référence, la relecture n'a rien regardé,
    // et la compter comme conforme gonflerait un taux qu'on n'a pas mesuré.
    const d = debriefLot([...lot(2, { produitFidele: true }), ...lot(3, { produitFidele: null })])!;
    expect(d.avecReference).toBe(2);
    expect(d.sansReference).toBe(3);
    expect(d.produitFidele).toBe(2);
    expect(d.resume).toContain('2 produits fidèles sur 2 avec photo');
  });

  it('aucune photo produit · le lot peut rester « tout bon » côté copie', () => {
    // On n'invente pas un défaut qu'on n'a pas pu regarder · un lot dont la
    // copie tient, sur des marques sans photo, reste publiable.
    const d = debriefLot(lot(4, { produitFidele: null }))!;
    expect(d.avecReference).toBe(0);
    expect(d.toutBon).toBe(true);
    expect(d.resume).toContain('aucune photo produit');
    expect(d.resume).toContain('n’a pas pu être vérifiée');
  });
});
