import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La ligne des filtres de la Veille (jusqu'à huit menus) débordait en vrac sur
 * écran étroit · une flex-wrap donnait des colonnes inégales. La page est un gros
 * composant serveur (async, base) · illisible en rendu · on lit la source.
 *
 * Deux invariants responsive, sans media query (styles inline obligent) :
 *  · les filtres sont une grille auto-ajustée qui se reflowe et s'empile ;
 *  · la marge latérale de la page est fluide (elle rétrécit sur mobile).
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');

describe('la Veille tient sur un écran étroit', () => {
  it('les filtres se reflowent en grille auto-ajustée, pas en flex débordante', () => {
    expect(SRC, 'la grille de filtres qui s’empile a disparu').toContain("gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'");
  });

  it('chaque filtre remplit sa colonne · pas de largeurs inégales', () => {
    expect(SRC).toMatch(/<select[\s\S]{0,120}?width: '100%'/);
  });

  it('la marge latérale de la page est fluide', () => {
    expect(SRC, 'la marge latérale figée revient coller le contenu aux bords').toContain('clamp(16px, 4vw, 36px)');
  });
});
