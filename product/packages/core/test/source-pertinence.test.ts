import { describe, it, expect } from 'vitest';
import {
  classerProvenance, compterProvenances, pertinenceDeRangee, ajouterProvenance,
  compteVide, LIBELLE_PERTINENCE,
} from '../src/adsmap/source-pertinence';

/**
 * CDC v8 · N03 · on sépare la provenance FACTUELLE d'une source (comment elle
 * est entrée) de sa PERTINENCE pour une marque (ce que ça vaut quand elle la
 * regarde). On n'invente aucune catégorie · l'inconnu reste « non qualifié ».
 */

describe('la provenance stockée se range en classe · l’inconnu ne s’invente pas', () => {
  it('mappe les valeurs connues', () => {
    expect(classerProvenance('followed')).toBe('concurrent');
    expect(classerProvenance('radar')).toBe('inspiration');
    expect(classerProvenance('propre')).toBe('propre');
  });

  it('range null, undefined et l’inattendu en « non qualifié »', () => {
    expect(classerProvenance(null)).toBe('nonQualifie');
    expect(classerProvenance(undefined)).toBe('nonQualifie');
    expect(classerProvenance('n’importe quoi')).toBe('nonQualifie');
  });
});

describe('la pertinence se lit sur le décompte des provenances', () => {
  it('une seule classe présente → c’est elle', () => {
    expect(pertinenceDeRangee({ concurrent: 3, inspiration: 0, propre: 0, nonQualifie: 0 })).toBe('concurrent_direct');
    expect(pertinenceDeRangee({ concurrent: 0, inspiration: 2, propre: 0, nonQualifie: 0 })).toBe('inspiration_adjacente');
    expect(pertinenceDeRangee({ concurrent: 0, inspiration: 0, propre: 1, nonQualifie: 0 })).toBe('preuve_propre');
    expect(pertinenceDeRangee({ concurrent: 0, inspiration: 0, propre: 0, nonQualifie: 4 })).toBe('non_qualifiee');
  });

  it('plusieurs classes présentes → « mixte », la divergence ne se masque pas', () => {
    expect(pertinenceDeRangee({ concurrent: 2, inspiration: 1, propre: 0, nonQualifie: 0 })).toBe('mixte');
    expect(pertinenceDeRangee({ concurrent: 1, inspiration: 0, propre: 0, nonQualifie: 3 })).toBe('mixte');
  });

  it('aucune source → « non qualifié », pas une pertinence inventée', () => {
    expect(pertinenceDeRangee(compteVide())).toBe('non_qualifiee');
  });
});

describe('l’agrégation compte chaque source dans sa classe', () => {
  it('compte un mélange sans en perdre', () => {
    const c = compterProvenances([
      { provenance: 'followed' }, { provenance: 'followed' },
      { provenance: 'radar' }, { provenance: null }, { provenance: undefined },
    ]);
    expect(c).toEqual({ concurrent: 2, inspiration: 1, propre: 0, nonQualifie: 2 });
  });

  it('ajouterProvenance incrémente la bonne classe', () => {
    const c = compteVide();
    ajouterProvenance(c, 'radar');
    expect(c.inspiration).toBe(1);
    expect(c.concurrent).toBe(0);
  });
});

describe('chaque pertinence porte un libellé et sa limite', () => {
  it('l’inspiration adjacente et la source non qualifiée disent qu’on peut les écarter', () => {
    expect(LIBELLE_PERTINENCE.inspiration_adjacente.court).toBe('Inspiration adjacente');
    expect(LIBELLE_PERTINENCE.inspiration_adjacente.note).toMatch(/écarte/i);
    expect(LIBELLE_PERTINENCE.non_qualifiee.court).toBe('Source non qualifiée');
    expect(LIBELLE_PERTINENCE.non_qualifiee.note).toMatch(/à confirmer/i);
  });

  it('le concurrent direct et la preuve propre sont nommés', () => {
    expect(LIBELLE_PERTINENCE.concurrent_direct.court).toBe('Concurrent direct');
    expect(LIBELLE_PERTINENCE.preuve_propre.court).toBe('Preuve propre');
    expect(LIBELLE_PERTINENCE.mixte.court).toBe('Sources mêlées');
  });
});
