import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Connexions n'affiche plus d'emoji d'interface · rollout icônes (retour
 * proprio #2). Les ⚡ des boutons « Connexion en un clic (OAuth) » passent à
 * <Icon plug>.
 *
 * On scanne AUSSI page.tsx : la liste des connecteurs y donne un glyphe TEXTE
 * court par marque (GA, BQ, in…) mais Snowflake portait un emoji ❄ · le garde
 * ne regardait que DataConnections.tsx, d'où le trou. Chaque connecteur doit
 * porter un glyphe ASCII, pas un pictogramme.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/connections/DataConnections.tsx'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/connections/page.tsx'), 'utf8');
// Pictogrammes, sauf ★☆ (2605/2606), ✓ (2713), ✕ (2715). Inclut les dingbats
// (2716-27BF) où vit le ❄ (2744) · l'ancienne classe s'arrêtait à 26FF et le
// laissait passer.
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Connexions · plus aucun emoji d’interface', () => {
  it('DataConnections ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans DataConnections.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les boutons de connexion rendent une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="plug"/);
  });
  it('aucun connecteur de la liste ne porte un glyphe pictographique', () => {
    // les glyphes de marque sont des abréviations texte (GA, BQ, in, SN…).
    const glyphes = [...PAGE.matchAll(/glyph: '([^']*)'/g)].map((m) => m[1]);
    expect(glyphes.length, 'la liste des connecteurs doit être trouvée').toBeGreaterThanOrEqual(10);
    for (const g of glyphes) {
      expect([...new Set((g ?? '').match(PICTO) ?? [])], `glyphe pictographique : « ${g} »`).toEqual([]);
    }
  });
});
