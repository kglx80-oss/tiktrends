import { describe, expect, it } from 'vitest';
import { contrainteDaPourPrompt, daVisuelleUtile, type DaVisuelleMarque } from '../src/da-visuelle';

/**
 * La DA visuelle du site doit CONTRAINDRE chaque créa sans remplacer la scène ·
 * on vérifie le RÉSULTAT : la contrainte nomme le style, dit « chaque scène
 * distincte », porte les « à éviter », et se tait quand la DA est vide.
 */
describe('contrainteDaPourPrompt · style de marque superposé, pas un décor imposé', () => {
  const da: DaVisuelleMarque = {
    style: 'éditorial minimaliste, beaucoup de blanc',
    photo: 'macro produit sur fond texturé',
    ambiance: 'premium et rassurant',
    lumiere: 'lumière naturelle douce',
    couleurs: 'tons crème et vert sauge',
    aEviter: ['rendu stock', 'surcharge'],
  };

  it('nomme le style et impose de garder chaque scène distincte', () => {
    const s = contrainteDaPourPrompt(da);
    expect(s).toContain('éditorial minimaliste');
    expect(s).toContain('macro produit sur fond texturé');
    expect(s, 'la contrainte doit préserver la variété de scène').toContain('keeping each scene distinct');
  });

  it('porte les « à éviter »', () => {
    expect(contrainteDaPourPrompt(da), 'les proscrits n’entrent pas dans la contrainte')
      .toContain('Avoid: rendu stock, surcharge');
  });

  it('se tait quand la DA est vide · le prompt reste léger', () => {
    expect(contrainteDaPourPrompt(undefined)).toBe('');
    expect(contrainteDaPourPrompt(null)).toBe('');
    expect(contrainteDaPourPrompt({})).toBe('');
    expect(contrainteDaPourPrompt({ style: '   ', aEviter: ['  '] })).toBe('');
  });

  it('daVisuelleUtile · vrai dès qu’une consigne existe, faux sinon', () => {
    expect(daVisuelleUtile(da)).toBe(true);
    expect(daVisuelleUtile({ ambiance: 'chaleureux' })).toBe(true);
    expect(daVisuelleUtile({})).toBe(false);
    expect(daVisuelleUtile(null)).toBe(false);
  });

  it('une DA partielle ne compose que ce qu’elle a', () => {
    const s = contrainteDaPourPrompt({ photo: 'lifestyle lumineux' });
    expect(s).toContain('photography: lifestyle lumineux');
    expect(s, 'aucun champ vide ne doit apparaître').not.toContain('overall style:');
    expect(s).not.toContain('Avoid:');
  });
});
