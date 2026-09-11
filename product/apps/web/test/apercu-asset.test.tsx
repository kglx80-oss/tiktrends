import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { apercuAsset } from '../lib/apercu-asset';
import { MiniatureAsset } from '../components/MiniatureAsset';

describe('la miniature d’un asset choisit son rendu', () => {
  it('image → image, vidéo → vidéo quelle que soit la source, audio → icône', () => {
    expect(apercuAsset('image', false)).toBe('image');
    expect(apercuAsset('video', false)).toBe('video');
    // Le VRAI asset · un lien vidéo ne tombe plus sur l'icône par principe · on
    // tente le flux, et `onError` bascule seulement s'il est réellement injouable.
    expect(apercuAsset('audio', false)).toBe('icone');
    expect(apercuAsset('other', false)).toBe('icone');
  });

  it('un chargement cassé bascule sur l’icône · jamais l’image cassée du navigateur', () => {
    expect(apercuAsset('image', true)).toBe('icone');
    expect(apercuAsset('video', true)).toBe('icone');
  });
});

describe('le rendu de la miniature', () => {
  it('une image rend une <img>', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="image" url="https://cdn/x.jpg" name="x" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn/x.jpg"');
  });

  it('une vidéo par lien rend un vrai <video>, pas d’icône', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="video" url="/api/asset/v1" name="clip" />);
    expect(html).toContain('<video');
    expect(html).toContain('src="/api/asset/v1"');
  });

  it('le repli d’un audio est une icône AU TRAIT (SVG), plus jamais un emoji kitch', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="audio" url="https://cdn/x.mp3" name="x" />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
    // Premium · un <svg> tracé, pas de 🎵/📎 codés en dur.
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/🎵|📎|🎬|🖼️/u);
  });

  it('une vraie vignette gagne · une vidéo Drive montre son <img>, pas un <video> lourd ni l’icône', () => {
    // Le reproche répété · une vidéo Drive n'avait que le lien /view (injouable)
    // et retombait sur l'icône. Avec la vignette persistée, on montre le VRAI
    // visuel, une image légère · et surtout pas un <video> qui télécharge tout.
    const html = renderToStaticMarkup(<MiniatureAsset kind="video" url="/api/asset/v1" thumbUrl="https://bucket/drive-v1-thumb.jpg" name="clip" />);
    expect(html).toContain('src="https://bucket/drive-v1-thumb.jpg"');
    expect(html).not.toContain('<video');
  });

  it('sans vignette, une vidéo garde son repli <video> · la cascade ne casse pas l’existant', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="video" url="/api/asset/v2" name="clip" />);
    expect(html).toContain('<video');
    expect(html).toContain('src="/api/asset/v2"');
  });
});
