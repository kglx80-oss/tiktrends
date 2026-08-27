import { describe, it, expect } from 'vitest';
import {
  computeVerdict, evaluateKillRules, diagnoseFailedStage, rankBatch,
  DEFAULT_VERDICT_CONFIG, type VerdictInput,
} from '../src/adsmap/verdict';
import { deriveMetrics } from '../src/adsmap/stats';

/**
 * Annexe A du cahier des charges, corrigée par l'addendum v2.1 (C1.5).
 * Cible CPA 35 € · médianes de la marque : hook 22 %, CTR 1,0 %.
 * Intervalles unilatéraux à 80 %.
 *
 * Ces cas sont la définition opérationnelle du produit : ce sont eux qui
 * remplacent les « Losing / Baby Wining / Winning Ad » en texte libre du tableur.
 */

const cfg = DEFAULT_VERDICT_CONFIG;
const med = { hookRate: 0.22, ctr: 0.01, holdRate: 0.08, cpa: 35 };

const cas = (o: Partial<VerdictInput> & { m: Parameters<typeof deriveMetrics>[0] }): VerdictInput => ({
  metrics: o.m, config: cfg, brandMedians: med,
  comparable: o.comparable ?? true,
  spendShare: o.spendShare, batchRank: o.batchRank, daysElapsed: o.daysElapsed,
});

