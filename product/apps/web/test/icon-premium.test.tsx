import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../components/Icon';

/**
 * Le jeu d'icônes premium · un trait, jamais un emoji.
 *
 * On prouve le RÉSULTAT · l'icône rend un `<svg>` avec un vrai tracé.
 */
describe('l’icône premium rend un trait', () => {
  it('rend un <svg> avec un <path> tracé', () => {
    const html = renderToStaticMarkup(<Icon name="image" />);
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
    expect(html).toContain('stroke="currentColor"');
  });

  it('la taille est réglable', () => {
    expect(renderToStaticMarkup(<Icon name="film" size={34} />)).toContain('width="34"');
  });
});
