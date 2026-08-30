import { describe, it, expect } from 'vitest';
import { explainProposal, type RationaleContext } from '../src/adsmap/rationale';
import type { StatRow } from '../src/adsmap/brand-stats';
import type { HookEntry } from '../src/adsmap/hook-library';
import type { MarketRow } from '../src/adsmap/market-stats';

const stat = (o: Partial<StatRow> & { dimension: string; key: string }): StatRow => ({
  nAds: 10, nConclusive: 8, nWinners: 3, nBaby: 0, hitRate: 0.375,
  hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null, ...o,
});

const hook = (text: string, evidence: HookEntry['evidence']): HookEntry => ({
  text, evidence, occurrences: 1, hookType: null, mechanism: null,
  advertisers: 1, maxDaysRunning: null,
});

const vide: RationaleContext = { stats: [], globalRate: null };

describe('sans mémoire, on le dit plutôt que de se taire', () => {
  it('une seule ligne, honnête', () => {
    const r = explainProposal({ headline: 'Une accroche' }, vide);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.kind).toBe('none');
    expect(r.lines[0]!.text).toContain('pas de tes résultats');
  });

  it('le résumé ne prétend rien', () => {
    expect(explainProposal({}, vide).summary).toContain('Aucun chiffre');
  });
});

describe('l’accroche écartée passe en premier', () => {
  const ctx: RationaleContext = {
    stats: [], globalRate: null,
    hooks: [hook('Tu ranges ton garage ce week-end ?', 'refuted')],
  };

  it('signale ce qui a été évité', () => {
    const r = explainProposal({ headline: 'Trois minutes pour un garage net' }, ctx);
    expect(r.lines[0]!.kind).toBe('hook_avoided');
    expect(r.lines[0]!.text).toContain('avait perdu');
  });

  it('elle devance une dimension mesurée · éviter apprend plus que suivre', () => {
    const r = explainProposal(
      { headline: 'Trois minutes pour un garage net', mechanism: 'listicle' },
      { ...ctx, stats: [stat({ dimension: 'mechanism', key: 'listicle', hitRate: 0.6 })], globalRate: 0.3 },
    );
    expect(r.lines[0]!.kind).toBe('hook_avoided');
    expect(r.lines.some((l) => l.kind === 'measured')).toBe(true);
  });

  it('rien à revendiquer si l’accroche proposée EST la réfutée', () => {
    const r = explainProposal({ headline: 'Tu ranges ton garage ce week-end ?' }, ctx);
    expect(r.lines.every((l) => l.kind !== 'hook_avoided')).toBe(true);
  });

  it('plusieurs réfutées se comptent au lieu de s’énumérer', () => {
    const r = explainProposal({ headline: 'Neuve' }, {
      ...ctx, hooks: [hook('A perdu une', 'refuted'), hook('A perdu deux', 'refuted')],
    });
    expect(r.lines[0]!.text).toContain('2 accroches');
  });

  it('une accroche très longue est tronquée', () => {
    const r = explainProposal({ headline: 'Neuve' }, {
      ...ctx, hooks: [hook('x'.repeat(200), 'refuted')],
    });
    expect(r.lines[0]!.text.length).toBeLessThan(120);
  });
});

describe('une accroche gagnante reprise se dit', () => {
  it('nommément', () => {
    const r = explainProposal({ headline: 'Trois minutes pour un garage net' }, {
      stats: [], globalRate: null,
      hooks: [hook('Trois minutes pour un garage net', 'proven')],
    });
    expect(r.lines.some((l) => l.kind === 'hook_reused')).toBe(true);
  });

  it('une accroche de concurrent dit qu’on ne recopie pas', () => {
    const r = explainProposal({ headline: 'Le geste que tout le monde rate' }, {
      stats: [], globalRate: null,
      hooks: [hook('Le geste que tout le monde rate', 'market')],
    });
    expect(r.lines.some((l) => l.text.includes('jamais recopiés'))).toBe(true);
  });
});

