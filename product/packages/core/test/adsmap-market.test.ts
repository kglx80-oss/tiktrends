import { describe, it, expect } from 'vitest';
import {
  isProven, computeMarketStats, significantRows, contrastMarketVsBrand,
  buildMarketMemory, summarizeMarket, resumeMarcheEnTete, PROVEN_DAYS, type MarketAd, type BrandRow,
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

  it('CDC v8 · N03 · chaque rangée porte son CANAL (fait), distinct de la qualification', () => {
    // « <10s » vu via une marque suivie ET au Radar · la rangée dit « multiples »
    // sur le canal · mais AUCUNE qualification n'a été établie → « à qualifier ».
    const rows = computeMarketStats([
      ad({ advertiser: 'A', lengthBucket: '<10s', provenance: 'followed' }),
      ad({ advertiser: 'B', lengthBucket: '<10s', provenance: 'radar' }),
      ad({ advertiser: 'C', lengthBucket: '10-15s', provenance: 'radar' }),
    ]);
    const court = rows.find((r) => r.dimension === 'length_bucket' && r.key === '<10s')!;
    expect(court.canaux).toEqual({ suivi: 1, radar: 1, inconnu: 0 });
    expect(court.canal, 'deux canaux → provenances multiples').toBe('multiples');
    expect(court.qualification, 'le canal ne confère pas de pertinence').toBe('a_qualifier');
    const moyen = rows.find((r) => r.dimension === 'length_bucket' && r.key === '10-15s')!;
    expect(moyen.canal, 'un seul radar → détectée par le Radar').toBe('radar');
    expect(moyen.qualification, 'Radar ⇏ inspiration adjacente').toBe('a_qualifier');
  });

  it('CDC v8 · N03 · une source sans canal connu → canal « inconnu », pertinence « à qualifier »', () => {
    const rows = computeMarketStats([ad({ advertiser: 'A', hookType: 'number', provenance: null })]);
    const r = rows.find((x) => x.dimension === 'hook_type' && x.key === 'number')!;
    expect(r.canal).toBe('inconnu');
    expect(r.qualification).toBe('a_qualifier');
  });

  it('CDC v8 · N03 · une qualification métier ÉTAYÉE, elle, est reprise', () => {
    const rows = computeMarketStats([
      ad({ advertiser: 'A', hookType: 'number', provenance: 'followed', qualification: 'concurrent_direct' }),
    ]);
    const r = rows.find((x) => x.dimension === 'hook_type' && x.key === 'number')!;
    expect(r.canal).toBe('suivi');
    expect(r.qualification, 'une qualification étayée est reprise, pas déduite').toBe('concurrent_direct');
  });

  // CDC v8 · N03 · recette réelle du 19/09 (Klorea) · deux « <10s » identiques
  // à l'œil persistaient · cause : des `length_bucket` séparés par un caractère
  // INVISIBLE (U+200B, U+200E, U+2060…) formaient deux groupes. Le regroupement
  // efface désormais ces caractères de format · une seule recommandation.
  it('CDC v8 · N03 · deux « <10s » séparés par un caractère invisible fusionnent', () => {
    const ZWSP = '​', WJ = '⁠';
    const ads = [
      ad({ advertiser: 'Klorea-1', lengthBucket: '<10s' }),
      ad({ advertiser: 'Klorea-1', lengthBucket: `<10${ZWSP}s` }),
      ad({ advertiser: 'Klorea-2', lengthBucket: `<10${WJ}s` }),
      ad({ advertiser: 'Klorea-2', lengthBucket: '<‎10s' }),
    ];
    const rows = computeMarketStats(ads);
    const durees = rows.filter((r) => r.dimension === 'length_bucket');
    expect(durees, 'les variantes invisibles ne fusionnent pas · doublon').toHaveLength(1);
    expect(durees[0]!.advertisers, 'les deux annonceurs sont conservés dans la fusion').toBe(2);

    // Et une seule recommandation en sort · plus de carte répétée.
    const brand: BrandRow[] = [];
    const contrasts = contrastMarketVsBrand(rows, brand, 0.3)
      .filter((c) => c.dimension === 'length_bucket');
    expect(contrasts, 'deux recommandations « <10s » identiques subsistent').toHaveLength(1);
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

/**
 * CDC v8 · F05 · le doublon des recommandations. Dès qu'une confrontation existe,
 * `summarizeMarket` renvoie EXACTEMENT l'énoncé de la première · l'écran affichait
 * alors la même recommandation deux fois (résumé + première carte), alors que le
 * tableau des parts ne la montrait qu'une fois. `resumeMarcheEnTete` tranche au
 * résultat · null quand le résumé n'est que le doublon de la première carte.
 */
describe('resumeMarcheEnTete · pas de recommandation affichée deux fois (F05)', () => {
  const marche = computeMarketStats([ad({ advertiser: 'A' }), ad({ advertiser: 'B' }), ad({ advertiser: 'C' })]);

  it('le résumé EST l’énoncé de la première confrontation · donc à masquer en tête', () => {
    // Une pratique majoritaire jamais testée chez nous · une confrontation existe.
    const c = contrastMarketVsBrand(marche, [], null);
    expect(c.length, 'au moins une confrontation').toBeGreaterThan(0);
    const summary = summarizeMarket(marche, c, 3);
    // La preuve du doublon · le résumé est mot pour mot la première carte.
    expect(summary).toBe(c[0]!.statement);
    // Donc on ne le ré-affiche pas en tête · la carte le porte déjà.
    expect(resumeMarcheEnTete(summary, c)).toBeNull();
  });

  it('sans confrontation, le résumé de repli reste affiché · aucune carte ne le double', () => {
    const summary = summarizeMarket([], [], 4);
    expect(resumeMarcheEnTete(summary, [])).toBe(summary);
  });

  it('un résumé DISTINCT de la première carte est conservé', () => {
    const c = contrastMarketVsBrand(marche, [], null);
    expect(resumeMarcheEnTete('Un tout autre résumé.', c)).toBe('Un tout autre résumé.');
  });
});
