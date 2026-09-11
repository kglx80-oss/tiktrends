import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Écrans verrouillés (lot F) sans emoji d'interface · rollout icônes (retour
 * proprio #2). Les gates de plan/rôle affichaient un 🔒 · remplacé par
 * l'icône `lock` du jeu partagé. Studio Pubs/Image/Vidéo (pages serveur) +
 * la puce d'état verrouillé du Hub.
 *
 * GARDÉS : ● ◐ (pastilles d'état, U+25CF/25D0), ✓ ✕ · ce ne sont pas des
 * pictogrammes colorés d'interface.
 */
const FICHIERS = [
  'app/(app)/studio/ads/page.tsx',
  'app/(app)/studio/image/page.tsx',
  'app/(app)/studio/video/page.tsx',
  'components/Hub.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆ (favori), ✓ (2713), ✕ (2715).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Écrans verrouillés lot F · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les gates rendent l’icône lock du jeu', () => {
    for (const { rel, src } of FICHIERS) {
      expect(src, `pas d’<Icon name="lock"> dans ${rel}`).toMatch(/<Icon name="lock"/);
    }
  });
});
