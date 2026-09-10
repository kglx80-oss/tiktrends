import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le rail était jugé trop dense. On lui donne de l'air · plus d'espace entre les
 * sections et entre les items, des lignes un peu plus hautes · sans toucher à
 * l'ordre ni aux libellés (la boucle reste). La coquille n'est pas rendable en
 * test · on lit la source.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('le rail respire', () => {
  it('plus d’espace entre les sections et entre les items', () => {
    expect(SRC, 'l’espace entre sections a été resserré').toContain(': 14), alignItems');
    expect(SRC, 'l’espace entre items d’une section a été resserré').toContain("flexDirection: 'column', gap: 3 }}");
  });

  it('les lignes du rail sont un peu plus hautes', () => {
    expect(SRC).toContain("it.isSub ? '8px 10px 8px 30px' : '10px 11px'");
  });
});
