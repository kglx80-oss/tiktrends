import { describe, expect, it } from 'vitest';
import { analyzePlanNet, analyzePlanRisk, eurosFinance, financeParFormule } from '../src';

const PRIX = { starter: 0, core: 99, plus: 299, business: 990 };
const CREDITS = { starter: 200, core: 2000, plus: 7000, business: 24000 };
const LIBELLES = { starter: 'Starter', core: 'Core', plus: 'Plus', business: 'Business' };

describe('Spatial · Admin · « Finance · MRR & marges » (calcul de l’ancienne page /admin/finance, à l’identique)', () => {
  const f = financeParFormule({ formules: ['core', 'core', 'plus', 'inconnue', 'starter'], prix: PRIX, credits: CREDITS, libelles: LIBELLES, markup: 3, taux: 0.25 });

  it('compte la formule de CHAQUE espace (une formule inconnue est Starter) × le prix du catalogue', () => {
    expect(f.lignes.map((l) => [l.plan, l.clients])).toEqual([['core', 2], ['plus', 1], ['business', 0]]);
    expect(f.mrr).toBe(2 * 99 + 299);
    expect(f.arr).toBe((2 * 99 + 299) * 12);
    expect(f.clientsPayants).toBe(3);
    expect(f.arpa).toBeCloseTo(497 / 3, 10);
  });

  it('le bénéfice net mensuel déduit coût API, frais et IS · mêmes fonctions, même marge, même taux', () => {
    const core = analyzePlanNet('Core', 99, 2000, 3, 0.25), plus = analyzePlanNet('Plus', 299, 7000, 3, 0.25);
    expect(f.lignes[0]!.net).toEqual(core);
    expect(f.beneficeNetMensuel).toBeCloseTo(2 * core.netEur + plus.netEur, 10);
    // L'IS est bien déduit (un taux nul donne plus).
    expect(financeParFormule({ formules: ['core'], prix: PRIX, credits: CREDITS, libelles: LIBELLES, markup: 3, taux: 0 }).beneficeNetMensuel).toBeGreaterThan(core.netEur);
  });

  it('la reco de marge · cible unique 70 % de marge brute (29/10), crédits optimaux et sur-allocation au-delà de 10 %', () => {
    expect(f.lignes[0]!.risque).toEqual(analyzePlanRisk('Core', 99, 2000, 70));
    expect(f.lignes[0]!.creditsOptimaux).toBe(1782);
    // 2 000 crédits pour 1 782 optimaux · +12 % : Core est sur-alloué à 70 %.
    expect(f.lignes[0]!.surAlloue).toBe(true);
    const juste = financeParFormule({ formules: [], prix: PRIX, credits: { ...CREDITS, core: 1900 }, libelles: LIBELLES, markup: 3, taux: 0.25 });
    expect(juste.lignes[0]!.surAlloue).toBe(false);
    const sur = financeParFormule({ formules: [], prix: PRIX, credits: { ...CREDITS, core: 2300 }, libelles: LIBELLES, markup: 3, taux: 0.25 });
    expect(sur.lignes[0]!.surAlloue).toBe(true);
    expect(sur.clientsPayants).toBe(0);
    expect(sur.arpa).toBe(0);
  });

  it('le format monétaire de l’ancienne page', () => {
    expect(eurosFinance(0.5)).toBe('0,500 €');
    expect(eurosFinance(46.87)).toBe('46,87 €');
    expect(eurosFinance(5964).replace(/\s/g, ' ')).toBe('5 964 €');
  });
});
