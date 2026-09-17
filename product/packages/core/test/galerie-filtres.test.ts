import { describe, expect, it } from 'vitest';
import { filtrerTriGalerie, criteresActifs, resumeCriteres, CRITERES_DEFAUT, type ItemGalerie, type CriteresGalerie } from '../src/galerie-filtres';

/**
 * CDC v7 · N06 (tranche 2) · la barre de filtres locale · résultats testés.
 */

const items: ItemGalerie[] = [
  { id: 'a', titre: 'Ma piscine nette', format: 'testimonial', date: '2026-09-10T10:00:00Z', qualite: 'prete', performance: 'gagnante' },
  { id: 'b', titre: 'Offre du mois', format: 'offer', date: '2026-09-12T10:00:00Z', qualite: 'a_verifier', performance: 'inconnue' },
  { id: 'c', titre: 'Piscine cristalline', format: 'testimonial', date: '2026-09-11T10:00:00Z', qualite: 'a_revoir', performance: 'en_mesure' },
];
const crit = (o: Partial<CriteresGalerie> = {}): CriteresGalerie => ({ ...CRITERES_DEFAUT, ...o });

describe('filtrerTriGalerie', () => {
  it('sans critère · tout passe, trié du plus récent', () => {
    const r = filtrerTriGalerie(items, crit());
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('recherche sur le titre · insensible à la casse et aux accents', () => {
    expect(filtrerTriGalerie(items, crit({ recherche: 'PISCINE' })).map((x) => x.id).sort()).toEqual(['a', 'c']);
  });

  it('filtre par format', () => {
    expect(filtrerTriGalerie(items, crit({ format: 'offer' })).map((x) => x.id)).toEqual(['b']);
  });

  it('filtre par état qualité et par performance', () => {
    expect(filtrerTriGalerie(items, crit({ qualite: 'prete' })).map((x) => x.id)).toEqual(['a']);
    expect(filtrerTriGalerie(items, crit({ performance: 'en_mesure' })).map((x) => x.id)).toEqual(['c']);
  });

  it('les critères se cumulent (ET)', () => {
    expect(filtrerTriGalerie(items, crit({ format: 'testimonial', qualite: 'prete' })).map((x) => x.id)).toEqual(['a']);
    expect(filtrerTriGalerie(items, crit({ format: 'testimonial', qualite: 'a_verifier' })).map((x) => x.id)).toEqual([]);
  });

  it('tri · ancien, récent, titre', () => {
    expect(filtrerTriGalerie(items, crit({ tri: 'ancien' })).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    // « Ma… » < « Offre… » < « Piscine… » en ordre alphabétique.
    expect(filtrerTriGalerie(items, crit({ tri: 'titre' })).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('criteresActifs · le tri par défaut ne compte pas', () => {
  it('rien d’actif au départ', () => {
    expect(criteresActifs(crit())).toBe(0);
    expect(criteresActifs(crit({ tri: 'recent' }))).toBe(0);
  });
  it('compte chaque critère posé', () => {
    expect(criteresActifs(crit({ recherche: 'x', format: 'offer', tri: 'titre' }))).toBe(3);
  });
});

describe('resumeCriteres', () => {
  it('vide quand rien n’est actif', () => {
    expect(resumeCriteres(crit(), (f) => f)).toBe('');
  });
  it('énumère les critères actifs, format traduit par l’écran', () => {
    const r = resumeCriteres(crit({ format: 'offer', qualite: 'prete', tri: 'titre' }), (f) => (f === 'offer' ? 'Offre' : f));
    expect(r).toContain('Offre');
    expect(r).toContain('Prête à diffuser');
    expect(r).toContain('Titre (A→Z)');
  });
});
