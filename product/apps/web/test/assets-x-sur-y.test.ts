import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S13 du cahier des charges · la Bibliothèque doit montrer « X résultats sur Y »,
 * les critères actifs et un « Réinitialiser » nommé pareil partout. Avant : le
 * décompte X/Y n'existait pas et le seul reset (« Tout afficher ») n'apparaissait
 * que dans l'état vide filtré.
 *
 * Composant client à actions serveur · non rendable · garde par adoption de la
 * source · les décomptes viennent de `filtered`/`assets`, pas d'un nombre écrit
 * à la main.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/assets/AssetsLibrary.tsx'), 'utf8');

describe('Bibliothèque · « X sur Y » et Réinitialiser (S13)', () => {
  it('affiche le filtré sur le total quand un critère est actif', () => {
    expect(src, 'le décompte X/Y est absent').toContain('sur {assets.length} assets');
    expect(src, 'le filtré n’est pas exposé').toContain('{filtered.length}');
    expect(src).toContain('critereActif');
  });

  it('un bouton Réinitialiser existe hors de l’état vide', () => {
    expect(src).toContain('onClick={reinitialiser}');
    expect(src, 'le vocabulaire doit être « Réinitialiser », pas « Tout afficher »').not.toContain('Tout afficher');
  });
});
