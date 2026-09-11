import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La bibliothèque d'assets n'affiche plus d'emoji d'interface · tout est au trait.
 *
 * Écran très regardé par le proprio (« icônes immondes »). Ses actions gardaient
 * des emojis (⬆ Téléverser, 🔗 Importer par lien, ✦ Analyser). On les convertit
 * au jeu partagé. Le logo Google Drive, lui, reste une vraie marque (GoogleDriveIcon).
 */
const SRC = readFileSync(join(process.cwd(), 'app/(app)/assets/AssetsLibrary.tsx'), 'utf8');
const BANNIS = ['⬆', '🔗', '✦', '📷', '📥', '✨', '✎'];

describe('Assets · plus aucun emoji d’interface', () => {
  it('aucune action ne porte d’emoji-icône', () => {
    const trouves = BANNIS.filter((e) => SRC.includes(e));
    expect(trouves, `emoji(s) encore présent(s) dans la bibliothèque : ${trouves.join(' ')}`).toEqual([]);
  });

  it('téléverser, importer et analyser rendent une icône du jeu', () => {
    expect(SRC).toMatch(/<Icon name="upload"/);
    expect(SRC).toMatch(/<Icon name="link"/);
    expect(SRC).toMatch(/<Icon name="sparkles"/);
  });

  it('le logo Google Drive reste une vraie marque, pas une icône générique', () => {
    expect(SRC).toMatch(/GoogleDriveIcon/);
  });
});
