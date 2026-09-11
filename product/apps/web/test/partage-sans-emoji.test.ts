import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La page de partage public (lien client) n'affiche plus d'emoji d'interface ·
 * rollout icônes (retour proprio #2). Le 🔒 de l'état verrouillé passe à <Icon lock>.
 */
const SRC = readFileSync(join(process.cwd(), 'app/c/[token]/page.tsx'), 'utf8');
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Partage public · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans c/[token]/page.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('l’état verrouillé rend une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="lock"/);
  });
});
