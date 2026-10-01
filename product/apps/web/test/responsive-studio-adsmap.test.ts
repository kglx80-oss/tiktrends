import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Suite du responsive (#324 rail, #325 Veille) · les surfaces denses de création
 * (Studio, Adsmap) avaient une marge latérale figée à 36px · sur un téléphone le
 * contenu se collait aux bords. On la rend fluide (clamp · plancher 16px mobile).
 * La borne haute vaut 36px partout, sauf sur Pubs IA (`/studio/ads`) que le lot
 * Codex du 28/09 resserre à 32px (contrat `docs/ux/pubs-ia-composition.md`) · la
 * garde tolère 32 ou 36, jamais une marge figée. Pages serveur denses · on lit la source.
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
    // Depuis B2 (#118), la gouttière fluide (16 → 32) vient du cadre commun `cadrePage`.
    expect(s, 'la marge latérale fluide a disparu de cette page').toMatch(/cadrePage/);
    expect(s, 'une marge latérale figée subsiste').not.toMatch(/padding: '\d+px 3[26]px/);
  });
});
