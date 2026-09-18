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
