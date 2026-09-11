import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MiniatureAsset } from '../components/MiniatureAsset';

/**
 * Le sélecteur d'Assets (studio Pubs) montre la même miniature que la
 * bibliothèque · un lien cassé tombe sur l'icône de type, jamais l'image cassée
 * du navigateur. Avant, le picker rendait un `<img>` nu sans repli.
 *
 * `MiniatureAsset` gagne un `cadreStyle` pour tenir dans un sélecteur de taille
 * fixe · on prouve par le RENDU qu'il s'applique, et par la source que le studio
 * l'a bien adopté (fichier gros client non rendable ici).
 */

describe('la miniature partagée s’adapte au sélecteur', () => {
  it('cadreStyle s’applique au cadre (taille fixe du picker)', () => {
    const html = renderToStaticMarkup(
      <MiniatureAsset kind="image" url="https://cdn/x.jpg" name="x" cadreStyle={{ aspectRatio: 'auto' }} />,
    );
    expect(html).toContain('<img');
    // cadreStyle écrase le carré par défaut du cadre · preuve qu'il est appliqué.
    expect(html).toContain('aspect-ratio:auto');
    expect(html).not.toContain('aspect-ratio:1 / 1');
  });
});

describe('le picker d’Assets du studio Pubs adopte la miniature partagée', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
  it('le picker rend MiniatureAsset, plus de <img> nu sur a.url', () => {
    expect(SRC).toContain('<MiniatureAsset');
    // Le <img src={a.url}> nu (sans repli) ne doit plus exister.
    expect(SRC, 'un <img src={a.url}> nu subsiste dans le picker').not.toContain('<img src={a.url}');
  });
});
