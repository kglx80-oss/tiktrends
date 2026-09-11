import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le studio Image n'affiche plus d'emoji d'interface · tout est au trait.
 * Suite du rollout icônes (retour proprio #2), même méthode que Pubs IA / Assets.
 */
const FICHIERS = [
  'app/(app)/studio/image/ImageStudio.tsx',
  'app/(app)/studio/image/AssistantImage.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const BANNIS = ['✨', '✦', '🔒', '📷', '📥', '🔗', '⚠️', '⚠', '🔁', '⬆', '✎', '🖼️'];

describe('Image IA · plus aucun emoji d’interface', () => {
  it('aucun des deux fichiers ne porte d’emoji-icône', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = BANNIS.filter((e) => src.includes(e));
      expect(trouves, `emoji(s) encore présent(s) dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });

  it('les affordances converties rendent bien une icône du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="sparkles"/);
    expect(tout).toMatch(/<Icon name="upload"/);
    expect(tout).toMatch(/<Icon name="lock"/);
  });
});
