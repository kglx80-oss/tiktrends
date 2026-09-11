import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Composants compte / studio (lot E) sans emoji d'interface · rollout icônes
 * (retour proprio #2). BrandSwitcher (🏷️→tag, ✦→sparkles), QuickSettingsModal
 * (⚙️→gear), ProfileModal (👤→user, ⬆→upload), InviteMemberButton (👥→users),
 * JourneyPanel (✨→sparkles), CreativeActions (⛶→frame, 🗺→map · les emojis des
 * commentaires 👍/👎 retirés, le rendu des pouces restant l'inline <Thumb> SVG).
 *
 * SubmitButton est inclus : son prop `label` a été élargi à ReactNode pour loger
 * l'icône du bouton « Créer et tout importer » de BrandSwitcher.
 *
 * GARDÉS : ✓ (2713), ✕ (2715), ★☆ (favoris), · ↗←→ … · ce ne sont pas des
 * pictogrammes colorés d'interface.
 */
const FICHIERS = [
  'components/BrandSwitcher.tsx',
  'components/QuickSettingsModal.tsx',
  'components/ProfileModal.tsx',
  'components/InviteMemberButton.tsx',
  'components/JourneyPanel.tsx',
  'components/CreativeActions.tsx',
  'components/SubmitButton.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Pictogrammes, sauf ★☆ (favori), ✓ (2713), ✕ (2715).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{2712}\u{2716}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Composants lot E · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="tag"/);        // BrandSwitcher
    expect(tout).toMatch(/<Icon name="gear"/);        // QuickSettingsModal
    expect(tout).toMatch(/<Icon name="user"/);        // ProfileModal
    expect(tout).toMatch(/<Icon name="users"/);       // InviteMemberButton
    expect(tout).toMatch(/<Icon name="upload"/);      // ProfileModal
    expect(tout).toMatch(/<Icon name="frame"/);       // CreativeActions
    expect(tout).toMatch(/<Icon name="map"/);         // CreativeActions
    expect(tout).toMatch(/<Icon name="sparkles"/);    // BrandSwitcher · JourneyPanel
  });
});
