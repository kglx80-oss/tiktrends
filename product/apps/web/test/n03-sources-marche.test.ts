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
});
