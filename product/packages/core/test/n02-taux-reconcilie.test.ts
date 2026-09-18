import { describe, expect, it } from 'vitest';
import { tauxReussite, libelleTauxFraction, TAUX_NON_CALCULABLE } from '../src/adsmap/verdict-libelle';
import { globalHitRate, type StatSourceAd } from '../src/adsmap/brand-stats';
import type { VerdictValue } from '../src/adsmap/types';

/**
 * CDC v7 · N02 · Adsmap et Jarvis doivent qualifier la réussite de la MÊME
 * façon. Le bug observé · Adsmap dit « Non calculable » (rien d'évaluable au
 * protocole) pendant que Jarvis affichait 6 % · deux définitions du « taux ».
 *
 * `tauxReussite` est le taux VALIDÉ (comparable + verdict absolu évaluable) ·
 * `globalHitRate` est le taux HISTORIQUE (compte les gagnantes relatives, ignore
 * la comparabilité). Ils ne mesurent pas la même chose · le headline Jarvis doit
 * se revendiquer du premier, jamais présenter le second comme validé.
 */

const ad = (verdict: VerdictValue | null, comparable: boolean): StatSourceAd => ({
  verdict, comparable, mechanism: null, format: null,
});

describe('N02 · taux validé (protocole) vs taux historique · le vrai écart', () => {
  it('des gagnantes relatives non comparables · validé « Non calculable », historique non nul', () => {
    // Le cas exact du constat · deux « gagnants » déclarés hors protocole + un
    // relatif · rien n'est évaluable au protocole, mais l'historique compte les
    // relatifs comme des réussites.
    const lot = [ad('winner', false), ad('relative_winner', false), ad('loser', false)];

    // Adsmap · validé au protocole · rien de comparable-évaluable comme gagnante.
    const valide = tauxReussite(lot.map((a) => ({ value: a.verdict, comparable: a.comparable })));
    expect(valide.taux, 'aucune gagnante comparable · le taux validé est Non calculable').toBe(null);

    // Jarvis · historique · compte le relatif comme réussite → non nul.
    const historique = globalHitRate(lot);
    expect(historique, 'l’historique, lui, n’est pas Non calculable').not.toBe(null);

    // La preuve du bug · les deux divergent. Le headline doit prendre le validé.
    expect(valide.taux).not.toBe(historique);
  });

  it('quand tout est comparable et évalué, le validé mesure bien', () => {
    const lot = [ad('winner', true), ad('winner', true), ad('loser', true)];
    const valide = tauxReussite(lot.map((a) => ({ value: a.verdict, comparable: a.comparable })));
    expect(valide.taux).toBeCloseTo(2 / 3, 6);
    expect(valide.evaluables).toBe(3);
  });
});

describe('libelleTauxFraction · un seul mot du vide, partagé par les écrans', () => {
  it('null → « Non calculable », jamais 0 %', () => {
    expect(libelleTauxFraction(null)).toBe(TAUX_NON_CALCULABLE);
    expect(libelleTauxFraction(null)).not.toContain('0');
  });
  it('une fraction devient un pourcentage arrondi', () => {
    expect(libelleTauxFraction(0.06)).toBe('6 %');
    expect(libelleTauxFraction(2 / 3)).toBe('67 %');
  });
});
