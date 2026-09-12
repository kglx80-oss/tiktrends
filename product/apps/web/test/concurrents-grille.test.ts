import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'onglet Concurrents rend une GRILLE de cartes, pas un empilement de lignes.
 *
 * La page est un composant serveur (elle tire des actions serveur) · non rendable
 * en test. Le RÉSULTAT visible d'une carte est couvert par `carte-concurrent-rendu`
 * (rendu du composant) · ici on garde seulement le CÂBLAGE : la page adopte bien
 * la carte pour chaque concurrent, dans une grille. Un retour aux lignes grises
 * ferait tomber ce garde.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');

describe('la liste des concurrents est une grille de cartes', () => {
  it('chaque concurrent est rendu par la carte dédiée', () => {
    expect(src, 'la carte concurrent n’est plus adoptée').toMatch(/<CarteConcurrent\b/);
    expect(src).toMatch(/competitors\.map\(/);
  });

  it('la disposition est une grille responsive, pas une colonne de lignes', () => {
    expect(src).toMatch(/gridTemplateColumns: 'repeat\(auto-fill, minmax\(240px, 1fr\)\)'/);
  });
});
