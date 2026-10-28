import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N03 · « afficher le nombre de sources plutôt que répéter la carte ».
 * Le panneau marché montre, sur chaque confrontation, combien d'annonceurs
 * distincts la portent · sa solidité.
 */
describe('N03 · le panneau marché affiche le nombre de sources', () => {
  // Vague 4 · le panneau V5 (`MarketPanel`) est retiré · la mémoire marché vit dans Pubs du moment
  // (Spatial) · le texte vient du noyau (`lectureMarche`), la vue l'affiche.
  const regle = readFileSync(join(process.cwd(), '../../packages/core/src/spatial/veille/marche.ts'), 'utf8');
  const vue = readFileSync(join(process.cwd(), 'spatial/vues/veille/marche-client.tsx'), 'utf8');
  const panel = regle + vue;
  it('chaque confrontation porte son compte de sources', () => {
    expect(regle).toMatch(/sources: `\$\{c\.sources\} source\$\{c\.sources > 1 \? 's' : ''\}`/);
    expect(vue).toContain('{c.sources}</small>');
  });

  // CDC v8 · N03 · chaque part d'usage porte DEUX axes distincts · le canal
  // d'acquisition (fait) et la qualification métier (pertinence). Le lecteur voit
  // d'où vient la source ET que sa pertinence reste « à qualifier », sans qu'on
  // déduise l'une de l'autre.
  it('chaque part d’usage porte son canal ET sa qualification, distincts', () => {
    expect(panel, 'le canal d’acquisition n’est pas lu').toContain('LIBELLE_CANAL[r.canal].court');
    expect(panel, 'la qualification métier n’est pas lue').toContain('LIBELLE_QUALIFICATION[r.qualification].court');
    expect(vue, 'canal et qualification ne sont pas affichés, distincts').toContain('{r.canal} · {r.qualification}');
  });
});
