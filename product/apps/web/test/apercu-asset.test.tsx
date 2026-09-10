import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { apercuAsset } from '../lib/apercu-asset';
import { MiniatureAsset } from '../components/MiniatureAsset';

describe('la miniature d’un asset choisit son rendu', () => {
  it('image → image, vidéo téléversée → vidéo, sinon icône', () => {
    expect(apercuAsset('image', 'upload', false)).toBe('image');
    expect(apercuAsset('video', 'upload', false)).toBe('video');
    expect(apercuAsset('video', 'link', false)).toBe('icone');
    expect(apercuAsset('audio', 'upload', false)).toBe('icone');
  });

  it('un chargement cassé bascule sur l’icône · jamais l’image cassée du navigateur', () => {
    expect(apercuAsset('image', 'upload', true)).toBe('icone');
    expect(apercuAsset('video', 'upload', true)).toBe('icone');
  });
});

describe('le rendu de la miniature', () => {
  it('une image rend une <img>', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="image" url="https://cdn/x.jpg" name="x" source="upload" icon="🖼️" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn/x.jpg"');
  });

  it('un audio rend l’icône, pas de média cassable', () => {
    const html = renderToStaticMarkup(<MiniatureAsset kind="audio" url="https://cdn/x.mp3" name="x" source="upload" icon="🎵" />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<video');
    expect(html).toContain('🎵');
  });
});
