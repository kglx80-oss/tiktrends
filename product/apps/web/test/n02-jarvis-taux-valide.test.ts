import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N02 · le headline « Taux de réussite » de Jarvis doit se revendiquer
 * du taux VALIDÉ (protocole), pas du taux historique (`globalRate`), pour dire
 * la même chose qu'Adsmap · « Non calculable » quand rien n'est évaluable.
 */
describe('N02 · Jarvis · le headline suit le taux validé, pas l’historique', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');

  it('le headline est alimenté par tauxProtocole via libelleTauxFraction', () => {
    expect(page).toMatch(/label="Taux de réussite validé"/);
    expect(page).toMatch(/libelleTauxFraction\(stats\.tauxProtocole\.taux\)/);
  });

  it('le headline ne réutilise plus globalRate comme valeur affichée', () => {
    expect(page, 'l’ancien headline historique subsiste').not.toContain("value={globalRate === null ? '—' : pct(globalRate)}");
  });
});

/**
 * CDC v8 · N02 · le panneau du texte injecté dit PRÉCISÉMENT ce qu'il montre ·
 * la seule mémoire de performance mesurée, pas l'intégralité du contexte. Il
 * réutilise la source existante (`jarvisMeasuredMemory`), sans second assemblage.
 */
describe('N02 · le panneau nomme exactement ce qu’il affiche', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');
  const memory = readFileSync(join(process.cwd(), 'lib/jarvis-memory.ts'), 'utf8');

  it('l’intitulé « texte exact injecté » (trompeur) a disparu', () => {
    expect(page, 'l’ancien intitulé laissait croire le contexte complet').not.toContain('Voir le texte exact injecté');
    expect(page).toContain('Voir la mémoire de performance utilisée pour la génération');
  });

  it('le panneau dit que les autres éléments du contexte ne sont pas affichés', () => {
    expect(page, 'la réserve sur les éléments non affichés manque').toMatch(/ne sont pas affichés ici/);
  });

  it('le panneau lit la MÊME source que la génération, sans second assemblage', () => {
    // Le panneau affiche `memoire` = jarvisMeasuredMemory (page.tsx).
    expect(page).toMatch(/jarvisMeasuredMemory\(brand\.id/);
    // Et la génération compose son contexte À PARTIR de cette même mesure ·
    // jarvisMemoryWithUse met `mesure` (jarvisMeasuredMemory) en tête.
    expect(memory).toMatch(/jarvisMeasuredMemory\(brandId, workspaceId\)/);
    expect(memory).toMatch(/text: \[mesure, marche, accroches\]/);
  });
});
