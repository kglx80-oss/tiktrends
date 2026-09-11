import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Icon, iconForAssetKind, ICON_PATHS } from '../components/Icon';

/**
 * Le jeu d'icônes premium · un trait, jamais un emoji.
 *
 * On prouve le RÉSULTAT · l'icône rend un `<svg>` avec un vrai tracé, et le type
 * d'un asset choisit une icône connue (pas de repli silencieux sur `grid`, qui
 * masquerait une faute de nom). Et on verrouille l'extraction · `AppShell` ne
 * redéfinit plus son propre jeu, il importe celui-ci · sinon deux jeux divergent.
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

  it('chaque type d’asset a sa propre icône connue (jamais le repli grid)', () => {
    for (const [kind, expected] of [['image', 'image'], ['video', 'film'], ['audio', 'music'], ['other', 'file']] as const) {
      const name = iconForAssetKind(kind);
      expect(name).toBe(expected);
      expect(ICON_PATHS[name], `l'icône « ${name} » (${kind}) doit exister`).toBeTruthy();
    }
  });
});

describe('l’extraction du jeu d’icônes', () => {
  it('AppShell importe le jeu partagé et ne redéfinit plus le sien', () => {
    const SHELL = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
    expect(SHELL).toContain("from './Icon'");
    // Le jeu privé (une grosse table de `d`) ne doit plus vivre en double ici.
    expect(SHELL).not.toContain("const p: Record<string, string> = {");
  });
});
