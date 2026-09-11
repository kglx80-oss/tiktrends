import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Radar n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2).
 * Les ✨ des CTA d'action passent à <Icon sparkles>, le 🔒 verrouillé à <Icon lock>.
 * Glyphes typographiques monochromes (→ ›) gardés · ce ne sont pas des pictogrammes.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/radar/page.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Radar · plus aucun emoji d’interface', () => {
  it('la page ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans radar/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les conversions rendent des icônes du jeu', () => {
    expect(SRC).toMatch(/<Icon name="sparkles"/);
    expect(SRC).toMatch(/<Icon name="lock"/);
  });
});