describe('on ne cite que ce qui est au-dessus de la moyenne', () => {
  const ctx = (hitRate: number, globalRate: number): RationaleContext => ({
    stats: [stat({ dimension: 'mechanism', key: 'listicle', hitRate, nWinners: 3, nConclusive: 8 })],
    globalRate,
  });

  it('au-dessus · on le revendique, avec l’effectif', () => {
    const r = explainProposal({ mechanism: 'listicle' }, ctx(0.6, 0.3));
    const l = r.lines.find((x) => x.kind === 'measured')!;
    expect(l.text).toContain('60 %');
    expect(l.text).toContain('3 sur 8');
  });

  it('en dessous · rien à revendiquer, on se tait', () => {
    const r = explainProposal({ mechanism: 'listicle' }, ctx(0.2, 0.5));
    expect(r.lines.every((l) => l.kind !== 'measured')).toBe(true);
  });

  it('sous le seuil d’effectif, on ne cite pas de taux', () => {
    const r = explainProposal({ mechanism: 'listicle' }, {
      stats: [stat({ dimension: 'mechanism', key: 'listicle', hitRate: 0.9, nConclusive: 2 })],
      globalRate: 0.3,
    });
    expect(r.lines.every((l) => l.kind !== 'measured')).toBe(true);
  });

  it('sans moyenne de marque, aucune dimension n’est citée', () => {
    const r = explainProposal({ mechanism: 'listicle' }, {
      stats: [stat({ dimension: 'mechanism', key: 'listicle', hitRate: 0.9 })], globalRate: null,
    });
    expect(r.lines.every((l) => l.kind !== 'measured')).toBe(true);
  });
});

describe('le marché reste à sa place', () => {
  const market: MarketRow[] = [
    { dimension: 'hook_type', key: 'number', nProven: 8, nTotal: 12, advertisers: 4, shareOfProven: 0.7, shareOfAll: 0.66 },
  ];

  it('cité en dernier, et présenté comme une part d’usage', () => {
    const r = explainProposal({ hookType: 'number' }, { stats: [], globalRate: null, market });
    const l = r.lines.find((x) => x.kind === 'market')!;
    expect(l.text).toContain('pas un taux de réussite');
  });

  it('cédé dès que trois lignes mesurées existent · on ne fait pas un rapport', () => {
    const r = explainProposal(
      { mechanism: 'listicle', hookType: 'number', openingType: 'product', format: 'video_ugc' },
      {
        globalRate: 0.2, market,
        stats: [
          stat({ dimension: 'mechanism', key: 'listicle', hitRate: 0.6 }),
          stat({ dimension: 'hook_type', key: 'number', hitRate: 0.6 }),
          stat({ dimension: 'opening_type', key: 'product', hitRate: 0.6 }),
          stat({ dimension: 'format', key: 'video_ugc', hitRate: 0.6 }),
        ],
      },
    );
    expect(r.lines).toHaveLength(3);
    expect(r.lines.every((l) => l.kind === 'measured')).toBe(true);
  });
});

describe('l’explication reste courte', () => {
  it('jamais plus de trois lignes', () => {
    const r = explainProposal(
      { headline: 'Neuve', mechanism: 'listicle', hookType: 'number', openingType: 'product', format: 'video_ugc' },
      {
        globalRate: 0.1,
        hooks: [hook('A perdu', 'refuted')],
        stats: [
          stat({ dimension: 'mechanism', key: 'listicle', hitRate: 0.6 }),
          stat({ dimension: 'hook_type', key: 'number', hitRate: 0.6 }),
          stat({ dimension: 'opening_type', key: 'product', hitRate: 0.6 }),
          stat({ dimension: 'format', key: 'video_ugc', hitRate: 0.6 }),
        ],
      },
    );
    expect(r.lines.length).toBeLessThanOrEqual(3);
  });

  it('le résumé est la première ligne · la plus utile', () => {
    const r = explainProposal({ headline: 'Neuve' }, {
      stats: [], globalRate: null, hooks: [hook('A perdu', 'refuted')],
    });
    expect(r.summary).toBe(r.lines[0]!.text);
  });
});
