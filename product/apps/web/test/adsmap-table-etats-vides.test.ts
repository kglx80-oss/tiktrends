import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S13 du cahier des charges · la Table Adsmap doit distinguer TROIS états vides :
 * erreur de chargement, filtres qui ne rendent rien, absence réelle d'ads. Avant,
 * une erreur affichait EN MÊME TEMPS le conseil « Importer ton tableau » · un
 * conseil faux et trompeur. Et aucun bouton « Réinitialiser » les filtres.
 *
 * Composant client à actions serveur · non rendable · garde par adoption de la
 * source · c'est la STRUCTURE du rendu (branches mutuellement exclusives) qui est
 * le résultat.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/adsmap/AdsMapTable.tsx'), 'utf8');

describe('Adsmap Table · trois états vides distincts (S13)', () => {
  it('l’erreur est un état À PART · elle ne double plus le conseil d’import', () => {
    // L'erreur est la première branche, exclusive · le bloc vide est dans le
    // « sinon », donc jamais rendu en même temps.
    const iErr = src.indexOf('{error ? (');
    const iBandeau = src.indexOf('<Bandeau ton="error">{error}</Bandeau>');
    // L'état vide « absence réelle » (le dernier « Importer ton tableau ») vient
    // après la branche erreur · il en est le « sinon », donc exclusif.
    const iImportVide = src.lastIndexOf('Importer ton tableau');
    expect(iErr, 'l’erreur n’est plus une branche exclusive').toBeGreaterThan(-1);
    expect(iBandeau, 'l’erreur n’est pas annoncée par un Bandeau').toBeGreaterThan(iErr);
    expect(iImportVide, 'le conseil d’import de l’état vide doit venir APRÈS la branche erreur').toBeGreaterThan(iBandeau);
  });

  it('filtres→0 et absence réelle sont deux états distincts', () => {
    expect(src, 'l’état filtres→0 n’existe pas').toContain('Aucune ad pour ces filtres');
    expect(src, 'les deux vides ne sont pas départagés').toContain('filtresActifs ? (');
  });

  it('un bouton Réinitialiser apparaît quand des filtres sont actifs', () => {
    expect(src).toContain('filtresActifs && (');
    expect(src).toContain('onClick={reinitialiser}');
  });
});
