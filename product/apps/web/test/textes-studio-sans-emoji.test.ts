import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Textes n'affiche plus d'emoji d'interface · tout est au trait.
 * Suite du rollout icônes (retour proprio #2).
 */
const FICHIERS = [
  'app/(app)/studio/textes/StudioClient.tsx',
  'app/(app)/studio/textes/page.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const BANNIS = ['✨', '✦', '🔒', '📷', '🔗', '⚠️', '⚠', '✎', '🖼️'];

describe('Textes IA · plus aucun emoji d’interface', () => {
  it('aucun des fichiers ne porte d’emoji-icône', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = BANNIS.filter((e) => src.includes(e));
      expect(trouves, `emoji(s) encore présent(s) dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });

  it('les actions clés rendent une icône du jeu', () => {
    const src = FICHIERS[0]!.src;
    expect(src).toMatch(/<Icon name="sparkles"/);
    expect(src).toMatch(/<Icon name="check"/);
  });
});
