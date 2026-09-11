import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran Connexions n'affiche plus d'emoji d'interface · rollout icônes (retour
 * proprio #2). Les ⚡ des boutons « Connexion en un clic (OAuth) » passent à
 * <Icon plug>.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/connections/DataConnections.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Connexions · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans DataConnections.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('les boutons de connexion rendent une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="plug"/);
  });
});
