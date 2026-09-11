import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Composants transverses (lot C) sans emoji d'interface · rollout icônes (retour
 * proprio #2). SavedBoards (📁→folder, 🗺→map), StorageConfigurator (⚙→gear,
 * 🧪→bulb, ✅→check, ⚠️❌→alert, 📦→box), TrackerFeed (🛰️→radar), MarquesSuivies
 * (✨→sparkles).
 *
 * GARDÉS : le ★ « favori » (texte d'aide de SavedBoards), le ✕ de fermeture, le
 * ✓ typographique · ce ne sont pas des pictogrammes colorés d'interface.
 */
const FICHIERS = [
  'components/SavedBoards.tsx',
  'components/StorageConfigurator.tsx',
  'components/TrackerFeed.tsx',
  'components/MarquesSuivies.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆ (favori), ✓ (2713), ✕ (2715).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Composants lot C · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="folder"/);   // SavedBoards
    expect(tout).toMatch(/<Icon name="gear"/);       // StorageConfigurator
    expect(tout).toMatch(/<Icon name="radar"/);      // TrackerFeed
    expect(tout).toMatch(/<Icon name="sparkles"/);   // MarquesSuivies
  });
});
