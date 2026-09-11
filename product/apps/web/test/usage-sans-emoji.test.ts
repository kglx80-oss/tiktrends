import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Utilisation des crédits n'affiche plus d'emoji d'interface · rollout
 * icônes (retour proprio #2). La colonne d'icône de `familyOf` rendait des
 * emojis (💳 ✨ 🎬 …) et un losange ◈ · elle porte désormais des NOMS du jeu
 * partagé, rendus par <Icon>.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/usage/page.tsx'), 'utf8');
// Pictogrammes + le losange ◈ (U+25C8) qui décorait la colonne.
const BANNIS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}\u{25C8}]/gu;

describe('Utilisation · plus aucun emoji d’interface', () => {
  it('la page ne porte aucun pictogramme ni losange', () => {
    const trouves = [...new Set(SRC.match(BANNIS) ?? [])];
    expect(trouves, `glyphe(s) d'interface encore dans usage/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('la colonne de famille rend une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name=\{f\.icon\}/);
  });
});
