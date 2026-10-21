import { describe, it, expect } from 'vitest';
import { lireDirectionVisuelleRelue } from '../src/studios/direction-visuelle';
describe('direction visuelle relue', () => {
  const d = { composition: ' Produit centré ', styleIntent: '', formats: ['4:5'] };
  it('autorise style vide et normalise sans inventer de format', () => {
    expect(lireDirectionVisuelleRelue(d)).toEqual({ ...d, composition: 'Produit centré' });
  });
  it('conserve les textes relus sans créer de calques', () => {
    expect(lireDirectionVisuelleRelue({...d, texts:[' Texte validé ']} )?.texts).toEqual(['Texte validé']);
  });
  it('refuse champs inconnus, débordements et formats absents', () => {
    for (const x of [null, [], {...d, url:'https://x.test'}, {...d, composition:'x'.repeat(2001)}, {...d, formats:[]}, {...d, formats:['auto']}, {...d, texts:['']}, {...d, texts:['x'.repeat(501)]}, {...d, texts:Array(11).fill('texte')}]) expect(lireDirectionVisuelleRelue(x)).toBeNull();
  });
});
