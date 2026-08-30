import { describe, it, expect } from 'vitest';
import {
  survivalSignal, selectForAnalysis, estimateCost, radarDigest, findingHeadline,
  MAX_PER_ADVERTISER, COST_PER_ANALYSIS_USD,
  type RadarCandidate, type RadarKnowledge, type RadarFinding,
} from '../src/adsmap/radar';
// Le seuil vient de `market-stats` · le test lit la source, pas une copie.
import { PROVEN_DAYS } from '../src/adsmap/market-stats';

const cand = (o: Partial<RadarCandidate> & { externalId: string }): RadarCandidate => ({
  advertiser: 'Acme', daysRunning: 0, hasImage: true, hasText: true, ...o,
});

const vierge: RadarKnowledge = { analyzedIds: new Set(), perAdvertiser: new Map() };

describe('le signal est la survie, pas la naissance', () => {
  it('une pub neuve ne dit rien', () => {
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 2 }))).toBeNull();
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 6, reachDelta30d: 5000 }))).toBeNull();
  });

  it('trois semaines de diffusion est un vote', () => {
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: PROVEN_DAYS }))).toBe('crossed_proven');
  });

  it('une portée qui monte après une semaine compte aussi', () => {
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 9, reachDelta30d: 12000 })))
      .toBe('reach_growing');
  });

  it('une portée qui baisse ne compte pas', () => {
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 9, reachDelta30d: -400 }))).toBeNull();
  });

  it('le volume de l’annonceur est le signal le plus faible, et il vient en dernier', () => {
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 9, liveAdsCount: 14 })))
      .toBe('advertiser_scaling');
    // La survie l'emporte quand les deux sont vrais.
    expect(survivalSignal(cand({ externalId: 'a', daysRunning: 30, liveAdsCount: 40 })))
      .toBe('crossed_proven');
  });
});

describe('on ne paie jamais deux fois, ni pour rien', () => {
  it('une créa déjà décrite est ignorée', () => {
    const s = selectForAnalysis(
      [cand({ externalId: 'vu', daysRunning: 40 })],
      { analyzedIds: new Set(['vu']), perAdvertiser: new Map() },
      10,
    );
    expect(s.picked).toHaveLength(0);
    expect(s.estimatedUsd).toBe(0);
  });

  it('une créa sans visuel ni texte n’est pas décrite · on ne paie pas pour deviner', () => {
    const s = selectForAnalysis(
      [cand({ externalId: 'vide', daysRunning: 40, hasImage: false, hasText: false })],
      vierge, 10,
    );
    expect(s.picked).toHaveLength(0);
  });

  it('un visuel seul suffit', () => {
    const s = selectForAnalysis(
      [cand({ externalId: 'img', daysRunning: 40, hasText: false })], vierge, 10,
    );
    expect(s.picked).toHaveLength(1);
  });
});

describe('le plafond est dur, et ce qu’il écarte est compté', () => {
  it('rien au-delà du plafond', () => {
    const cands = Array.from({ length: 12 }, (_, i) =>
      cand({ externalId: `x${i}`, advertiser: `Marque${i}`, daysRunning: 30 }));
    const s = selectForAnalysis(cands, vierge, 3);
    expect(s.picked).toHaveLength(3);
    expect(s.deferred).toBe(9);
  });

  it('le coût annoncé suit le plafond, pas le marché', () => {
    const cands = Array.from({ length: 50 }, (_, i) =>
      cand({ externalId: `x${i}`, advertiser: `M${i}`, daysRunning: 30 }));
    expect(selectForAnalysis(cands, vierge, 5).estimatedUsd)
      .toBeCloseTo(5 * COST_PER_ANALYSIS_USD, 2);
  });

  it('un plafond à zéro ne dépense rien', () => {
    const s = selectForAnalysis([cand({ externalId: 'a', daysRunning: 40 })], vierge, 0);
    expect(s.picked).toHaveLength(0);
    expect(s.estimatedUsd).toBe(0);
    expect(s.deferred).toBe(1);
  });

  it('le coût est arrondi vers le haut', () => {
    // Une estimation optimiste d'un coût est fausse dans le seul sens qui fasse mal.
    expect(estimateCost(1)).toBeGreaterThanOrEqual(COST_PER_ANALYSIS_USD);
    expect(estimateCost(7)).toBeGreaterThanOrEqual(7 * COST_PER_ANALYSIS_USD);
  });
});

