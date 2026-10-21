import { describe, it, expect } from 'vitest';
import { lireDirectionVisuelleRelue } from '../src/studios/direction-visuelle';
describe('direction visuelle relue', () => {
  const d = { composition: ' Produit centré ', styleIntent: '', formats: ['4:5'] };
  it('autorise style vide et normalise sans inventer de format', () => {
    expect(lireDirectionVisuelleRelue(d)).toEqual({ ...d, composition: 'Produit centré' });
  });
  it('refuse champs inconnus, débordements et formats absents', () => {
    for (const x of [null, [], {...d, url:'https://x.test'}, {...d, composition:'x'.repeat(2001)}, {...d, formats:[]}, {...d, formats:['auto']}]) expect(lireDirectionVisuelleRelue(x)).toBeNull();
  });
});