describe('Annexe A · moteur de verdict', () => {
  it('pas assez de data → non concluant', () => {
    const r = computeVerdict(cas({ m: { spend: 40, impressions: 3000, video3sViews: 900, thruplays: 300, linkClicks: 30, purchases: 0 } }));
    expect(r.computed).toBe('inconclusive');
  });

  it('gagnant net → WINNER, sans étape défaillante', () => {
    const r = computeVerdict(cas({ m: { spend: 150, impressions: 20000, video3sViews: 6500, thruplays: 2500, linkClicks: 300, purchases: 6 } }));
    expect(r.computed).toBe('winner');
    expect(r.derived.cpa).toBeCloseTo(25, 1);
    expect(r.derived.cpaHi!).toBeCloseTo(38.4, 1);   // C1.5 · et non ≈ 43 comme en v2
    expect(r.derived.cpaLo!).toBeCloseTo(16.5, 1);
    expect(r.failedStage).toBeNull();
  });

  it('CPA dans la tolérance → gagnant naissant', () => {
    const r = computeVerdict(cas({ m: { spend: 130, impressions: 18000, video3sViews: 5000, thruplays: 1800, linkClicks: 240, purchases: 3 } }));
    expect(r.computed).toBe('baby_winner');
    expect(r.derived.cpa).toBeCloseTo(43.3, 1);
  });

  it('peu d’achats mais indicateurs avancés au vert → gagnant naissant', () => {
    const r = computeVerdict(cas({ m: { spend: 110, impressions: 15000, video3sViews: 5200, thruplays: 1900, linkClicks: 210, purchases: 1 } }));
    expect(r.computed).toBe('baby_winner');
    expect(r.derived.hookRate).toBeCloseTo(0.347, 2);
    expect(r.derived.holdRate).toBeCloseTo(0.127, 2);
  });

  it('perdant → LOSER, étape défaillante HOOK', () => {
    const r = computeVerdict(cas({ m: { spend: 160, impressions: 25000, video3sViews: 2800, thruplays: 700, linkClicks: 150, purchases: 2 } }));
    expect(r.computed).toBe('loser');
    expect(r.failedStage).toBe('hook');
    // C1.5 : K4 ne se déclenche PAS ici (cpa_lo80 = 37,4 ≤ 52,5) · c'est la
    // règle 7 qui tranche. Le distinguer compte : K4 couperait plus tôt.
    expect(r.derived.cpaLo!).toBeCloseTo(37.4, 1);
    expect(r.killFlag).not.toBe('cost');
  });

  it('kill K1 · le hook ne prend pas', () => {
    const m = { spend: 25, impressions: 3500, video3sViews: 280, thruplays: 90, linkClicks: 20, purchases: 0 };
    const r = computeVerdict(cas({ m }));
    expect(r.computed).toBe('inconclusive');
    expect(r.killFlag).toBe('hook');
    expect(r.failedStage).toBe('hook');
  });

  it('kill K3 · le trafic est bon mais rien ne convertit → CRO', () => {
    const m = { spend: 95, impressions: 12000, video3sViews: 3600, thruplays: 1300, linkClicks: 180, purchases: 0 };
    const r = computeVerdict(cas({ m }));
    expect(r.killFlag).toBe('convert');
    expect(r.failedStage).toBe('convert');
    // La créa fonctionne : on ne suggère pas de la couper.
    expect(r.computed).not.toBe('loser');
  });

  it('sous-diffusion en CBO → INSUFFICIENT_DELIVERY', () => {
    const r = computeVerdict(cas({
      m: { spend: 12, impressions: 900, video3sViews: 250, thruplays: 80, linkClicks: 9, purchases: 0 },
      comparable: false, spendShare: 0.1,
    }));
    expect(r.computed).toBe('insufficient_delivery');
    expect(r.reason).toMatch(/ABO/);
  });

  it('meilleure ad d’un lot CBO → gagnant RELATIF, jamais absolu', () => {
    const r = computeVerdict(cas({
      m: { spend: 380, impressions: 60000, video3sViews: 15000, thruplays: 6000, linkClicks: 700, purchases: 9 },
      comparable: false, spendShare: 0.9, batchRank: 1,
    }));
    expect(r.computed).toBe('relative_winner');
    expect(r.derived.cpa).toBeCloseTo(42.2, 1);
    expect(r.derived.cpaHi!).toBeCloseTo(59.1, 1);   // C1.5
  });

  it('bordure de fenêtre → non concluant, avec les jours restants', () => {
    const r = computeVerdict(cas({
      m: { spend: 105, impressions: 10000, video3sViews: 3000, thruplays: 1000, linkClicks: 120, purchases: 2 },
      daysElapsed: 5,
    }));
    // Cas « bordure » au sens propre : hook à 30,0 % et hold à 10,0 % tombent
    // PILE sur les seuils, et le CPA pile sur la limite de perdant. Aucune borne
    // n'est franchie, donc rien n'est tranché.
    expect(r.computed).toBe('inconclusive');
    expect(r.derived.hookRate).toBeCloseTo(0.30, 4);
    expect(r.derived.holdRate).toBeCloseTo(0.10, 4);
    expect(r.derived.cpa).toBeCloseTo(52.5, 1);
    expect(r.daysRemaining).toBe(2);
    expect(r.reason).toMatch(/2 jour/);
  });
});

describe('le protocole conditionne le verdict', () => {
  const gagnante = { spend: 150, impressions: 20000, video3sViews: 6500, thruplays: 2500, linkClicks: 300, purchases: 6 };

  it('la même ad ne peut pas être WINNER hors protocole', () => {
    const sous = computeVerdict(cas({ m: gagnante }));
    const hors = computeVerdict(cas({ m: gagnante, comparable: false, spendShare: 0.9, batchRank: 1 }));
    expect(sous.computed).toBe('winner');
    expect(hors.computed).toBe('relative_winner');
  });

  it('hors protocole et pas première du lot : aucun titre de gagnant', () => {
    const r = computeVerdict(cas({ m: gagnante, comparable: false, spendShare: 0.9, batchRank: 3 }));
    expect(['loser', 'inconclusive']).toContain(r.computed);
  });
});

