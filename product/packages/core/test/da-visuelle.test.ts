import { describe, expect, it } from 'vitest';
import { contrainteDaPourPrompt, daVisuelleUtile, normaliserDaVisuelle, type DaVisuelleMarque } from '../src/da-visuelle';

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

/**
 * La DA vient d'un modèle et d'un jsonb · `aEviter` arrive parfois en CHAÎNE, un
 * élément parfois non-chaîne, un champ parfois en nombre. Une telle DA a fait
 * TOMBER la page marque côté client (`.map`/`.join`/`.trim` sur la mauvaise
 * forme) ET aurait cassé la génération. Ces fonctions doivent tolérer toute
 * forme sans jamais lever · on le vérifie sur les formes qui crashaient.
 */
describe('DA malformée · tolérée, jamais un crash', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mauvaises: Array<[string, any]> = [
    ['aEviter en chaîne', { style: 'x', aEviter: 'surcharge, stock' }],
    ['aEviter tableau mixte', { style: 'x', aEviter: ['ok', 42, null, 'net'] }],
    ['champ en nombre', { style: 42, photo: 'lifestyle' }],
    ['DA en chaîne', 'pas un objet'],
    ['aEviter null', { style: 'x', aEviter: null }],
  ];

  it('daVisuelleUtile ne lève sur aucune forme malformée', () => {
    for (const [nom, da] of mauvaises) {
      expect(() => daVisuelleUtile(da), `daVisuelleUtile a levé sur : ${nom}`).not.toThrow();
    }
  });

  it('contrainteDaPourPrompt ne lève sur aucune forme malformée', () => {
    for (const [nom, da] of mauvaises) {
      expect(() => contrainteDaPourPrompt(da), `contrainteDaPourPrompt a levé sur : ${nom}`).not.toThrow();
    }
  });

  it('aEviter en chaîne est ignoré proprement, le reste tient', () => {
    // aEviter arrive en chaîne → non exploitable comme liste, on ne le rend pas
    // comme un « Avoid », mais le style, lui, doit passer sans casser.
    const n = normaliserDaVisuelle({ style: 'net et lumineux', aEviter: 'surcharge, stock' } as unknown as DaVisuelleMarque);
    expect(n.style).toBe('net et lumineux');
    expect(Array.isArray(n.aEviter), 'aEviter doit toujours ressortir en tableau').toBe(true);
    expect(n.aEviter).toEqual([]);
    const s = contrainteDaPourPrompt({ style: 'net et lumineux', aEviter: 'surcharge, stock' } as unknown as DaVisuelleMarque);
    expect(s).toContain('overall style: net et lumineux');
  });

  it('un tableau à éléments non-chaîne ne garde que les chaînes utiles', () => {
    const n = normaliserDaVisuelle({ style: 'x', aEviter: ['net', 42, null, ' stock '] } as unknown as DaVisuelleMarque);
    expect(n.aEviter, 'les non-chaînes sont écartées, les chaînes rognées').toEqual(['net', 'stock']);
  });

  it('un champ en nombre ne passe pas pour un texte', () => {
    const n = normaliserDaVisuelle({ style: 42, photo: 'lifestyle' } as unknown as DaVisuelleMarque);
    expect(n.style, 'un nombre n’est pas un style exploitable').toBe('');
    expect(n.photo).toBe('lifestyle');
  });
});
