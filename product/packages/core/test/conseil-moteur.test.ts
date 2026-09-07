import { describe, expect, it } from 'vitest';
import { bilanCopie, type RelectureLue } from '../src/adsmap/bilan-copie';
import { conseilMoteur, contredit } from '../src/conseil-moteur';

/**
 * Le conseil ne parle que quand la mesure tranche.
 *
 * Remplacer un défaut éditorial par un classement que le hasard a produit
 * serait pire que de garder le défaut · ça aurait l'air fondé.
 */

function lot(n: number, ko: boolean, moteur: string, produit: boolean | null = true): RelectureLue[] {
  return Array.from({ length: n }, () => ({
    accrocheReecrite: ko, produitFidele: produit, cles: { moteur },
  }));
}

describe('quand la mesure se tait', () => {
  it('sans bilan, aucun conseil', () => {
    const c = conseilMoteur(null);
    expect(c.recommande).toBeNull();
    expect(c.resume).toBe('');
    expect(Object.keys(c.lignes)).toEqual([]);
  });

  it('sans relecture, aucun conseil', () => {
    expect(conseilMoteur(bilanCopie([])).recommande).toBeNull();
  });

  it('deux moteurs équivalents ne produisent aucune recommandation', () => {
    // C'est la réponse la plus fréquente, et elle est correcte · le défaut du
    // catalogue reste en place, ce qui est exactement ce qu'on veut.
    const c = conseilMoteur(bilanCopie([
      ...lot(5, true, 'a'), ...lot(5, false, 'a'),
      ...lot(5, true, 'b'), ...lot(5, false, 'b'),
    ]));
    expect(c.recommande).toBeNull();
    expect(c.deconseilles).toEqual([]);
    expect(c.resume).toBe('');
  });

  it('mais elle montre quand même ce qu’elle a mesuré', () => {
    // Savoir qu'un moteur a dix publicités à 50 % est utile en soi · le cacher
    // jusqu'à ce qu'il se détache priverait de la seule information disponible
    // la plupart du temps.
    const c = conseilMoteur(bilanCopie([
      ...lot(5, true, 'a'), ...lot(5, false, 'a'),
      ...lot(5, true, 'b'), ...lot(5, false, 'b'),
    ]));
    expect(c.lignes.a?.texte).toContain('50 % d’accroches réécrites sur 10');
    expect(c.lignes.a?.verdict).toBeNull();
  });
});

describe('quand la mesure tranche', () => {
  const net = bilanCopie([
    ...lot(30, false, 'fiable'),
    ...lot(28, true, 'bavard'), ...lot(2, false, 'bavard'),
  ]);

  it('elle recommande le moteur qui tient la copie', () => {
    const c = conseilMoteur(net);
    expect(c.recommande).toBe('fiable');
    expect(c.deconseilles).toEqual(['bavard']);
  });

  it('et elle le dit avec les chiffres', () => {
    // Un conseil sans chiffre se subit · un conseil chiffré se conteste.
    const c = conseilMoteur(net);
    expect(c.resume).toContain('fiable');
    expect(c.resume).toContain('0 %');
    expect(c.resume).toContain('bavard');
  });

  it('la ligne dit aussi la fidélité du produit quand elle est connue', () => {
    const c = conseilMoteur(bilanCopie([
      ...lot(15, false, 'a', false),
      ...lot(15, true, 'b', true),
    ]));
    expect(c.lignes.a?.texte).toContain('de produits modifiés');
  });

  it('elle ne dit rien du produit quand aucune référence n’existait', () => {
    // Afficher « 0 % de produits modifiés » sans référence transformerait une
    // absence de vérification en résultat.
    const c = conseilMoteur(bilanCopie([
      ...lot(15, false, 'a', null),
      ...lot(15, true, 'b', null),
    ]));
    expect(c.lignes.a?.texte).not.toContain('produits modifiés');
  });

  it('à taux égal, le moteur le plus éprouvé l’emporte', () => {
    // Départager au hasard donnerait un conseil qui change d'un chargement à
    // l'autre, ce qui se lit comme un bug.
    const c = conseilMoteur(bilanCopie([
      ...lot(10, false, 'peu'),
      ...lot(30, false, 'beaucoup'),
      ...lot(20, true, 'mauvais'),
    ]));
    expect(c.recommande).toBe('beaucoup');
  });
});

describe('on ne remplace pas le catalogue en douce', () => {
  const net = bilanCopie([
    ...lot(30, false, 'fiable'),
    ...lot(28, true, 'bavard'), ...lot(2, false, 'bavard'),
  ]);

  it('la contradiction se constate', () => {
    expect(contredit(conseilMoteur(net), 'bavard')).toBe(true);
  });

  it('un accord n’est pas une contradiction', () => {
    expect(contredit(conseilMoteur(net), 'fiable')).toBe(false);
  });

  it('sans mesure, jamais de contradiction', () => {
    // Un catalogue seul ne se contredit pas lui-même.
    expect(contredit(conseilMoteur(null), 'fiable')).toBe(false);
  });
});
