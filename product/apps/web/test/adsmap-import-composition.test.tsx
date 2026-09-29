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
const panel = read('app/(app)/adsmap/import/ImportPanel.tsx');
const page = read('app/(app)/adsmap/import/page.tsx');
const action = read('app/actions/adsmap-import.ts');
const shell = read('components/AppShell.tsx');

describe('Import · la table d’aperçu scrolle chez elle (la page ne déborde plus à 390)', () => {
  it('la section (item de grille) porte min-width:0, sinon elle grandit au min-content de la table', () => {
    expect(panel, 'sans minWidth:0 sur `panel`, la section grandit à 720 et la page déborde à 390')
      .toContain('const panel: CSSProperties = { minWidth: 0,');
  });

  it('le cadre de défilement de l’aperçu reste en place (non-régression)', () => {
    // Le conteneur qui scrolle + la table qui garde sa largeur minimale lisible.
    expect(panel).toContain("overflowX: 'auto'");
    expect(panel).toContain('minWidth: 720');
  });
});

describe('Import · le support est ANCRÉ (il ne recouvre plus la légende)', () => {
  it('/adsmap/import entre dans la liste des écrans à support ancré', () => {
    expect(shell, 'le support de /adsmap/import flotte encore et recouvre le contenu au défilement')
      .toContain("pathname === '/adsmap/import'");
  });
});

describe('Import · permissions et deux-temps INCHANGÉS (non-régression)', () => {
  it('l’import reste réservé aux admins · page et actions gardées', () => {
    expect(page).toContain("roleAtLeast(s.role, 'admin')");
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
