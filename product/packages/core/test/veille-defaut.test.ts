import { describe, it, expect } from 'vitest';
import { motCleCategorie, veilleSeedDefaut, NICHE_DEFAUT } from '../src/veille-defaut';

/**
 * Le bug vu à l'écran : la Veille arrivait VIDE. La catégorie de la marque,
 * « Entretien et traitement de piscine (produits chimiques/accessoires
 * piscine) », servait telle quelle de mot-clé · aucune pub ne dit ça dans son
 * copy. On en extrait le nom produit cherchable.
 */
describe('le mot-clé d’amorçage de la Veille est cherchable', () => {
  it('extrait le nom produit d’un long libellé de catégorie', () => {
    expect(motCleCategorie('Entretien et traitement de piscine (produits chimiques/accessoires piscine)')).toBe('piscine');
  });

  it('retire la parenthèse et coupe une liste de sous-catégories', () => {
    expect(motCleCategorie('Bijoux / montres / accessoires')).toBe('bijoux');
    expect(motCleCategorie('Compléments alimentaires')).toBe('alimentaires');
  });

  it('un mot simple reste lui-même', () => {
    expect(motCleCategorie('Skincare')).toBe('skincare');
  });

  it('sans catégorie · niche large par défaut, jamais rien', () => {
    expect(veilleSeedDefaut({ category: null })).toEqual({ seed: NICHE_DEFAUT, parCategorie: false });
    expect(veilleSeedDefaut({ category: 'Entretien et traitement de piscine (x)' })).toEqual({ seed: 'piscine', parCategorie: true });
  });
});
