import { describe, it, expect } from 'vitest';
import {
  canalDepuisProvenance, compterCanaux, canalDeRangee, ajouterCanal, compteCanauxVide, LIBELLE_CANAL,
  qualificationDepuis, compterQualifications, qualifDeRangee, LIBELLE_QUALIFICATION,
} from '../src/adsmap/source-pertinence';

/**
 * CDC v8 · N03 · on tient DEUX axes séparés · le CANAL d'acquisition (fait) et
 * la QUALIFICATION métier (pertinence). Le canal ne confère JAMAIS une
 * pertinence · une marque suivie ou une détection Radar reste « à qualifier »
 * tant qu'une qualification distincte et étayée ne l'établit pas.
 */

describe('axe 1 · le canal d’acquisition, lu sur la provenance stockée', () => {
  it('mappe les canaux connus', () => {
    expect(canalDepuisProvenance('followed')).toBe('suivi');
    expect(canalDepuisProvenance('radar')).toBe('radar');
  });

  it('null, undefined et l’inattendu → « inconnu », jamais inventé', () => {
    expect(canalDepuisProvenance(null)).toBe('inconnu');
    expect(canalDepuisProvenance(undefined)).toBe('inconnu');
    expect(canalDepuisProvenance('n’importe quoi')).toBe('inconnu');
  });

  it('la rangée dit son canal · un seul présent, ou « multiples »', () => {
    expect(canalDeRangee({ suivi: 3, radar: 0, inconnu: 0 })).toBe('suivi');
    expect(canalDeRangee({ suivi: 0, radar: 2, inconnu: 0 })).toBe('radar');
    expect(canalDeRangee({ suivi: 0, radar: 0, inconnu: 5 })).toBe('inconnu');
    expect(canalDeRangee({ suivi: 2, radar: 1, inconnu: 0 })).toBe('multiples');
    expect(canalDeRangee(compteCanauxVide())).toBe('inconnu');
  });

  it('compte les canaux sans en perdre', () => {
    const c = compterCanaux([
      { provenance: 'followed' }, { provenance: 'followed' },
      { provenance: 'radar' }, { provenance: null }, { provenance: undefined },
    ]);
    expect(c).toEqual({ suivi: 2, radar: 1, inconnu: 2 });
  });
});

describe('axe 2 · la qualification métier, jamais déduite du canal', () => {
  it('ne lit qu’une qualification EXPLICITE et étayée', () => {
    expect(qualificationDepuis('concurrent_direct')).toBe('concurrent_direct');
    expect(qualificationDepuis('inspiration_adjacente')).toBe('inspiration_adjacente');
    expect(qualificationDepuis('preuve_propre')).toBe('preuve_propre');
  });

  it('toute absence ou valeur inconnue reste « à qualifier »', () => {
    expect(qualificationDepuis(null)).toBe('a_qualifier');
    expect(qualificationDepuis(undefined)).toBe('a_qualifier');
    expect(qualificationDepuis('concurrent')).toBe('a_qualifier');
  });

  it('la rangée dit sa qualification · aucune établie → « à qualifier », plusieurs → « mixte »', () => {
    expect(qualifDeRangee({ preuvePropre: 0, concurrentDirect: 0, inspirationAdjacente: 0, aQualifier: 9 })).toBe('a_qualifier');
    expect(qualifDeRangee({ preuvePropre: 0, concurrentDirect: 3, inspirationAdjacente: 0, aQualifier: 2 })).toBe('concurrent_direct');
    expect(qualifDeRangee({ preuvePropre: 0, concurrentDirect: 1, inspirationAdjacente: 1, aQualifier: 0 })).toBe('mixte');
  });

  it('les sources « à qualifier » n’ajoutent aucune diversité de pertinence', () => {
    // Beaucoup de « à qualifier » + une seule établie → la rangée n'est PAS mixte.
    expect(qualifDeRangee({ preuvePropre: 0, concurrentDirect: 1, inspirationAdjacente: 0, aQualifier: 100 })).toBe('concurrent_direct');
  });
});

describe('LE POINT DE LA CORRECTION · le canal ne confère pas de pertinence', () => {
  it('une source suivie n’est pas d’office un concurrent direct', () => {
    // Provenance « followed » · canal = suivi, mais AUCUNE qualification donnée.
    const source: { provenance: string | null; qualification: string | null } = { provenance: 'followed', qualification: null };
    expect(canalDeRangee(compterCanaux([source]))).toBe('suivi');
    expect(qualifDeRangee(compterQualifications([source])), 'suivi ⇏ concurrent direct').toBe('a_qualifier');
  });

  it('une source détectée au Radar n’est pas d’office une inspiration adjacente', () => {
    const source: { provenance: string | null; qualification: string | null } = { provenance: 'radar', qualification: null };
    expect(canalDeRangee(compterCanaux([source]))).toBe('radar');
    expect(qualifDeRangee(compterQualifications([source])), 'radar ⇏ inspiration adjacente').toBe('a_qualifier');
  });

  it('une qualification étayée, elle, est reprise · l’axe reste ouvert', () => {
    const source = { provenance: 'radar' as const, qualification: 'concurrent_direct' as const };
    expect(canalDeRangee(compterCanaux([source]))).toBe('radar');
    expect(qualifDeRangee(compterQualifications([source]))).toBe('concurrent_direct');
  });
});

describe('les libellés disent ce qu’ils mesurent', () => {
  it('le canal nomme l’origine, sans jugement', () => {
    expect(LIBELLE_CANAL.suivi.court).toBe('Marque suivie');
    expect(LIBELLE_CANAL.radar.court).toBe('Détectée par le Radar');
    expect(LIBELLE_CANAL.inconnu.court).toBe('Origine inconnue');
    expect(LIBELLE_CANAL.multiples.court).toBe('Provenances multiples');
  });

  it('la qualification dit la pertinence, « À qualifier » quand rien n’est prouvé', () => {
    expect(LIBELLE_QUALIFICATION.a_qualifier.court).toBe('À qualifier');
    expect(LIBELLE_QUALIFICATION.a_qualifier.note).toMatch(/écarte/i);
    expect(LIBELLE_QUALIFICATION.concurrent_direct.court).toBe('Concurrent direct');
    expect(LIBELLE_QUALIFICATION.mixte.court).toBe('Pertinences mixtes');
  });

  it('« Provenances multiples » et « Pertinences mixtes » ne sont pas le même libellé', () => {
    expect(LIBELLE_CANAL.multiples.court).not.toBe(LIBELLE_QUALIFICATION.mixte.court);
  });
});
