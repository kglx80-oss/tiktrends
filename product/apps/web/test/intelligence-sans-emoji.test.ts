import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Intelligence marché n'affiche plus d'emoji d'interface · rollout
 * icônes (retour proprio #2). 🎯 → <Icon target>, 💪 → <Icon star>, 💶 → <Icon
 * coin>, ⚠ → <Icon alert> ; les 👍/👎 (texte et commentaire) passent en mots,
 * et le ⚠ d'un commentaire aussi · le fichier entier est sans pictogramme.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/admin/intelligence/page.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Intelligence marché · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme (commentaires compris)', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans intelligence/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les conversions rendent des icônes du jeu', () => {
    expect(SRC).toMatch(/<Icon name="target"/);
    expect(SRC).toMatch(/<Icon name="star"/);
    expect(SRC).toMatch(/<Icon name="coin"/);
    expect(SRC).toMatch(/<Icon name="alert"/);
  });
});
