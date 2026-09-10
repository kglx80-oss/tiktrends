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
    const html = renderToStaticMarkup(<MiniatureAsset kind="image" url="https://cdn/x.jpg" name="x" icon="🖼️" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn/x.jpg"');
  });

  it('une vidéo par lien rend un vrai <video>, pas l’icône 🎬', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="video" url="/api/asset/v1" name="clip" icon="🎬" />);
    expect(html).toContain('<video');
    expect(html).toContain('src="/api/asset/v1"');
    expect(html).not.toContain('🎬');
  });

  it('un audio rend l’icône, pas de média cassable', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="audio" url="https://cdn/x.mp3" name="x" icon="🎵" />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
    expect(html).toContain('🎵');
  });
});
