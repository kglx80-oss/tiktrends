import { describe, expect, it } from 'vitest';
import {
  bilanCopie, directionsBiais, MIN_RELECTURES, type RelectureLue, type LigneCopie,
} from '../src/adsmap/bilan-copie';

const ligneCopie = (cle: string, verdict: LigneCopie['verdict'], taux = 0): LigneCopie => ({
  cle, n: 10, reecrites: Math.round(taux * 10), tauxReecriture: taux,
  intervalReecriture: { lo: 0, hi: 0 }, avecReference: 0, produitsModifies: 0,
  tauxProduit: null, intervalProduit: null, verdict,
});

/**
 * Le cumul des relectures.
 *
 * La discipline tenue ici est celle du reste de la carte · un minimum avant de
 * parler, et une comparaison à la moyenne plutôt qu'à zéro.
 */

function lot(n: number, o: Partial<RelectureLue> & { cles?: RelectureLue['cles'] } = {}): RelectureLue[] {
  return Array.from({ length: n }, () => ({
    accrocheReecrite: o.accrocheReecrite ?? false,
    produitFidele: o.produitFidele === undefined ? true : o.produitFidele,
    accentsPerdus: o.accentsPerdus,
    texteLisible: o.texteLisible,
    cles: o.cles ?? {},
  }));
}

describe('les taux généraux', () => {
  it('sans relecture, il ne prétend rien', () => {
    const b = bilanCopie([]);
    expect(b.relues).toBe(0);
    expect(b.tauxReecriture).toBeNull();
    expect(b.tauxProduit).toBeNull();
    expect(b.resume).toContain('Aucune publicité relue');
  });

  it('le produit ne se compte que sur celles qui avaient une référence', () => {
    // Sans référence, la relecture ne conclut rien · les compter comme
    // conformes ferait baisser le taux à mesure qu'on ajoute des marques sans
    // photo produit, ce qui n'apprendrait rien sur les moteurs.
    const b = bilanCopie([
      ...lot(2, { produitFidele: false }),
      ...lot(8, { produitFidele: null }),
    ]);
    expect(b.relues).toBe(10);
    expect(b.avecReference, 'les pubs sans référence sont entrées au dénominateur').toBe(2);
    expect(b.tauxProduit).toBe(1);
  });

  it('le dit quand aucune n’avait de photo produit', () => {
    const b = bilanCopie(lot(5, { produitFidele: null }));
    expect(b.resume).toContain('aucune n’avait de photo produit');
  });
});

