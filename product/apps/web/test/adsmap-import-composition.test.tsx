import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot UI Import · audit /adsmap/import. Deux défauts de présentation mesurés au
 * rendu réel (390) · aucun mapping, calcul, permission ni validation touché :
 *
 *  - la table d'aperçu (min-width 720) faisait déborder la PAGE : sa `section`
 *    est un item de grille (min-width:auto), qui grandit au min-content de la
 *    table, si bien que le conteneur `overflowX:auto` n'était jamais contraint ;
 *  - le support flottait (bulle FIXE recouvrant la légende « Tout arrive proposé »
 *    au défilement) au lieu d'être ancré en pied comme sur les autres écrans Adsmap.
 *
 * On cloue la STRUCTURE à la source. Le rendu réel (débordement 0, bulle ancrée)
 * est prouvé par la recette CDP jointe · jsdom n'a pas de géométrie.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
// Spatial · la page Importer garde la fonction `import` (rôle admin) via la garde de la rubrique.
const page = read('app/(spatial)/sp/adsmap/import/page.tsx');
const action = read('app/actions/adsmap-import.ts');

describe('Import · permissions et deux-temps INCHANGÉS (non-régression)', () => {
  it('l’import reste réservé aux admins · page et actions gardées', () => {
    expect(page).toContain("gardeResultats('import')");
    expect(action).toContain("adsmapGuard({ minRole: 'admin' })");
  });

  it('la prévisualisation n’écrit rien · seule l’application insère en base', () => {
    // previewImportAction va de sa déclaration jusqu'à la déclaration d'ApplyResult.
    const iPrev = action.indexOf('export async function previewImportAction');
    const iApply = action.indexOf('export interface ApplyResult');
    expect(iPrev).toBeGreaterThan(-1);
    expect(iApply).toBeGreaterThan(iPrev);
    const corpsPreview = action.slice(iPrev, iApply);
    expect(corpsPreview, 'previewImportAction ne doit rien écrire (relire avant d’appliquer)').not.toContain('.insert(');
    // L'application, elle, écrit bien.
    expect(action.slice(iApply)).toContain('.insert(');
  });
});
