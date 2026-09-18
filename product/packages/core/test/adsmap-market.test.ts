import { describe, it, expect } from 'vitest';
import {
  isProven, computeMarketStats, significantRows, contrastMarketVsBrand,
  buildMarketMemory, summarizeMarket, PROVEN_DAYS, type MarketAd, type BrandRow,
} from '../src/adsmap/market-stats';

const ad = (o: Partial<MarketAd> = {}): MarketAd => ({
  advertiser: 'A', daysRunning: 40, hookType: 'question', openingType: 'face_talking', ...o,
});

describe('ce qui compte comme « éprouvé »', () => {
  it('retient une créa qui tient dans la durée', () => {
    expect(isProven(ad({ daysRunning: PROVEN_DAYS }))).toBe(true);
    expect(isProven(ad({ daysRunning: 5 }))).toBe(false);
  });

  it('retient plus tôt une créa dont la portée progresse · le budget monte', () => {
    expect(isProven(ad({ daysRunning: 10, reachDelta30d: 5000 }))).toBe(true);
  });

  it('ne retient pas une créa toute neuve, même en progression', () => {
    // À trois jours, on regarde une pub qu'on n'a pas encore eu le temps de couper.
    expect(isProven(ad({ daysRunning: 3, reachDelta30d: 9000 }))).toBe(false);
  });
});

