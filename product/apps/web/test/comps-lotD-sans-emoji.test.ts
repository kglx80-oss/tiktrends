import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Composants du studio de création (lot D) sans emoji d'interface · rollout
 * icônes (retour proprio #2). DecouverteSection (✦→sparkles),
 * GrammaireCategorie (✦→sparkles), ScenarioCard (🎬→film, ✦→sparkles).
 *
 * GARDÉS : le ✕ de fermeture, le ✓ typographique, le · séparateur, les flèches
 * ↗←→ · ce ne sont pas des pictogrammes colorés d'interface.
 */
const FICHIERS = [
  'components/DecouverteSection.tsx',
  'components/GrammaireCategorie.tsx',
  'components/ScenarioCard.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆ (favori), ✓ (2713), ✕ (2715).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Composants lot D · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="film"/);       // ScenarioCard
    expect(tout).toMatch(/<Icon name="sparkles"/);   // DecouverteSection · GrammaireCategorie · ScenarioCard
  });
});
