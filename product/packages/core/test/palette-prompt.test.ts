import { describe, expect, it } from 'vitest';
import { palettePourPrompt, promptPubEntiere } from '../src/production-mode';

/**
 * La charte couleur du site doit ATTEINDRE le prompt d'image · elle ne servait
 * qu'à teinter un bouton en overlay, d'où « la créa ne colle pas à la DA ». On
 * vérifie le RÉSULTAT : la directive de palette est produite quand il y a des
 * couleurs, absente sinon, et présente dans le prompt de la pub entière.
 */
describe('palettePourPrompt · la charte devient une consigne de direction', () => {
  it('produit une directive qui nomme les couleurs de la marque', () => {
    const s = palettePourPrompt(['#E6007E', '#7828C8']);
    expect(s).toContain('#E6007E');
    expect(s).toContain('#7828C8');
    expect(s, 'la directive ne se présente pas comme une charte').toContain('Brand colour palette');
    expect(s, 'la directive doit épargner le vrai produit').toContain('Do not recolour any real product');
  });

  it('reste muette sans couleur · le prompt ne s’alourdit pas', () => {
    expect(palettePourPrompt(undefined)).toBe('');
    expect(palettePourPrompt([])).toBe('');
    expect(palettePourPrompt(['  '])).toBe('');
  });

  it('au plus cinq couleurs · au-delà c’est du bruit', () => {
    const s = palettePourPrompt(['#1', '#2', '#3', '#4', '#5', '#6', '#7']);
    expect(s).toContain('#5');
    expect(s, 'plus de cinq couleurs passent · ce n’est plus une charte').not.toContain('#6');
  });
});

describe('promptPubEntiere · la palette entre dans le prompt d’image', () => {
  const base = { copie: { headline: 'Focus sans crash' }, sceneBrief: 'a desk with the product', avecProduit: false };

  it('avec une charte, le prompt porte la directive de palette', () => {
    const p = promptPubEntiere({ ...base, palette: ['#E6007E'] });
    expect(p, 'la charte de marque n’atteint pas le prompt entière').toContain('Brand colour palette');
    expect(p).toContain('#E6007E');
  });

  it('sans charte, aucune directive de palette · pas de bruit', () => {
    const p = promptPubEntiere({ ...base });
    expect(p, 'une directive de palette apparaît sans couleur').not.toContain('Brand colour palette');
  });
});
