import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Adsmap n'affiche plus d'emoji d'interface · rollout icônes (retour proprio #2).
 * ⚠ « budget qui brûle » → <Icon alert>, ✨ « Studio » → <Icon sparkles>,
 * 🔒 verrouillé → <Icon lock>. Glyphes typographiques (— …) laissés à part.
 */
const FICHIERS = [
  'app/(app)/adsmap/AdsMapTable.tsx',
  'app/(app)/adsmap/page.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

const PICTO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/gu;

describe('Adsmap · plus aucun emoji d’interface', () => {
  it('aucun fichier ne porte de pictogramme', () => {
    for (const { rel, src } of FICHIERS) {
      const trouves = [...new Set(src.match(PICTO) ?? [])];
      expect(trouves, `pictogramme(s) encore dans ${rel} : ${trouves.join(' ')}`).toEqual([]);
    }
  });
  it('les conversions rendent des icônes du jeu', () => {
    const tout = FICHIERS.map((f) => f.src).join('\n');
    expect(tout).toMatch(/<Icon name="alert"/);
    expect(tout).toMatch(/<Icon name="sparkles"/);
    expect(tout).toMatch(/<Icon name="lock"/);
  });
});
