import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'espacement du rail · H2 (façon Flora, Kevin 30/09) resserre l'ancien « air »
 * du rail pour faire tenir les entrées principales à 720 en desktop (mesuré ·
 * recette CDP). Les gouttières entre sections et entre items sont plus serrées
 * qu'avant, l'ordre et les libellés ne bougent pas (la boucle reste). La coquille
 * n'est pas rendable en test · on lit la source.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('le rail est dense (H2 · tenir à 720)', () => {
  it('gouttières resserrées entre sections et entre items', () => {
    // Non-admin, déplié · gap de section 6 (était 14), gap d'items 2 (était 3).
    expect(SRC, 'la gouttière de section n’est plus resserrée pour 720').toContain(': 6), alignItems');
    expect(SRC, 'la gouttière d’items n’est plus resserrée pour 720').toContain("flexDirection: 'column', gap: 2 }}");
  });

  it('la hauteur de rangée vient du pointeur · ample au doigt (44), dense à la souris (H2)', () => {
    // L'air n'est plus une hauteur FIGÉE · la rangée prend sa hauteur du noyau
    // selon le pointeur (hauteurRangeeRail) · au doigt elle reste ample (44, cf.
    // packages/core · rail-densite), à la souris elle densifie pour rendre les
    // têtes visibles à 720.
    expect(SRC, 'la hauteur de rangée n’est plus décidée par le pointeur').toContain('hauteurRangeeRail(tactile)');
    expect(SRC, 'la rangée ne pose pas la hauteur décidée').toContain('minHeight: hRangee');
  });
});
