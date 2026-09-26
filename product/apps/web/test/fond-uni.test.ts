import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le fond principal du shell est UNI · #120810, sans quadrillage décoratif ni
 * halo rose global (charte validée, Codex · 26/09/2026). L'ancien « fond
 * signature » (deux halos radial + une grille de 1px tous les 36px) chargeait
 * chaque écran · le régler seulement sur une surface (JarvisChat) ne suffisait
 * pas, la grille vivait sur `body` et sur le contenu admin.
 *
 * On cloue au RÉSULTAT : ni `radial-gradient`, ni grille `linear-gradient(... 1px`,
 * ni `background-image` multi-couches sur ces deux fonds · réintroduire le décor
 * fait tomber la garde, en nommant le fichier.
 */
const SANS_DECOR = [
  { fichier: 'packages/ui/tokens.css', ancre: /body\s*\{[^}]*\}/, quoi: 'le fond global (body)' },
];

const racine = join(process.cwd(), '..', '..'); // apps/web → product/

describe('fond principal · uni, sans quadrillage ni halo', () => {
  it('body porte la couleur unie #120810', () => {
    const css = readFileSync(join(racine, 'packages/ui/tokens.css'), 'utf8');
    const body = css.match(/body\s*\{[^}]*\}/)?.[0] ?? '';
    expect(body, 'body doit garder le fond uni #120810').toContain('#120810');
  });

  for (const { fichier, ancre, quoi } of SANS_DECOR) {
    it(`${quoi} n'a plus ni halo (radial-gradient) ni grille (1px)`, () => {
      const src = readFileSync(join(racine, fichier), 'utf8');
      const bloc = src.match(ancre)?.[0] ?? src;
      expect(bloc, `${quoi} garde un halo radial`).not.toMatch(/radial-gradient/);
      expect(bloc, `${quoi} garde une grille 1px`).not.toMatch(/linear-gradient\([^)]*1px/);
    });
  }

  it('le thème admin du shell n’a plus ni halo ni grille', () => {
    const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');
    const admin = shell.slice(shell.indexOf('ADMIN_CONTENT'), shell.indexOf('ADMIN_CONTENT') + 400);
    expect(admin, 'le thème admin garde un halo radial').not.toMatch(/radial-gradient/);
    expect(admin, 'le thème admin garde une grille 1px').not.toMatch(/linear-gradient\([^)]*1px/);
  });
});
