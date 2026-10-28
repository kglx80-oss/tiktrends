import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * H4 · la fiche marque ne pose le lien Assets qu'à portée explicite.
 *
 * Le câblage du groupe « Marque » dans le rail V5 (layout `(app)`, `AppShell`)
 * est retiré avec l'ancienne coquille · la fiche, servie par Spatial, garde sa
 * règle de portée.
 */
// Vague 2 · la fiche est servie par Spatial (vue d'ensemble).
const FICHE = readFileSync(join(process.cwd(), 'app/(spatial)/sp/brands/[id]/page.tsx'), 'utf8');

describe('H4 · la fiche ne pose le lien Assets qu’à portée explicite', () => {
  it('la fiche ferme l’ajout d’assets quand la marque consultée n’est pas l’active', () => {
    expect(FICHE, 'l’ajout d’assets n’est plus conditionné à la marque consultée = active').toContain('const raisonAssets = !c.estActive ?');
    expect(FICHE, 'l’ajout d’assets n’est plus fermé avec sa raison').toContain('televerser: raisonAssets ? null : uploadImageAssetsAction');
  });
});
