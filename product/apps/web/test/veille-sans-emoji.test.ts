import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** La Veille n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2). */
// Vague 4 · la Veille est servie par Spatial · ses écrans et ses vues (pages V5 retirées).
const FICHIERS = [
  'app/(spatial)/sp/veille/page.tsx',
  'app/(spatial)/sp/veille/scale/page.tsx',
  'spatial/vues/veille/PubsDuMoment.tsx',
  'spatial/vues/veille/client.tsx',
  'spatial/vues/veille/CeQuiScale.tsx',
  'spatial/vues/veille/scale-client.tsx',
  'spatial/vues/veille/Fermee.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const BANNIS = ['✨', '✦', '🔒', '📷', '🔗', '⚠️', '🔁', '⬆', '✎', '🖼️'];

describe('Veille · plus aucun emoji d’interface', () => {
  it('aucun des fichiers ne porte d’emoji-icône', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = BANNIS.filter((e) => src.includes(e));
      expect(trouves, `emoji(s) encore présent(s) dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('l’état verrouillé rend une icône du jeu (sprite Spatial)', () => {
    expect(FICHIERS.map((f) => f.src).join("\n")).toMatch(/<EtatVide icone="lock"/);
  });
});
