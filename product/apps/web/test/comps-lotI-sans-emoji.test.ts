import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Coquille, palette et doc (lot I) sans emoji d'interface · dernier lot du
 * rollout icônes (retour proprio #2). AppShell (🎛️→gauge, le héros du bloc
 * admin), et le nettoyage des derniers emojis logés dans les COMMENTAIRES doc
 * de CommandPalette (« pas un 🖼️ ») et d'Icon.tsx (la liste d'exemples
 * 🖼️ 🎬 🎵 📎).
 *
 * GARDÉS ICI, exprès : ⌘ (U+2318, la touche Command, affichée dans les <kbd>
 * des raccourcis ⌘K) et ⌄ (U+2304, le chevron d'un groupe repliable). Ce sont
 * des glyphes clavier/typographiques, pas des pictogrammes colorés · la classe
 * PICTO ci-dessous les EXCLUT explicitement (trous 2303→2305 et 2317→2319).
 */
const FICHIERS = [
  'components/AppShell.tsx',
  'components/CommandPalette.tsx',
  'components/Icon.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆, ✓ (2713), ✕ (2715), ET ⌘ (2318) / ⌄ (2304) qui sont
// des glyphes clavier gardés · d'où les trous 2303→2305 et 2317→2319.
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{2303}\u{2305}-\u{2317}\u{2319}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Coquille & palette lot I · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme (⌘ et ⌄ exceptés, clavier)', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('le héros admin rend l’icône gauge du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="gauge"/);
  });
});
