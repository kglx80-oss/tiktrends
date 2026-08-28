import { describe, it, expect } from 'vitest';
import { prelaunchBrief, hookSimilarity, findHookMatch, SIMILAR_ENOUGH } from '../src/adsmap/prelaunch';
import { buildHookLibrary, type HookSource } from '../src/adsmap/hook-library';
import { computeMarketStats, type MarketAd } from '../src/adsmap/market-stats';
import type { StatRow, StatDimension } from '../src/adsmap/brand-stats';

const stat = (dimension: string, key: string, hitRate: number, n = 8): StatRow => ({
  dimension: dimension as StatDimension, key,
  nAds: n, nConclusive: n, nWinners: Math.round(hitRate * n), nBaby: 0, hitRate,
  hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null,
});

const lib = (sources: HookSource[]) => buildHookLibrary(sources);

describe('hookSimilarity', () => {
  it('reconnaît deux formulations proches', () => {
    const s = hookSimilarity('Tu perds tes cheveux et personne ne te le dit', 'Tu perds tes cheveux, personne ne te le dit vraiment');
    expect(s).toBeGreaterThan(SIMILAR_ENOUGH);
  });

  it('sépare deux accroches sans rapport', () => {
    expect(hookSimilarity('Tu perds tes cheveux', 'Trois recettes pour un dîner rapide')).toBeLessThan(SIMILAR_ENOUGH);
  });
});

describe('findHookMatch', () => {
  it('privilégie une accroche réfutée à proximité comparable', () => {
    // C'est l'information la plus coûteuse à ignorer.
    const l = lib([
      { text: 'Tu perds tes cheveux et personne ne le dit', origin: 'brand', verdict: 'winner' },
      { text: 'Tu perds tes cheveux et personne ne le dit', origin: 'brand', verdict: 'loser' },
    ]);
    // Une seule entrée (même empreinte) · elle garde la meilleure preuve.
    expect(l).toHaveLength(1);
    expect(findHookMatch('Tu perds tes cheveux et personne ne le dit', l)!.exact).toBe(true);
  });

  it('rend null quand rien ne s’en approche', () => {
    const l = lib([{ text: 'Une accroche complètement différente ici', origin: 'brand', verdict: 'winner' }]);
    expect(findHookMatch('Trois recettes pour un dîner rapide', l)).toBeNull();
  });

  it('rend null sur une accroche vide', () => {
    expect(findHookMatch('', lib([{ text: 'Quelque chose de suffisamment long', origin: 'brand' }]))).toBeNull();
  });
});

describe('l’accroche réfutée l’emporte sur tout', () => {
  it('bloque même avec un profil favorable', () => {
    const b = prelaunchBrief(
      { mechanism: 'listicle', candidateHook: 'Tu perds tes cheveux et personne ne te le dit' },
      {
        stats: [stat('mechanism', 'listicle', 0.9)],
        globalRate: 0.3,
        hooks: lib([{ text: 'Tu perds tes cheveux et personne ne te le dit', origin: 'brand', verdict: 'loser' }]),
      },
    );
    expect(b.recommendation).toBe('stop');
    expect(b.summary).toContain('a déjà perdu ici');
    // Le drapeau bloquant est en tête · l'ordre suit le coût de l'ignorer.
    expect(b.flags[0]!.tone).toBe('stop');
  });

  it('signale au contraire une accroche gagnante', () => {
    const b = prelaunchBrief(
      { mechanism: 'listicle', candidateHook: 'Tu perds tes cheveux et personne ne te le dit' },
      {
        stats: [stat('mechanism', 'listicle', 0.9)],
        globalRate: 0.3,
        hooks: lib([{ text: 'Tu perds tes cheveux et personne ne te le dit', origin: 'brand', verdict: 'winner' }]),
      },
    );
    expect(b.recommendation).toBe('go');
    expect(b.flags.some((f) => f.kind === 'hook_proven')).toBe(true);
  });

  it('avertit quand on reprend l’accroche d’un concurrent', () => {
    const b = prelaunchBrief(
      { mechanism: 'listicle', candidateHook: 'Tu perds tes cheveux et personne ne te le dit' },
      {
        stats: [stat('mechanism', 'listicle', 0.9)],
        globalRate: 0.3,
        hooks: lib([{ text: 'Tu perds tes cheveux et personne ne te le dit', origin: 'market', advertiser: 'X', daysRunning: 60 }]),
      },
    );
    expect(b.recommendation).toBe('rework');
    expect(b.summary).toContain('mécanique, pas les mots');
  });
});

