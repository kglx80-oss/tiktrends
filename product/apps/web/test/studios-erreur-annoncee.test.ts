import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'échec de génération des studios Image et Vidéo s'affichait dans un `<div>`
 * muet · non annoncé à qui vient de lancer un lot. Comme le composeur Pubs (#529)
 * et les assistants, la bannière d'erreur doit porter `role="alert"`. Non
 * couvert par une règle globale.
 *
 * Composants client volumineux à actions serveur · non rendables · garde par
 * adoption de la source, qui lit l'attribut porté par la bannière d'erreur.
 */
function bannereErreur(rel: string): string {
  const src = readFileSync(join(process.cwd(), rel), 'utf8');
  const i = src.indexOf('{error && <div');
  return i === -1 ? '' : src.slice(i, i + 40);
}

describe('Studios · l’échec de génération est annoncé', () => {
  it('le studio Image annonce son erreur (role=alert)', () => {
    expect(bannereErreur('app/(app)/studio/image/ImageStudio.tsx'))
      .toContain('{error && <div role="alert"');
  });
  it('le studio Vidéo annonce son erreur (role=alert)', () => {
    expect(bannereErreur('app/(app)/studio/video/VideoStudioFull.tsx'))
      .toContain('{error && <div role="alert"');
  });
});
