import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bilanHypotheses, consigneAnglesGagnants, type CreaJugee } from '@tiktrends/core';

/**
 * De la mesure à l'action · le bilan d'hypothèses PILOTE la génération.
 * On teste le RÉSULTAT · la consigne ne liste que les angles qui ont le droit
 * de parler ET qui convainquent au moins autant que la moyenne.
 */

const up = (angle: string): CreaJugee => ({ angle, rating: 'up' });
const down = (angle: string): CreaJugee => ({ angle, rating: 'down' });

describe('consigneAnglesGagnants · seulement les angles mesurés gagnants', () => {
  it('liste un angle jugé au-dessus de la référence', () => {
    // Témoignage : 6/6 jugées pertinentes (100 %). Offre : 1/6 (17 %).
    const creas = [
      ...Array(6).fill(0).map(() => up('Témoignage')),
      up('Offre / promo'), ...Array(5).fill(0).map(() => down('Offre / promo')),
    ];
    const c = consigneAnglesGagnants(bilanHypotheses(creas))!;
    expect(c).toContain('Témoignage');
    expect(c).not.toContain('Offre / promo'); // en dessous de la moyenne
    expect(c).toMatch(/privilégie/);
  });

  it('null quand aucun angle n’a le droit de parler', () => {
    // Trois jugées seulement · sous le plancher → « à confirmer », pas gagnant.
    expect(consigneAnglesGagnants(bilanHypotheses([up('A'), up('A'), up('A')]))).toBeNull();
  });

  it('null quand rien n’a été jugé', () => {
    expect(consigneAnglesGagnants(bilanHypotheses([{ angle: 'A', rating: null }]))).toBeNull();
  });
});

const ADS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('la génération est bien pilotée par le bilan', () => {
  it('les angles gagnants entrent dans winningPatterns', () => {
    expect(ADS).toMatch(/preferencesAngles\(brand\.id\)/);
    expect(ADS).toMatch(/consigneAnglesGagnants\(/);
    // Le résultat est réellement injecté, pas seulement calculé.
    expect(ADS).toMatch(/winningPatterns = \[[^\]]*anglesGagnants/);
  });
});