describe('computeMarketStats', () => {
  it('mesure la part des ANNONCEURS éprouvés qui emploient la valeur', () => {
    // Deux annonceurs distincts sur « question », un sur « number » · 2 voix / 3.
    const rows = computeMarketStats([
      ad({ advertiser: 'A', hookType: 'question' }), ad({ advertiser: 'B', hookType: 'question' }), ad({ advertiser: 'C', hookType: 'number' }),
    ]);
    const q = rows.find((r) => r.dimension === 'hook_type' && r.key === 'question')!;
    expect(q.nProven).toBe(2);
    expect(q.shareOfProven).toBeCloseTo(2 / 3, 6);
  });

  it('CDC v7 · N03 · un annonceur qui décline la même créa ne gonfle pas sa part', () => {
    // A lance 8 fois « question », B une fois « number » · la part n'est PAS 8/9 ·
    // A ne pèse qu'UNE voix. Sinon la cadence d'un seul écrase le marché.
    const rows = computeMarketStats([
      ...Array.from({ length: 8 }, () => ad({ advertiser: 'A', hookType: 'question' })),
      ad({ advertiser: 'B', hookType: 'number' }),
    ]);
    const q = rows.find((r) => r.dimension === 'hook_type' && r.key === 'question')!;
    expect(q.nProven, 'les 8 créas existent bien, comptées telles quelles').toBe(8);
    expect(q.advertisers).toBe(1);
    expect(q.shareOfProven, 'pondérée par annonceur · 1 voix contre 1, pas 8 contre 1').toBeCloseTo(0.5, 6);
  });

  it('une créa sans annonceur identifié compte pour elle-même', () => {
    // On ne peut pas prouver que deux anonymes viennent de la même source.
    const rows = computeMarketStats([
      ad({ advertiser: null, hookType: 'question' }), ad({ advertiser: null, hookType: 'question' }), ad({ advertiser: 'B', hookType: 'number' }),
    ]);
    const q = rows.find((r) => r.dimension === 'hook_type' && r.key === 'question')!;
    // 2 anonymes (2 voix) + 1 annonceur (1 voix) · question = 2/3.
    expect(q.shareOfProven).toBeCloseTo(2 / 3, 6);
  });

  it('ignore les créas non éprouvées dans le numérateur', () => {
    const rows = computeMarketStats([ad({ daysRunning: 2 }), ad({ daysRunning: 60 })]);
    expect(rows.find((r) => r.key === 'question')!.nProven).toBe(1);
  });

  it('ne rend rien quand aucune créa n’est éprouvée', () => {
    expect(computeMarketStats([ad({ daysRunning: 1 }), ad({ daysRunning: 2 })])).toEqual([]);
  });

  it('compte les annonceurs distincts', () => {
    const rows = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'A' })]);
    expect(rows.find((r) => r.key === 'question')!.advertisers).toBe(2);
  });

  it('CDC v7 · N03 · fusionne les variantes de casse/espace en UNE ligne', () => {
    // Le `format` est décrit en texte LIBRE par l'IA · « UGC », « ugc » et
    // «  UGC » sont la même proposition · une seule ligne, comptes et annonceurs
    // additionnés (pas de doublon dans « Ce que fait le marché »).
    const rows = computeMarketStats([
      ad({ advertiser: 'A', format: 'UGC' }),
      ad({ advertiser: 'B', format: 'ugc' }),
      ad({ advertiser: 'C', format: ' UGC ' }),
    ]);
    const formats = rows.filter((r) => r.dimension === 'format');
    expect(formats, 'une seule ligne pour la proposition normalisée').toHaveLength(1);
    expect(formats[0]!.nProven).toBe(3);
    expect(formats[0]!.advertisers).toBe(3);
    // Le libellé affiché est la variante la plus fréquente (« UGC »).
    expect(formats[0]!.key).toBe('UGC');
  });

  it('CDC v7 · N03 · les tranches de durée fusionnent malgré l’espacement (« <10s » = « < 10s »)', () => {
    // D'anciennes créas marché au bucket libre (« < 10s ») côtoyaient les buckets
    // canoniques (« <10s ») · `cleNormalisee` gardait l'espace interne et rendait
    // DEUX lignes « <10s ». La dimension durée ignore désormais tout blanc.
    const rows = computeMarketStats([
      ad({ advertiser: 'A', lengthBucket: '<10s' }),
      ad({ advertiser: 'B', lengthBucket: '< 10s' }),
      ad({ advertiser: 'C', lengthBucket: '<10 s' }),
    ]);
    const durees = rows.filter((r) => r.dimension === 'length_bucket');
    expect(durees, 'une seule ligne pour la tranche, pas trois').toHaveLength(1);
    expect(durees[0]!.advertisers).toBe(3);
    expect(durees[0]!.nProven).toBe(3);
  });

  it('les vraies tranches distinctes ne fusionnent pas', () => {
    const rows = computeMarketStats([
      ad({ advertiser: 'A', lengthBucket: '<10s' }),
      ad({ advertiser: 'B', lengthBucket: '10-15s' }),
      ad({ advertiser: 'C', lengthBucket: '10-15s' }),
    ]);
    const durees = rows.filter((r) => r.dimension === 'length_bucket');
    expect(durees).toHaveLength(2);
  });
});

describe('significantRows', () => {
  it('écarte ce qui repose sur un effectif trop faible', () => {
    const rows = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' })]);
    expect(significantRows(rows)).toEqual([]);
  });

  it('écarte une tendance portée par un seul annonceur', () => {
    // Trois créas du même annonceur ne font pas un marché · c'est une marque.
    const rows = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'A' }), ad({ advertiser: 'A' })]);
    expect(significantRows(rows)).toEqual([]);
  });

  it('garde ce qui tient sur assez de créas et d’annonceurs', () => {
    const rows = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'C' })]);
    expect(significantRows(rows).length).toBeGreaterThan(0);
  });
});