describe('largeur avant profondeur · trois créas d’un annonceur suffisent', () => {
  it('un annonceur ne monopolise pas le budget', () => {
    const cands = Array.from({ length: 8 }, (_, i) =>
      cand({ externalId: `a${i}`, advertiser: 'Acme', daysRunning: 30 }));
    const s = selectForAnalysis(cands, vierge, 8);
    expect(s.picked).toHaveLength(MAX_PER_ADVERTISER);
    expect(s.deferred).toBe(8 - MAX_PER_ADVERTISER);
  });

  it('un annonceur déjà couvert laisse la place à un inconnu', () => {
    const s = selectForAnalysis(
      [
        cand({ externalId: 'connu', advertiser: 'Acme', daysRunning: 60 }),
        cand({ externalId: 'neuf', advertiser: 'Nouvelle', daysRunning: 25 }),
      ],
      { analyzedIds: new Set(), perAdvertiser: new Map([['Acme', MAX_PER_ADVERTISER]]) },
      5,
    );
    expect(s.picked.map((p) => p.candidate.externalId)).toEqual(['neuf']);
  });

  it('les annonceurs sans nom partagent un quota, faute de pouvoir les distinguer', () => {
    const cands = Array.from({ length: 6 }, (_, i) =>
      cand({ externalId: `n${i}`, advertiser: null, daysRunning: 30 }));
    expect(selectForAnalysis(cands, vierge, 6).picked).toHaveLength(MAX_PER_ADVERTISER);
  });
});

describe('l’ordre suit la force du signal', () => {
  it('la survie passe devant la croissance, qui passe devant le volume', () => {
    const s = selectForAnalysis([
      cand({ externalId: 'vol', advertiser: 'C', daysRunning: 8, liveAdsCount: 20 }),
      cand({ externalId: 'croi', advertiser: 'B', daysRunning: 8, reachDelta30d: 900 }),
      cand({ externalId: 'surv', advertiser: 'A', daysRunning: 25 }),
    ], vierge, 3);
    expect(s.picked.map((p) => p.candidate.externalId)).toEqual(['surv', 'croi', 'vol']);
  });

  it('à signal égal, la plus ancienne · elle a survécu plus longtemps au même test', () => {
    const s = selectForAnalysis([
      cand({ externalId: 'jeune', advertiser: 'A', daysRunning: 22 }),
      cand({ externalId: 'vieille', advertiser: 'B', daysRunning: 90 }),
    ], vierge, 2);
    expect(s.picked[0]!.candidate.externalId).toBe('vieille');
  });

  it('la raison dit le fait, pas l’étiquette', () => {
    const s = selectForAnalysis([cand({ externalId: 'a', advertiser: 'Nike', daysRunning: 44 })], vierge, 1);
    expect(s.picked[0]!.reason).toContain('Nike');
    expect(s.picked[0]!.reason).toContain('44 jours');
    expect(s.picked[0]!.reason).not.toContain('crossed_proven');
  });
});

describe('le compte rendu du matin', () => {
  const f = (o: Partial<RadarFinding>): RadarFinding => {
    const base = {
      externalId: 'a', advertiser: 'Acme', signal: 'crossed_proven' as const,
      daysRunning: 30, traits: ['ouverture visage qui parle'], unexplored: false, ...o,
    };
    return { ...base, headline: o.headline ?? findingHeadline(base) };
  };

  it('une nuit vide le dit sans meubler', () => {
    expect(radarDigest([])).toContain('Rien de neuf');
  });

  it('une nuit vide avec du report l’explique', () => {
    expect(radarDigest([], 5)).toContain('plafond');
  });

  it('une piste jamais testée passe en tête', () => {
    const d = radarDigest([f({ externalId: 'x', unexplored: false }), f({ externalId: 'y', advertiser: 'Zara', unexplored: true })]);
    expect(d).toContain('jamais testée');
    expect(d).toContain('Zara');
  });

  it('quand tout confirme, on le dit franchement', () => {
    const d = radarDigest([f({}), f({ externalId: 'b' })]);
    expect(d).toContain('confirment');
  });

  it('un titre sans description exploitable ne fait pas semblant', () => {
    const t = findingHeadline({
      externalId: 'a', advertiser: 'Acme', signal: 'crossed_proven',
      daysRunning: 30, traits: [], unexplored: true,
    });
    expect(t).toContain('sans description exploitable');
  });

  it('un titre sur voie neuve le dit', () => {
    const t = findingHeadline({
      externalId: 'a', advertiser: 'Acme', signal: 'crossed_proven',
      daysRunning: 30, traits: ['démonstration produit'], unexplored: true,
    });
    expect(t).toContain('jamais testé');
    expect(t).toContain('30 j');
  });
});
