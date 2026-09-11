import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Studio de fabrication (lot G) sans emoji d'interface · rollout icônes (retour
 * proprio #2). AdsStudio (🏆→trophy, ⚖→scale, ⬇→download), ImageStudio
 * (📦→box, 💾→save), DropZone (⬇→download), DebriefLotPanel (⚠→alert).
 *
 * Quatre icônes AJOUTÉES au jeu (trophy, scale, download, save) · chacune est
 * rendue ici, donc aucune n'est du code mort.
 *
 * GARDÉS : ✓ (2713), ✕ (2715), ↳ ↗ (flèches), · ce ne sont pas des
 * pictogrammes colorés d'interface.
 */
const FICHIERS = [
  'app/(app)/studio/ads/AdsStudio.tsx',
  'app/(app)/studio/image/ImageStudio.tsx',
  'components/DropZone.tsx',
  'app/(app)/studio/ads/DebriefLotPanel.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆ (favori), ✓ (2713), ✕ (2715).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Studio de fabrication lot G · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu (dont les 4 ajoutées)', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="trophy"/);     // AdsStudio
    expect(tout).toMatch(/<Icon name="scale"/);       // AdsStudio
    expect(tout).toMatch(/<Icon name="download"/);    // AdsStudio · DropZone
    expect(tout).toMatch(/<Icon name="save"/);        // ImageStudio
    expect(tout).toMatch(/<Icon name="box"/);         // ImageStudio
    expect(tout).toMatch(/<Icon name="alert"/);       // DebriefLotPanel
  });
});
