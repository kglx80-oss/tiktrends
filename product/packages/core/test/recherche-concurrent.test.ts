import { describe, expect, it } from 'vitest';
import { nettoieNomConcurrent, variantesRechercheConcurrent } from '../src/veille-liens';

/**
 * Nettoyer le nom d'un concurrent avant de le chercher dans la bibliothèque · le
 * cas qui faisait croire que « l'analyse ne marche pas » : une note de
 * désambiguïsation entre parenthèses qui ne matche aucune page.
 */
describe('nettoieNomConcurrent · retire l’annotation, garde le nom', () => {
  it('retire un qualificatif entre parenthèses', () => {
    expect(nettoieNomConcurrent('Feel (compléments France)')).toBe('Feel');
  });

  it('retire crochets, symboles de marque et suffixe pays en queue', () => {
    expect(nettoieNomConcurrent('Bloom™')).toBe('Bloom');
    expect(nettoieNomConcurrent('Nova [FR]')).toBe('Nova');
    expect(nettoieNomConcurrent('Nova — DE')).toBe('Nova');
  });

  it('ne touche pas à un nom sans annotation', () => {
    expect(nettoieNomConcurrent('Gymshark')).toBe('Gymshark');
    // Un point/tiret INTERNE au nom n'est pas une annotation de queue.
    expect(nettoieNomConcurrent('Dr. Martens')).toBe('Dr. Martens');
  });
});

describe('variantesRechercheConcurrent · le probable puis l’exact', () => {
  it('essaie le nom nettoyé d’abord, puis le brut si différent', () => {
    expect(variantesRechercheConcurrent('Feel (compléments France)'))
      .toEqual(['Feel', 'Feel (compléments France)']);
  });

  it('un nom déjà propre ne produit qu’une seule piste', () => {
    expect(variantesRechercheConcurrent('Gymshark')).toEqual(['Gymshark']);
  });

  it('un nom vide ne produit aucune piste', () => {
    expect(variantesRechercheConcurrent('   ')).toEqual([]);
  });
});
