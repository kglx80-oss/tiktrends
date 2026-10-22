import { describe, expect, it } from 'vitest';
import type { ConsigneImagePersistee } from '@tiktrends/core';
import { deriverFormat, type FormatImageAtteste } from '../lib/studios/image/derivations-format';

function source(instruction: string, negativeConstraints: string[] = []): ConsigneImagePersistee {
  return { schema: 'consigne_image/1', runId: 'run', mode: 'generative_scene', sourceVersionId: 'version', entrees: 'hash',
    consigne: { generationInstruction: instruction, negativeConstraints, referenceBindings: [], protectedComponents: [], needsDeterministicOverlay: false },
    references: [], format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-21T00:00:00Z' };
}

describe('Dérivation de format · contraintes de sortie explicites', () => {
  it.each([
    ['Portrait of a woman holding the product.', '1:1'],
    ['Product with a square cap on a neutral background.', '9:16'],
    ['Keep the product at 1/2 of the frame width.', '4:5'],
    ['A horizontal shelf with the product.', '9:16'],
  ] as [string, FormatImageAtteste][])('ne confond pas le sujet avec le cadrage : %s', (instruction, format) => {
    const c = source(instruction, ['Do not use a square logo.']);
    const result = deriverFormat(c, 'version', format);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.consigne.consigne).toEqual(c.consigne);
    expect(c.format).toEqual({ largeur: 1080, hauteur: 1350 });
  });

  it.each(['Photographie au format 4:5.', 'Aspect ratio: 4:5.', 'Dimensions: 1080x1350.', 'Format carré.', 'Orientation: paysage.', '4:5 aspect ratio.'])('refuse une contrainte explicite incompatible : %s', instruction => {
    expect(deriverFormat(source(instruction), 'version', '9:16').ok).toBe(false);
  });

  it('accepte un format explicite compatible et ne transforme pas les interdits en exigences', () => {
    expect(deriverFormat(source('Format 9:16.'), 'version', '9:16').ok).toBe(true);
    expect(deriverFormat(source('Avoid landscape orientation.', ['No square format.']), 'version', '9:16').ok).toBe(true);
  });
});
