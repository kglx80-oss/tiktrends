import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N03 · « afficher le nombre de sources plutôt que répéter la carte ».
 * Le panneau marché montre, sur chaque confrontation, combien d'annonceurs
 * distincts la portent · sa solidité.
 */
describe('N03 · le panneau marché affiche le nombre de sources', () => {
  const panel = readFileSync(join(process.cwd(), 'app/(app)/jarvis/MarketPanel.tsx'), 'utf8');
  it('chaque confrontation porte son compte de sources', () => {
    expect(panel).toMatch(/\{c\.sources\} source\{c\.sources > 1 \? 's' : ''\}/);
  });

  // CDC v8 · N03 · chaque part d'usage porte DEUX axes distincts · le canal
  // d'acquisition (fait) et la qualification métier (pertinence). Le lecteur voit
  // d'où vient la source ET que sa pertinence reste « à qualifier », sans qu'on
  // déduise l'une de l'autre.
  it('chaque part d’usage porte son canal ET sa qualification, distincts', () => {
    expect(panel, 'le canal d’acquisition n’est pas lu').toContain('LIBELLE_CANAL[r.canal]');
    expect(panel, 'la qualification métier n’est pas lue').toContain('LIBELLE_QUALIFICATION[r.qualification]');
    expect(panel, 'le canal n’est pas affiché').toMatch(/\{canal\.court\}/);
    expect(panel, 'la qualification n’est pas affichée').toMatch(/\{qualif\.court\}/);
  });
});