describe('kill rules', () => {
  const cfgK = cfg;
  const kill = (m: Parameters<typeof deriveMetrics>[0]) => evaluateKillRules(deriveMetrics(m, 0.8), m, cfgK, med);

  it('K1 ne se déclenche pas avant 3 000 impressions', () => {
    expect(kill({ spend: 10, impressions: 2000, video3sViews: 100, linkClicks: 5, purchases: 0 })).not.toBe('hook');
  });

  it('K2 · dépense engagée, aucun achat, clic effondré', () => {
    expect(kill({ spend: 80, impressions: 20000, video3sViews: 5000, linkClicks: 40, purchases: 0 })).toBe('click');
  });

  it('K4 · le coût dépasse la limite même au mieux', () => {
    expect(kill({ spend: 300, impressions: 40000, video3sViews: 10000, linkClicks: 400, purchases: 1 })).toBe('cost');
  });

  it('une ad saine ne déclenche rien', () => {
    expect(kill({ spend: 150, impressions: 20000, video3sViews: 6500, linkClicks: 300, purchases: 6 })).toBeNull();
  });
});

describe('diagnostic de l’étape défaillante', () => {
  const diag = (m: Parameters<typeof deriveMetrics>[0]) => diagnoseFailedStage(deriveMetrics(m, 0.8), m, med);

  it('nomme la PREMIÈRE marche cassée, pas la pire', () => {
    // Hook ET clic sont sous la marque : c'est le hook qui rend le reste illisible.
    expect(diag({ spend: 100, impressions: 20000, video3sViews: 1000, thruplays: 300, linkClicks: 50, purchases: 0 })).toBe('hook');
  });

  it('hook bon, rétention faible → HOLD', () => {
    expect(diag({ spend: 100, impressions: 20000, video3sViews: 6000, thruplays: 400, linkClicks: 250, purchases: 5 })).toBe('hold');
  });

  it('hook et rétention bons, clic faible → CLICK', () => {
    expect(diag({ spend: 100, impressions: 20000, video3sViews: 6000, thruplays: 2000, linkClicks: 100, purchases: 3 })).toBe('click');
  });

  it('tout bon en amont mais rien n’achète → CONVERT', () => {
    expect(diag({ spend: 100, impressions: 20000, video3sViews: 6000, thruplays: 2000, linkClicks: 260, purchases: 0 })).toBe('convert');
  });

  it('une ad performante n’a pas d’étape défaillante', () => {
    expect(diag({ spend: 100, impressions: 20000, video3sViews: 6000, thruplays: 2000, linkClicks: 300, purchases: 8 })).toBeNull();
  });
});

describe('classement intra-lot', () => {
  it('le CPA le plus bas prend la première place', () => {
    const r = rankBatch([
      { adId: 'a', cpa: 40, spend: 120 },
      { adId: 'b', cpa: 25, spend: 100 },
      { adId: 'c', cpa: 60, spend: 180 },
    ]);
    expect(r.get('b')!.rank).toBe(1);
    expect(r.get('c')!.rank).toBe(3);
    expect(r.get('a')!.relToMedian).toBeCloseTo(1, 3);
  });

  it('une ad sans achat n’est pas classée première par défaut', () => {
    const r = rankBatch([
      { adId: 'sans', cpa: null, spend: 90 },
      { adId: 'avec', cpa: 30, spend: 60 },
    ]);
    expect(r.get('avec')!.rank).toBe(1);
    expect(r.get('sans')!.rank).toBe(2);
    expect(r.get('sans')!.relToMedian).toBeNull();
  });
});

describe('les motifs sont lisibles par un humain', () => {
  it('chaque verdict porte une phrase, pas un code', () => {
    const echantillons: VerdictInput[] = [
      cas({ m: { spend: 150, impressions: 20000, video3sViews: 6500, thruplays: 2500, linkClicks: 300, purchases: 6 } }),
      cas({ m: { spend: 160, impressions: 25000, video3sViews: 2800, thruplays: 700, linkClicks: 150, purchases: 2 } }),
      cas({ m: { spend: 12, impressions: 900, video3sViews: 250, linkClicks: 9, purchases: 0 }, comparable: false, spendShare: 0.1 }),
    ];
    for (const e of echantillons) {
      const r = computeVerdict(e);
      expect(r.reason.length).toBeGreaterThan(25);
      expect(r.reason).not.toMatch(/null|undefined|NaN|Infinity/);
    }
  });
});
