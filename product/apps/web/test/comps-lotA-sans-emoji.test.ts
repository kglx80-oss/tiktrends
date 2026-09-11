import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Composants transverses (lot A) sans emoji d'interface · rollout icônes (retour
 * proprio #2). Bandeau (🧪ℹ️⚠️ → bulb/info/alert), NotificationBell (🎫💬✅★ →
 * file/chat/check/star · le ★ « system » est une icône de catégorie, pas un
 * favori), SupportWidget (🐞💡❓👋 → alert/bulb/help + salut en mots),
 * CreditsMenu (⚡ → spark).
 */
const FICHIERS = [
  'components/Bandeau.tsx',
  'components/NotificationBell.tsx',
  'components/SupportWidget.tsx',
  'components/CreditsMenu.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

describe('Composants lot A · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/name=\{t\.icon\}/);          // Bandeau
    expect(tout).toMatch(/name=\{ICON\[n\.type\]!\}/);  // NotificationBell
    expect(tout).toMatch(/name=\{TYPE_ICON\[t\.type\]!\}/); // SupportWidget
    expect(tout).toMatch(/<Icon name="spark"/);          // CreditsMenu
  });
});
