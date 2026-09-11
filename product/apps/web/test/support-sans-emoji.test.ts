import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Support n'affiche plus d'emoji d'interface · rollout icônes (retour proprio
 * #2). Le type de ticket (🐞 bug, 💡 suggestion, ❓ question) portait l'emoji
 * dans le libellé et dans des <option> · le libellé passe en mots et l'icône du
 * type est rendue par <Icon> (alert/bulb/help) aux endroits qui l'acceptent.
 */
const FICHIERS = [
  'app/(app)/support/page.tsx',
  'app/(app)/support/[id]/page.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Support · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('le type de ticket rend une icône du jeu', () => {
    for (const { rel, src } of FICHIERS) {
      expect(src, `${rel} ne rend pas l'icône de type`).toMatch(/<Icon name=\{TYPE_ICON\[/);
    }
  });
});
