import { describe, it, expect } from 'vitest';
import { chi2Quantile, poissonInterval, wilsonInterval, normalQuantile, median, deriveMetrics, gammaP } from '../src/adsmap/stats';

/**
 * Le quantile chi² est écrit à la main (JavaScript n'en a pas). Il est donc
 * vérifié contre des valeurs de table publiées : si ces cas passent, les
 * intervalles de Poisson du moteur de verdict sont fiables.
 */
describe('quantile du chi²', () => {
  const cas: Array<[number, number, number]> = [
    // [p, degrés de liberté, valeur de table]
    [0.95, 1, 3.8415], [0.95, 2, 5.9915], [0.95, 5, 11.0705], [0.95, 10, 18.3070],
    [0.05, 2, 0.1026], [0.05, 10, 3.9403],
    [0.975, 1, 5.0239], [0.025, 20, 9.5908],
    [0.5, 4, 3.3567], [0.99, 3, 11.3449],
  ];
  for (const [p, k, attendu] of cas) {
    it(`chi²(${p}, ${k}) ≈ ${attendu}`, () => {
      expect(chi2Quantile(p, k)).toBeCloseTo(attendu, 3);
    });
  }
  it('la répartition est l’inverse du quantile', () => {
    for (const k of [1, 3, 8, 25]) {
      const x = chi2Quantile(0.8, k);
      expect(gammaP(k / 2, x / 2)).toBeCloseTo(0.8, 6);
    }
  });
});

describe('quantile normal', () => {
  it('vaut les valeurs usuelles', () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
    expect(normalQuantile(0.95)).toBeCloseTo(1.6449, 3);
    expect(normalQuantile(0.975)).toBeCloseTo(1.9600, 3);
    expect(normalQuantile(0.005)).toBeCloseTo(-2.5758, 3);
  });
});

describe('intervalle de Poisson sur les achats', () => {
  /**
   * Table C1.4 de l'addendum v2.1, calculée avec scipy · unilatéral 80 %.
   * Tolérance imposée : ±0,5 %. C'est ce test qui garantit que le quantile chi²
   * écrit à la main vaut celui d'une bibliothèque statistique.
   */
  const C14: Array<[number, number, number]> = [
    [0, 0, 1.609], [1, 0.223, 2.994], [2, 0.824, 4.279], [3, 1.535, 5.515],
    [4, 2.297, 6.721], [5, 3.090, 7.906], [6, 3.904, 9.075], [7, 4.734, 10.233],
    [8, 5.576, 11.380], [9, 6.428, 12.519], [10, 7.289, 13.651], [11, 8.157, 14.777],
    [12, 9.031, 15.897],
  ];
  for (const [k, lo, hi] of C14) {
    it(`k=${k} → [${lo} ; ${hi}] à ±0,5 %`, () => {
      const i = poissonInterval(k, 0.8);
      if (lo === 0) expect(i.lo).toBe(0);
      else expect(Math.abs(i.lo - lo) / lo).toBeLessThan(0.005);
      expect(Math.abs(i.hi - hi) / hi).toBeLessThan(0.005);
    });
  }

  it('zéro achat : borne basse nulle · on ne connaît que le plafond', () => {
    const i = poissonInterval(0, 0.8);
    expect(i.lo).toBe(0);
  });
  it('encadre le comptage observé', () => {
    for (const n of [1, 3, 6, 20, 100]) {
      const i = poissonInterval(n, 0.8);
      expect(i.lo).toBeLessThanOrEqual(n);
      expect(i.hi).toBeGreaterThanOrEqual(n);
    }
  });
  it('se resserre relativement quand le comptage grandit', () => {
    const large = (n: number) => { const i = poissonInterval(n, 0.8); return (i.hi - i.lo) / n; };
    expect(large(100)).toBeLessThan(large(3));
  });
  it('un niveau de confiance plus élevé élargit l’intervalle', () => {
    expect(poissonInterval(10, 0.95).hi).toBeGreaterThan(poissonInterval(10, 0.8).hi);
  });
});

describe('intervalle de Wilson sur les taux', () => {
  it('encadre la proportion observée', () => {
    const i = wilsonInterval(300, 1000, 0.8);
    expect(i.lo).toBeLessThan(0.3);
    expect(i.hi).toBeGreaterThan(0.3);
  });
  it('reste dans [0, 1] même aux extrêmes', () => {
    for (const [s, n] of [[0, 100], [100, 100], [1, 3]] as const) {
      const i = wilsonInterval(s, n, 0.8);
      expect(i.lo).toBeGreaterThanOrEqual(0);
      expect(i.hi).toBeLessThanOrEqual(1);
    }
  });
  it('se resserre quand l’échantillon grandit', () => {
    const l = (n: number) => { const i = wilsonInterval(n * 0.3, n, 0.8); return i.hi - i.lo; };
    expect(l(10000)).toBeLessThan(l(100));
  });
  it('sans impression, on ne sait rien', () => {
    expect(wilsonInterval(0, 0)).toEqual({ lo: 0, hi: 1 });
  });
});

describe('médiane', () => {
  it('impair et pair', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('ignore les valeurs non finies, rend null si vide', () => {
    expect(median([1, Infinity, NaN, 3])).toBe(2);
    expect(median([])).toBeNull();
    expect(median([NaN])).toBeNull();
  });
});

describe('métriques dérivées', () => {
  const base = { spend: 150, impressions: 20000, video3sViews: 6500, thruplays: 2500, linkClicks: 300, purchases: 6, purchaseValue: 420 };

  it('calcule les taux du funnel', () => {
    const d = deriveMetrics(base);
    expect(d.hookRate).toBeCloseTo(0.325, 3);
    expect(d.holdRate).toBeCloseTo(0.125, 3);
    expect(d.ctr).toBeCloseTo(0.015, 3);
    expect(d.cvr).toBeCloseTo(0.02, 3);
    expect(d.cpa).toBeCloseTo(25, 3);
    expect(d.roas).toBeCloseTo(2.8, 3);
  });

  it('le CPA est encadré, et l’encadrement contient la valeur ponctuelle', () => {
    const d = deriveMetrics(base);
    expect(d.cpaLo!).toBeLessThan(25);
    expect(d.cpaHi!).toBeGreaterThan(25);
  });

  it('zéro achat : pas de CPA, plafond infini · on ne peut pas conclure', () => {
    const d = deriveMetrics({ ...base, purchases: 0 });
    expect(d.cpa).toBeNull();
    expect(d.cpaHi).toBe(Infinity);
  });

  it('retombe sur p50 quand les thruplays manquent', () => {
    const d = deriveMetrics({ ...base, thruplays: undefined, videoP50: 1800 });
    expect(d.holdRate).toBeCloseTo(0.09, 3);
  });

  it('une créa statique n’a ni hook rate ni hold rate', () => {
    const d = deriveMetrics({ spend: 50, impressions: 5000, linkClicks: 60, purchases: 1 });
    expect(d.hookRate).toBeNull();
    expect(d.holdRate).toBeNull();
    expect(d.ctr).toBeCloseTo(0.012, 3);
  });

  it('ne divise jamais par zéro', () => {
    const d = deriveMetrics({ spend: 0, impressions: 0, linkClicks: 0, purchases: 0 });
    expect(d.ctr).toBeNull();
    expect(d.cvr).toBeNull();
    expect(d.cpa).toBeNull();
    expect(d.roas).toBeNull();
  });
});
