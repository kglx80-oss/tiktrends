import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Coûts & marges (crédits) n'affiche plus d'emoji d'interface · rollout
 * icônes (retour proprio #2). Le lot de crédits ⌛/🎟️ passe à <Icon clock>/<Icon
 * coin>, le ⚠ de santé de formule à <Icon alert>.
 *
 * GARDÉS volontairement : le losange ◈ (U+25C8) est le SYMBOLE D'UNITÉ des
 * crédits (« ◈ 1 250 »), monochrome et présent jusque dans des attributs `title`
 * et des template strings où une icône ne peut aller · c'est une marque d'unité,
 * pas un pictogramme. Le ✓ (U+2713) reste aussi, typographique.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/credits/page.tsx'), 'utf8');
// Pictogrammes + plage technique (⌛). Pas ◈ (25C8) ni ✓ (2713).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2300}-\u{23FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Crédits · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans credits/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les conversions rendent des icônes du jeu', () => {
    expect(SRC).toMatch(/<Icon name="clock"/);
    expect(SRC).toMatch(/<Icon name="coin"/);
    expect(SRC).toMatch(/<Icon name="alert"/);
  });
});
