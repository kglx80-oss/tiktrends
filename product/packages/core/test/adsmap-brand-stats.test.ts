import { describe, it, expect } from 'vitest';
import {
  computeBrandStats, globalHitRate, formatStatsForPrompt, buildJarvisMemory,
  prelaunchScore, summarizePrelaunch, type StatSourceAd,
} from '../src/adsmap/brand-stats';

/**
 * Ce que ce module change : Jarvis recevait des opinions (« utilise des
 * listicles »), il reçoit maintenant des mesures (« listicle, 3 gagnantes sur
 * 8 concluantes »). Les tests vérifient surtout qu'on ne dit RIEN quand on ne
 * sait rien · c'est là que le produit perdrait sa crédibilité.
 */

const ad = (o: Partial<StatSourceAd> = {}): StatSourceAd => ({
  verdict: 'loser', comparable: true, ...o,
});

describe('agrégation des verdicts', () => {
  const ads = [
    ad({ mechanism: 'listicle', verdict: 'winner', hookRate: 0.34 }),
    ad({ mechanism: 'listicle', verdict: 'baby_winner', hookRate: 0.30 }),
    ad({ mechanism: 'listicle', verdict: 'loser', hookRate: 0.18 }),
    ad({ mechanism: 'demo', verdict: 'loser' }),
    ad({ mechanism: 'demo', verdict: 'loser' }),
    ad({ mechanism: 'demo', verdict: 'winner' }),
    ad({ mechanism: 'demo', verdict: 'inconclusive' }),
  ];

  it('calcule le taux de réussite sur les seules concluantes', () => {
    const listicle = computeBrandStats(ads).find((r) => r.key === 'listicle')!;
    expect(listicle.nConclusive).toBe(3);
    expect(listicle.nWinners).toBe(1);
    expect(listicle.nBaby).toBe(1);
    expect(listicle.hitRate).toBeCloseTo(2 / 3, 3);
  });

  it('ignore les non concluantes au dénominateur · elles n’apprennent rien', () => {
    const demo = computeBrandStats(ads).find((r) => r.key === 'demo')!;
    expect(demo.nAds).toBe(4);
    expect(demo.nConclusive).toBe(3);
    expect(demo.hitRate).toBeCloseTo(1 / 3, 3);
  });

  it('calcule les médianes de taux', () => {
    expect(computeBrandStats(ads).find((r) => r.key === 'listicle')!.hookRateMedian).toBeCloseTo(0.30, 3);
  });

  it('une ad compte dans chacun de ses éléments réutilisés', () => {
    const s = computeBrandStats([
      ad({ elementKeys: ['hook:stop-buying', 'proof:12000'], verdict: 'winner' }),
      ad({ elementKeys: ['hook:stop-buying'], verdict: 'loser' }),
    ]);
    expect(s.find((r) => r.key === 'hook:stop-buying')!.nConclusive).toBe(2);
    expect(s.find((r) => r.key === 'proof:12000')!.nConclusive).toBe(1);
  });

  it('le taux global sert de référence à tout le reste', () => {
    expect(globalHitRate(ads)).toBeCloseTo(3 / 6, 3);
    expect(globalHitRate([])).toBeNull();
    expect(globalHitRate([ad({ verdict: 'inconclusive' })])).toBeNull();
  });
});

describe('mémoire injectée dans les prompts', () => {
  const solide = Array.from({ length: 8 }, (_, i) =>
    ad({ mechanism: 'listicle', verdict: i < 3 ? 'winner' : 'loser' }));

  it('n’affiche que ce qui a assez de matière', () => {
    const maigre = [ad({ mechanism: 'story', verdict: 'winner' }), ad({ mechanism: 'story', verdict: 'loser' })];
    expect(formatStatsForPrompt(computeBrandStats(maigre))).toBe('');
  });

  it('donne le taux ET le nombre de cas · un taux seul n’est pas lisible', () => {
    const t = formatStatsForPrompt(computeBrandStats(solide));
    expect(t).toMatch(/listicle/);
    expect(t).toMatch(/38 %/);
    expect(t).toMatch(/\(3\/8\)/);
  });

  it('rend une chaîne VIDE sans historique · pas un bloc « aucune donnée »', () => {
    expect(buildJarvisMemory([])).toBe('');
    expect(buildJarvisMemory([ad({ verdict: 'inconclusive' })])).toBe('');
  });

  it('annonce le taux global et le nombre de tests', () => {
    const m = buildJarvisMemory(solide);
    expect(m).toMatch(/taux de réussite global/);
    expect(m).toMatch(/8 tests concluants/);
  });

  it('ajoute les apprentissages validés en les nommant comme tels', () => {
    const m = buildJarvisMemory(solide, { learnings: ['Le produit doit apparaître avant 3 s.'] });
    expect(m).toMatch(/APPRENTISSAGES VALIDÉS/);
    expect(m).toMatch(/avant 3 s/);
  });

  it('ne laisse fuiter ni jargon ni valeur technique', () => {
    const m = buildJarvisMemory(solide, { learnings: ['x'] });
    expect(m).not.toMatch(/null|undefined|NaN|hitRate|nConclusive/);
  });
});

