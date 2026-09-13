import { describe, expect, it } from 'vitest';
import { AD_DIRECTIONS, directionByKey, directionPrompt } from '../src/ad-directions';

/**
 * Deux directions demandaient un accessoire SANS dire lequel · « un accessoire
 * sculptural » (éditorial), « quelques objets complémentaires » (vue du dessus).
 * Le modèle les remplissait au hasard · d'où le flacon posé sur une céramique
 * hors sujet. On resserre ces cases à la source · l'accessoire doit appartenir
 * au monde du produit. On vérifie le RÉSULTAT dans la scène ET le prompt composé.
 */
describe('Directions · l’accessoire reste dans le monde du produit', () => {
  it('l’éditorial n’invite plus un accessoire au hasard', () => {
    const d = directionByKey('editorial')!;
    expect(d.scene, 'la case ouverte « accessoire sculptural » nu subsiste').not.toContain('a single sculptural prop');
    expect(d.scene, 'rien n’ancre l’accessoire sur le produit').toMatch(/belongs to the product's own world|never a random/);
  });

  it('la vue du dessus n’invite plus des objets au hasard', () => {
    const d = directionByKey('flatlay')!;
    expect(d.scene, 'la case ouverte « objets complémentaires » nue subsiste').not.toContain('a few complementary objects');
    expect(d.scene, 'rien n’ancre les objets sur le produit').toMatch(/product's own world|never random props/);
  });

  it('la contrainte survit dans le prompt de direction composé', () => {
    const p = directionPrompt(directionByKey('editorial')!);
    expect(p, 'la contrainte d’accessoire n’atteint pas le prompt').toContain("product's own world");
  });

  it('les directions sans accessoire libre restent intactes (studio n’a pas de prop)', () => {
    const studio = directionByKey('studio')!;
    expect(studio.scene).toContain('no props');
    // On n'a pas introduit la contrainte là où il n'y a pas d'accessoire à cadrer.
    expect(studio.scene).not.toContain("product's own world");
  });

  it('toutes les directions gardent une scène non vide', () => {
    for (const d of AD_DIRECTIONS) expect(d.scene.trim().length, `${d.key} a une scène vide`).toBeGreaterThan(20);
  });
});