describe('le marché ne déplace jamais la bande', () => {
  const marche = computeMarketStats(['A', 'B', 'C', 'D'].map((advertiser): MarketAd =>
    ({ advertiser, daysRunning: 40, hookType: 'question', openingType: 'face_talking' })));

  it('signale une contradiction sans transformer un bon profil en mauvais', () => {
    const b = prelaunchBrief(
      { hookType: 'question' },
      { stats: [stat('hook_type', 'question', 0.05)], globalRate: 0.4, market: marche },
    );
    expect(b.flags.some((f) => f.kind === 'market_contradicts')).toBe(true);
    // Le profil est mauvais à cause de NOS chiffres, pas du marché.
    expect(b.recommendation).toBe('rework');
  });

  it('signale une piste inexploitée sans la recommander aveuglément', () => {
    const b = prelaunchBrief(
      { hookType: 'number' },
      { stats: [stat('hook_type', 'number', 0.6)], globalRate: 0.3, market: marche },
    );
    expect(b.flags.some((f) => f.kind === 'market_unexploited')).toBe(true);
    expect(b.recommendation).toBe('go');
  });

  it('reste muet sur une pratique minoritaire du marché', () => {
    const eclate = computeMarketStats([
      { advertiser: 'A', daysRunning: 40, hookType: 'question' },
      { advertiser: 'B', daysRunning: 40, hookType: 'number' },
      { advertiser: 'C', daysRunning: 40, hookType: 'statement' },
      { advertiser: 'D', daysRunning: 40, hookType: 'callout' },
    ]);
    const b = prelaunchBrief({ hookType: 'question' }, { stats: [stat('hook_type', 'question', 0.5)], globalRate: 0.4, market: eclate });
    expect(b.flags.filter((f) => f.kind.startsWith('market_'))).toEqual([]);
  });
});

describe('ce qui manque se dit', () => {
  it('traite l’absence d’historique comme un inconnu, pas comme un mauvais profil', () => {
    // Un inconnu se teste · bloquer une marque qui démarre serait absurde.
    const b = prelaunchBrief({ mechanism: 'listicle', candidateHook: 'Une accroche envisagée quelconque' }, { stats: [], globalRate: null });
    expect(b.recommendation).toBe('unknown');
    expect(b.summary).toContain('raison de la tester');
  });

  it('réclame l’accroche quand elle manque · c’est le signal le plus fort', () => {
    const b = prelaunchBrief({ mechanism: 'listicle' }, { stats: [stat('mechanism', 'listicle', 0.5)], globalRate: 0.45 });
    expect(b.summary).toContain('Colle l’accroche');
  });

  it('le dit aussi quand il n’y a ni historique ni accroche', () => {
    const b = prelaunchBrief({ mechanism: 'listicle' }, { stats: [], globalRate: null });
    expect(b.summary).toContain('aucune accroche fournie');
  });
});

describe('recommandation', () => {
  it('demande de retravailler un profil sous la moyenne', () => {
    const b = prelaunchBrief(
      { mechanism: 'listicle' },
      { stats: [stat('mechanism', 'listicle', 0.05), stat('format', 'static', 0.05)], globalRate: 0.5 },
    );
    expect(b.recommendation).toBe('rework');
  });

  it('laisse passer un profil favorable sans réserve', () => {
    const b = prelaunchBrief(
      { mechanism: 'listicle', format: 'video_ugc' },
      { stats: [stat('mechanism', 'listicle', 0.9), stat('format', 'video_ugc', 0.9)], globalRate: 0.3 },
    );
    expect(b.recommendation).toBe('go');
    expect(b.summary).toContain('favorable');
  });
});
