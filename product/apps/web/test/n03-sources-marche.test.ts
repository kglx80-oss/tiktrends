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

  // CDC v8 · N03 · chaque part d'usage porte la pertinence de sa source pour la
  // marque · le lecteur sait pourquoi une inspiration hors catégorie est là et
  // peut l'écarter, sans toucher un verdict de performance.
  it('chaque part d’usage porte le libellé de pertinence de sa source', () => {
    expect(panel, 'le panneau n’adopte pas la carte de pertinence partagée').toContain('LIBELLE_PERTINENCE[r.pertinence]');
    expect(panel, 'la pertinence n’est pas affichée').toMatch(/\{pert\.court\}/);
    expect(panel, 'la limite de la source n’est pas donnée en survol').toMatch(/title=\{pert\.note\}/);
  });
});