describe('un groupe n’a pas toujours le droit de parler', () => {
  it('sous le minimum, la ligne n’apparaît pas', () => {
    // Une ligne à trois publicités se lit comme un classement alors que son
    // intervalle couvre à peu près tout.
    const b = bilanCopie([
      ...lot(MIN_RELECTURES - 1, { accrocheReecrite: true, cles: { moteur: 'rare' } }),
      ...lot(MIN_RELECTURES, { cles: { moteur: 'courant' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes.map((l) => l.cle)).toEqual(['courant']);
  });

  it('une clé absente ne crée pas de groupe', () => {
    // Les publicités antérieures à l'enregistrement de la direction n'en
    // portent pas · les regrouper sous « » inventerait une direction.
    const b = bilanCopie(lot(MIN_RELECTURES, { cles: {} }));
    expect(b.dimensions.every((d) => d.lignes.length === 0)).toBe(true);
  });
});

describe('on compare à la moyenne, pas à zéro', () => {
  it('un groupe qui se trompe autant que les autres ne tranche pas', () => {
    // C'est le cœur de la discipline · « ce moteur a réécrit trois accroches »
    // ne veut rien dire si tous en réécrivent trois.
    const b = bilanCopie([
      ...lot(5, { accrocheReecrite: true, cles: { moteur: 'a' } }),
      ...lot(5, { cles: { moteur: 'a' } }),
      ...lot(5, { accrocheReecrite: true, cles: { moteur: 'b' } }),
      ...lot(5, { cles: { moteur: 'b' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes.every((l) => l.verdict === null)).toBe(true);
    expect(moteurs.conclusif).toBe(false);
    expect(moteurs.resume).toBe('');
  });

  it('un moteur nettement pire se détache', () => {
    const b = bilanCopie([
      ...lot(30, { cles: { moteur: 'fiable' } }),
      ...lot(28, { accrocheReecrite: true, cles: { moteur: 'bavard' } }),
      ...lot(2, { cles: { moteur: 'bavard' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes.find((l) => l.cle === 'bavard')?.verdict).toBe('pire');
    expect(moteurs.lignes.find((l) => l.cle === 'fiable')?.verdict).toBe('meilleur');
    expect(moteurs.conclusif).toBe(true);
    expect(moteurs.resume).toContain('bavard');
  });

  it('les lignes sont triées du plus fidèle au moins', () => {
    // On lit une liste de haut en bas · mettre le pire en premier ferait
    // choisir le pire.
    const b = bilanCopie([
      ...lot(10, { accrocheReecrite: true, cles: { moteur: 'pire' } }),
      ...lot(10, { cles: { moteur: 'bon' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes.map((l) => l.cle)).toEqual(['bon', 'pire']);
  });

  it('un écart modéré au minimum ne tranche pas', () => {
    // Mesuré, pas supposé · j'ai posé deux attentes fausses avant celle-ci, et
    // toutes deux dans le même sens : le seuil tranche plus vite que je ne le
    // croyais. Le tableau mesuré est dans le module.
    //
    // À huit par groupe, 25 % contre 50 % ne se détache pas. 25 % contre 63 %,
    // si.
    const b = bilanCopie([
      ...lot(2, { accrocheReecrite: true, cles: { moteur: 'a' } }), ...lot(6, { cles: { moteur: 'a' } }),
      ...lot(4, { accrocheReecrite: true, cles: { moteur: 'b' } }), ...lot(4, { cles: { moteur: 'b' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes).toHaveLength(2);
    expect(moteurs.conclusif, '25 % contre 50 % sur huit chacun ont suffi à trancher').toBe(false);
  });

  it('un écart TOTAL tranche dès le minimum, et c’est voulu', () => {
    // Zéro sur huit contre huit sur huit n'est pas un écart ordinaire · c'est
    // une preuve, et refuser de la lire au nom du petit effectif reviendrait à
    // exiger vingt publicités pour constater l'évident.
    //
    // J'attendais l'inverse en écrivant ce test · l'intervalle avait raison.
    const b = bilanCopie([
      ...lot(MIN_RELECTURES, { cles: { moteur: 'a' } }),
      ...lot(MIN_RELECTURES, { accrocheReecrite: true, cles: { moteur: 'b' } }),
    ]);
    const moteurs = b.dimensions.find((d) => d.dimension === 'moteur')!;
    expect(moteurs.lignes.find((l) => l.cle === 'b')?.verdict).toBe('pire');
  });
});

describe('accents et lisibilité par marque · le signal d’un futur durcissement', () => {
  it('les accents perdus se comptent sur toutes les relues', () => {
    const b = bilanCopie([...lot(3, { accentsPerdus: true }), ...lot(7)]);
    expect(b.tauxAccents).toBeCloseTo(0.3);
    expect(b.resume).toContain('30 % d’accents perdus');
  });

  it('la lisibilité ne se compte que sur celles où il y avait du texte', () => {
    // Comme le produit ne se compte que sur les pubs avec référence · une pub
    // sans texte publicitaire (`null`) n'entre pas au dénominateur.
    const b = bilanCopie([
      ...lot(1, { texteLisible: false }),
      ...lot(3, { texteLisible: true }),
      ...lot(6, { texteLisible: null }),
    ]);
    expect(b.avecTexte).toBe(4);
    expect(b.tauxIllisible).toBeCloseTo(0.25);
    expect(b.resume).toContain('25 % de texte illisible sur 4 avec texte');
  });

  it('un lot propre ne dit rien de ces défauts', () => {
    // Le silence est une réponse · pas d'accents perdus, pas d'illisible → on
    // ne charge pas le résumé.
    const b = bilanCopie(lot(10, { texteLisible: true }));
    expect(b.tauxAccents).toBe(0);
    expect(b.tauxIllisible).toBe(0);
    expect(b.resume).not.toContain('accents perdus');
    expect(b.resume).not.toContain('illisible');
  });
});

describe('biaiser la rotation des directions', () => {
  it('écarte les pires, ancre la meilleure', () => {
    const b = directionsBiais([
      ligneCopie('sombre', 'pire', 0.5),
      ligneCopie('editorial', 'meilleur', 0.05),
      ligneCopie('pop', null, 0.2),
    ]);
    expect(b.ecartees).toEqual(['sombre']);
    expect(b.favori).toBe('editorial');
  });

  it('à plusieurs meilleures, prend la plus fidèle (moins de réécritures)', () => {
    const b = directionsBiais([
      ligneCopie('a', 'meilleur', 0.12),
      ligneCopie('b', 'meilleur', 0.03),
    ]);
    expect(b.favori).toBe('b');
  });

  it('sans verdict, rien ne bouge · la rotation reste égale', () => {
    // Le silence est une conclusion · tant que la mesure n'a pas tranché, on ne
    // biaise pas, et toutes les directions gardent leur tour.
    const b = directionsBiais([ligneCopie('a', null), ligneCopie('b', null)]);
    expect(b.ecartees).toEqual([]);
    expect(b.favori).toBeNull();
  });
});

describe('les deux dimensions', () => {
  it('moteur et direction se comptent séparément', () => {
    const b = bilanCopie(lot(10, { cles: { moteur: 'nano', direction: 'editorial' } }));
    expect(b.dimensions.map((d) => d.dimension)).toEqual(['moteur', 'direction']);
    expect(b.dimensions.every((d) => d.lignes.length === 1)).toBe(true);
  });
});