describe('score de pré-lancement · agent A7', () => {
  const historique = [
    ...Array.from({ length: 8 }, (_, i) => ad({ mechanism: 'listicle', verdict: i < 6 ? 'winner' : 'loser' })),
    ...Array.from({ length: 8 }, (_, i) => ad({ mechanism: 'demo', verdict: i < 1 ? 'winner' : 'loser' })),
  ];
  const stats = computeBrandStats(historique);
  const global = globalHitRate(historique);

  it('situe favorablement un concept bâti sur ce qui marche', () => {
    const s = prelaunchScore({ mechanism: 'listicle' }, stats, global);
    expect(s.band).toBe('high');
    expect(s.pConclusiveWin).toBeGreaterThan(global!);
  });

  it('situe défavorablement un concept bâti sur ce qui ne marche pas', () => {
    const s = prelaunchScore({ mechanism: 'demo' }, stats, global);
    expect(s.band).toBe('low');
    expect(summarizePrelaunch(s)).toMatch(/retravailler/);
  });

  it('dit qu’il ne sait pas plutôt que de deviner', () => {
    const s = prelaunchScore({ mechanism: 'listicle' }, [], null);
    expect(s.thin).toBe(true);
    expect(s.band).toBe('med');
    expect(summarizePrelaunch(s)).toMatch(/pas assez d/i);
  });

  it('ignore une dimension sans assez de cas au lieu de s’en servir', () => {
    const maigre = computeBrandStats([ad({ mechanism: 'story', verdict: 'winner' })]);
    expect(prelaunchScore({ mechanism: 'story' }, maigre, 0.2).thin).toBe(true);
  });

  it('les bandes sont RELATIVES à la marque, pas absolues', () => {
    // Une marque à 20 % de réussite ne doit pas voir tous ses concepts en « faible ».
    const faible = [
      ...Array.from({ length: 10 }, (_, i) => ad({ mechanism: 'demo', verdict: i < 1 ? 'winner' : 'loser' })),
      ...Array.from({ length: 10 }, (_, i) => ad({ mechanism: 'listicle', verdict: i < 3 ? 'winner' : 'loser' })),
    ];
    const s = prelaunchScore({ mechanism: 'listicle' }, computeBrandStats(faible), globalHitRate(faible));
    expect(s.band).toBe('high');
  });

  it('chaque note porte ses justifications, en clair', () => {
    const s = prelaunchScore({ mechanism: 'listicle' }, stats, global);
    expect(s.drivers.length).toBeGreaterThan(0);
    for (const d of s.drivers) {
      expect(d).toMatch(/tests/);
      expect(d).not.toMatch(/null|undefined|NaN|hitRate/);
    }
  });

  it('un élément prouvé et réutilisé pèse plus qu’un mécanisme', () => {
    const avecElement = [
      ...historique,
      ...Array.from({ length: 6 }, (_, i) => ad({ mechanism: 'demo', elementKeys: ['hook:preuve'], verdict: i < 5 ? 'winner' : 'loser' })),
    ];
    const st = computeBrandStats(avecElement);
    const g = globalHitRate(avecElement);
    expect(prelaunchScore({ mechanism: 'demo', elementKeys: ['hook:preuve'] }, st, g).pConclusiveWin)
      .toBeGreaterThan(prelaunchScore({ mechanism: 'demo' }, st, g).pConclusiveWin);
  });
});
