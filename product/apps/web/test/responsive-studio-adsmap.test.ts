import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Suite du responsive (#324 rail, #325 Veille) · les surfaces denses de création
 * (Studio, Adsmap) avaient une marge latérale figée à 36px · sur un téléphone le
 * contenu se collait aux bords. On la rend fluide (clamp · 36px large, 16px
 * mobile). Pages serveur denses · on lit la source.
 */
const PAGES = [
  'app/(app)/studio/page.tsx',
  'app/(app)/studio/ads/page.tsx',
  'app/(app)/studio/image/page.tsx',
  'app/(app)/studio/video/page.tsx',
  'app/(app)/studio/textes/page.tsx',
  'app/(app)/adsmap/page.tsx',
  'app/(app)/adsmap/lots/page.tsx',
  'app/(app)/adsmap/suites/page.tsx',
  'app/(app)/adsmap/protocole/page.tsx',
  'app/(app)/adsmap/import/page.tsx',
  'app/(app)/adsmap/radar/page.tsx',
  'app/(app)/adsmap/tri/page.tsx',
];

describe('les surfaces denses ont une marge latérale fluide', () => {
  it.each(PAGES)('%s ne colle plus le contenu aux bords sur mobile', (p) => {
    const s = readFileSync(join(process.cwd(), p), 'utf8');
    expect(s, 'la marge latérale fluide a disparu de cette page').toContain('clamp(16px, 4vw, 36px)');
    expect(s, 'une marge latérale figée à 36px subsiste').not.toMatch(/padding: '\d+px 36px/);
  });
});
