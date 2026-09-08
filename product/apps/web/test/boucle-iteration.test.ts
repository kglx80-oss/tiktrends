import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La boucle d'itération se ferme SUR PLACE.
 *
 * ── La raison d'être du produit ──────────────────────────────────────────────
 *
 * L'outil existe pour trouver des créatives gagnantes ET pour gérer les
 * hypothèses, les itérations · affiner plus vite. Après un lot, l'hypothèse
 * suivante à tester (déduite de ce qui est déjà mesuré) doit être VISIBLE là où
 * l'on voit ce qu'on vient de produire, et s'armer en un clic.
 *
 * Ce conseil vivait dans les réglages avancés, repliés par défaut · donc
 * invisible au moment exact où il sert. Ce garde vérifie qu'il est remonté près
 * de la grille de résultats, en un seul exemplaire, et que son bouton arme
 * l'essai PUIS rouvre l'assistant · le prix s'annonce avant de générer, on ne
 * part pas sur un autre écran pour itérer.
 */

const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('la boucle se ferme dans le studio', () => {
  it('l’hypothèse suivante est visible près des résultats', () => {
    expect(STUDIO).toMatch(/PROCHAINE HYPOTHÈSE/);
  });

  it('le conseil est remonté AVANT la grille, plus enterré dans l’avancé', () => {
    // Le bloc de suggestion précède la grille de résultats dans la source.
    const posBande = STUDIO.indexOf('PROCHAINE HYPOTHÈSE');
    const posGrille = STUDIO.indexOf('ref={grille}');
    expect(posBande).toBeGreaterThan(-1);
    expect(posGrille).toBeGreaterThan(-1);
    expect(posBande, 'la bande doit précéder la grille').toBeLessThan(posGrille);
  });

  it('un seul exemplaire · le doublon des réglages avancés a disparu', () => {
    const n = (STUDIO.match(/suggestion && \(/g) ?? []).length;
    expect(n, 'il ne doit rester qu’un rendu de la suggestion').toBe(1);
  });

  it('le bouton arme l’essai ET rouvre l’assistant · prix annoncé avant de payer', () => {
    // Un même geste pose l'hypothèse et ouvre le chemin guidé · le prix est
    // annoncé à l'étape volume, jamais dépensé au clic direct.
    expect(STUDIO).toMatch(/setEssai\(suggestion\.variable!\);\s*setMode\('brand'\);\s*setAssistant\(true\)/);
  });
});