describe('contrastMarketVsBrand', () => {
  const marche = computeMarketStats([
    ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'C' }), ad({ advertiser: 'D' }),
  ]);

  it('signale une pratique majoritaire jamais testée chez nous', () => {
    const c = contrastMarketVsBrand(marche, [], null);
    const inex = c.find((x) => x.key === 'question')!;
    expect(inex.kind).toBe('inexploite');
    expect(inex.statement).toContain('coût d’entrée');
  });

  it('CDC v7 · N03 · porte le NOMBRE DE SOURCES (annonceurs distincts)', () => {
    // Quatre annonceurs (A, B, C, D) derrière l'observation · sa solidité.
    const c = contrastMarketVsBrand(marche, [], null).find((x) => x.key === 'question')!;
    expect(c.sources).toBe(4);
  });

  it('signale une contradiction quand nos chiffres disent l’inverse', () => {
    const brand: BrandRow[] = [{ dimension: 'hook_type', key: 'question', hitRate: 0.1, nConclusive: 8 }];
    const c = contrastMarketVsBrand(marche, brand, 0.4);
    const x = c.find((y) => y.key === 'question')!;
    expect(x.kind).toBe('contredit');
    expect(x.statement).toContain('suis tes chiffres');
  });

  it('confirme quand marché et chiffres concordent', () => {
    const brand: BrandRow[] = [{ dimension: 'hook_type', key: 'question', hitRate: 0.6, nConclusive: 8 }];
    expect(contrastMarketVsBrand(marche, brand, 0.4).find((y) => y.key === 'question')!.kind).toBe('confirme');
  });

  it('met les contradictions en tête · ce sont elles qui évitent de dépenser à côté', () => {
    const brand: BrandRow[] = [
      { dimension: 'hook_type', key: 'question', hitRate: 0.1, nConclusive: 8 },
      { dimension: 'opening_type', key: 'face_talking', hitRate: 0.9, nConclusive: 8 },
    ];
    expect(contrastMarketVsBrand(marche, brand, 0.4)[0]!.kind).toBe('contredit');
  });

  it('ne commente pas une valeur minoritaire du marché', () => {
    // Un marché éclaté sur toutes les dimensions n'a pas de « pratique »
    // majoritaire · on se tait plutôt que de commenter une valeur à 17 %.
    const melange = computeMarketStats([
      ad({ advertiser: 'A', hookType: 'question', openingType: 'face_talking' }),
      ad({ advertiser: 'B', hookType: 'number', openingType: 'product' }),
      ad({ advertiser: 'C', hookType: 'statement', openingType: 'problem_scene' }),
      ad({ advertiser: 'D', hookType: 'callout', openingType: 'text_on_screen' }),
      ad({ advertiser: 'E', hookType: 'negative', openingType: 'before_after' }),
      ad({ advertiser: 'F', hookType: 'curiosity', openingType: 'unboxing' }),
    ]);
    expect(contrastMarketVsBrand(melange, [], null)).toEqual([]);
  });
});

describe('buildMarketMemory', () => {
  const marche = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'C' })]);

  it('avertit que ce ne sont PAS des taux de réussite', () => {
    // Sans cette phrase, un modèle lit « 70 % du marché » comme « 70 % de
    // réussite », et toute la prudence du module disparaît à l'usage.
    expect(buildMarketMemory(marche)).toContain('PAS des taux de réussite');
  });

  it('reste vide sans matière · on ne fabrique pas d’autorité', () => {
    expect(buildMarketMemory([])).toBe('');
    expect(buildMarketMemory(computeMarketStats([ad({ advertiser: 'A' })]))).toBe('');
  });

  it('inclut la confrontation quand elle existe', () => {
    const c = contrastMarketVsBrand(marche, [], null);
    expect(buildMarketMemory(marche, { contrasts: c })).toContain('FACE À TES PROPRES RÉSULTATS');
  });
});

describe('summarizeMarket', () => {
  const marche = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'C' })]);

  it('dit ce qui manque quand l’échantillon est trop mince', () => {
    expect(summarizeMarket([], [], 4)).toContain('pas encore assez');
    expect(summarizeMarket([], [], 0)).toContain('Aucune créa concurrente');
  });

  it('met en avant la contradiction plutôt que la tendance', () => {
    const brand: BrandRow[] = [{ dimension: 'hook_type', key: 'question', hitRate: 0.1, nConclusive: 8 }];
    const c = contrastMarketVsBrand(marche, brand, 0.4);
    expect(summarizeMarket(marche, c, 3)).toContain('suis tes chiffres');
  });
});
