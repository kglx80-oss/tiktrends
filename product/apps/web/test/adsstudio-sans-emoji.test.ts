import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pubs IA n'affiche plus d'emoji-icône · tout est au trait.
 *
 * Le retour du proprio est direct : « j'ai toujours des icônes immondes ». Les
 * surfaces structurées étaient déjà au trait, mais les boutons et statuts en
 * ligne du studio gardaient des emojis (✨ 🔒 📷 🔗 ⚠️ 🔁 ⬆ ✎ …). On les a
 * convertis au jeu partagé · ce garde empêche qu'ils reviennent.
 *
 * On ne bannit que les emojis d'INTERFACE · une coche « ✓ » dans une phrase de
 * statut (« photos déjà récupérées ✓ ») reste du texte, pas une icône kitsch.
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

const BANNIS = ['✨', '✦', '🔒', '📷', '📥', '🔗', '⚠️', '⚠', '🔁', '⬆', '✎', '🖼️', '🧬', '⧉', '⬚', '◐'];

describe('Pubs IA · plus aucun emoji d’interface', () => {
  it('le studio n’emploie aucun emoji-icône · tout passe par <Icon>', () => {
    const trouves = BANNIS.filter((e) => SRC.includes(e));
    expect(trouves, `emoji(s) d’interface encore présent(s) dans Pubs IA : ${trouves.join(' ')}`).toEqual([]);
  });

  it('les affordances converties rendent bien une icône du jeu', () => {
    // Preuve que la conversion a eu lieu, pas seulement la suppression.
    expect(SRC).toMatch(/<Icon name="sparkles"/);
    expect(SRC).toMatch(/<Icon name=\{suggestion\.avantTout \? 'alert' : 'swap'\}/);
    expect(SRC).toMatch(/<Icon name=\{copied \? 'check' : 'link'\}/);
  });
});
