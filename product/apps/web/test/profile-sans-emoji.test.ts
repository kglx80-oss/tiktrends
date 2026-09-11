import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'identité de profil n'affiche plus d'emoji d'interface · rollout icônes
 * (retour proprio #2). Le bouton « ⬆ Téléverser une photo » passe à <Icon upload>.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/profile/ProfileIdentity.tsx'), 'utf8');
// Plage large : plans emoji + symboles + flèches 2B00 (⬆) + technique 2300 (⌛).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Profil · plus aucun emoji d’interface', () => {
  it('le fichier ne porte aucun pictogramme', () => {
    const trouves = [...new Set(SRC.match(PICTO) ?? [])];
    expect(trouves, `pictogramme(s) encore dans ProfileIdentity.tsx : ${trouves.join(' ')}`).toEqual([]);
  });
  it('le bouton téléverser rend une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="upload"/);
  });
});
