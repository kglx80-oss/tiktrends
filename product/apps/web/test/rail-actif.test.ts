import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'état « je suis ici » du rail était un pavé accent PLEIN · le proprio l'a
 * trouvé lourd. Il devient un liséré accent + une teinte légère : on voit où
 * l'on est sans que l'item écrase le reste de la liste. La coquille est un gros
 * composant client, illisible en rendu · on lit la source.
 */
const SRC = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

describe('l’item actif du rail est un liséré, pas un pavé plein', () => {
  it('porte un liséré accent (inset), sur un fond seulement teinté', () => {
    expect(SRC, 'le liséré accent a disparu de l’item actif').toMatch(/active \? 'inset 3px 0 0 var\(--accent-strong\)'/);
    expect(SRC, 'le fond de l’item actif n’est plus une teinte légère').toMatch(/background: active \? 'rgba\(254,44,85,\.10\)'/);
  });
});
