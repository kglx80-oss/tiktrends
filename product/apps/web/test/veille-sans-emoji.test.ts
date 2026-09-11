import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** La Veille n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2). */
const FICHIERS = [
  'app/(app)/veille/page.tsx',
  'app/(app)/veille/scale/page.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const BANNIS = ['✨', '✦', '🔒', '📷', '🔗', '⚠️', '🔁', '⬆', '✎', '🖼️'];

describe('Veille · plus aucun emoji d’interface', () => {
  it('aucun des fichiers ne porte d’emoji-icône', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = BANNIS.filter((e) => src.includes(e));
      expect(trouves, `emoji(s) encore présent(s) dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('l’état verrouillé rend une icône du jeu', () => {
    expect(FICHIERS.map((f) => f.src).join('\n')).toMatch(/<Icon name="lock"/);
  });
});
