import { describe, it, expect } from 'vitest';
import { libelleMediaStudio } from '../src/studios/produit/catalogue';

/** Raccord L9 · MIG-02 « pas de provenance inventée » : le libellé suit l'origine réelle du média. */
describe('libellé d’un média studio selon son origine', () => {
  it('un ancien média migré ne se présente jamais comme produit par le studio', () => {
    expect(libelleMediaStudio('legacy', 'abcdef0123456789'), 'un ancien média passe pour un média du studio').toBe('Ancien média · abcdef01');
    expect(libelleMediaStudio('legacy', 'abcdef0123456789')).not.toMatch(/studio/);
  });
  it('chaque origine a son mot', () => {
    expect(['generated', 'upload', 'import', 'render', 'inconnue'].map((o) => libelleMediaStudio(o, '12345678zz'))).toEqual([
      'Média du studio · 12345678', 'Média déposé · 12345678', 'Média importé · 12345678', 'Rendu exporté · 12345678', 'Média · 12345678',
    ]);
  });
});
