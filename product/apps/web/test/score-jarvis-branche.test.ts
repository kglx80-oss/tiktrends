import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le barème du Score Jarvis est UN SEUL, tenu dans packages/core (niveauScore).
 *
 * Chaque écran qui colore ou nomme un score le lit du noyau · aucun ne
 * réintroduit un seuil numérique en dur (c'est ce qui avait fait diverger la
 * pastille 75/55, la carte 80/60/45, l'analyse 75/45 et l'anneau 80). Un seuil
 * recodé en dur ici retomberait dans le piège · on l'interdit.
 */
const ECRANS = [
  'app/(app)/studio/ads/AdsStudio.tsx',
  'app/(app)/analytics/CreativeIntel.tsx',
  'app/(app)/jarvis/JarvisRules.tsx',
].map((rel) => ({ rel, src: readFileSync(join(process.cwd(), rel), 'utf8') }));

// Un seuil de score en dur = « score >= 80/75/60/55/45 » (ou s.score, etc.).
const SEUIL_EN_DUR = /\bscore\s*>=\s*(80|75|60|55|45)\b/;

describe('Score Jarvis · un seul barème, lu du noyau', () => {
  it('chaque écran lit niveauScore du noyau', () => {
    for (const { rel, src } of ECRANS) {
      expect(src, `${rel} doit lire niveauScore du noyau`).toMatch(/niveauScore/);
    }
  });

  it('aucun écran ne recode un seuil de score en dur', () => {
    for (const { rel, src } of ECRANS) {
      expect(SEUIL_EN_DUR.test(src), `seuil de score en dur dans ${rel}`).toBe(false);
    }
  });
});
