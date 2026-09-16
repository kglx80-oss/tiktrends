import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un champ atteint au clavier doit garder un anneau de focus · `outline: none`
 * sans remplacement laisse l'utilisateur au clavier sans savoir où il est. Le
 * studio portait deux styles de champ (`fld`, et `st` dans `TextField`) qui le
 * supprimaient · on exige qu'aucun style de cet écran ne coupe le focus.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source, comme les autres gardes d'AdsStudio. La valeur exacte
 * du style EST le résultat ici · un champ dont le style porte `outline: none`
 * perd son anneau, quel que soit le rendu.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · les champs gardent leur anneau de focus', () => {
  it('aucun style de l’écran ne supprime l’indicateur de focus', () => {
    expect(src, 'un champ coupe son anneau de focus au clavier (outline: none sans remplacement)')
      .not.toContain("outline: 'none'");
  });
});
