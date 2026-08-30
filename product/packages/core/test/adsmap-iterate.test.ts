import { describe, it, expect } from 'vitest';
import {
  proposeIterations, iterationPlan, frozenBy, freezeSentence,
  VARIABLE_STAGE, FIX_FOR_STAGE, MAX_PROFONDEUR,
  type IterationInput,
} from '../src/adsmap/iterate';

const base: IterationInput = {
  adId: 'a1', label: 'Ad 1', verdict: 'loser', failedStage: null,
};

describe('gel · ce qu’une étape franchie rend acquis', () => {
  it('une chute au HOOK ne prouve rien', () => {
    expect(frozenBy('hook')).toEqual([]);
    expect(freezeSentence('hook')).toBeNull();
  });

  it('une chute au CONVERT prouve tout l’amont', () => {
    const gel = frozenBy('convert');
    expect(gel).toContain('hook');
    expect(gel).toContain('body');
    expect(gel).toContain('cta');
    // Et surtout pas les variables de l'étape qui a lâché.
    expect(gel).not.toContain('offer');
    expect(gel).not.toContain('landing');
  });

  it('une chute au HOLD prouve l’accroche et rien de plus', () => {
    const gel = frozenBy('hold');
    expect(gel).toContain('hook');
    expect(gel).toContain('opening_visual');
    expect(gel).not.toContain('body');
    expect(gel).not.toContain('cta');
  });

  it('la phrase d’acquis est lisible et cumulative', () => {
    expect(freezeSentence('hold')).toContain('regardée');
    const c = freezeSentence('convert')!;
    expect(c).toContain('regardée');
    expect(c).toContain('cliquer');
    expect(c).toContain('déjà payé');
  });

  it('toute variable non structurelle gouverne une étape', () => {
    for (const stage of Object.keys(FIX_FOR_STAGE) as Array<keyof typeof FIX_FOR_STAGE>) {
      for (const v of FIX_FOR_STAGE[stage]) {
        expect(VARIABLE_STAGE[v]).toBe(stage);
      }
    }
  });
});

describe('une gagnante se décline sans toucher à ce qui a gagné', () => {
  const winner: IterationInput = { ...base, verdict: 'winner' };

  it('propose MORE', () => {
    const [p] = proposeIterations(winner);
    expect(p!.mode).toBe('more');
  });

  it('ne change jamais l’accroche ni l’angle', () => {
    const [p] = proposeIterations(winner);
    expect(p!.changedVariable).not.toBe('hook');
    expect(p!.changedVariable).not.toBe('angle');
    expect(p!.freeze).toContain('hook');
    expect(p!.freeze).toContain('angle');
    expect(p!.freeze).toContain('offer');
  });

  it('la filiation est légale · le parent est gagnant', () => {
    expect(proposeIterations(winner)[0]!.edgeLegal).toBe(true);
  });

  it('évite une variable déjà usée deux fois sur la lignée', () => {
    const p = proposeIterations({
      ...winner, lineageChanged: ['opening_visual', 'opening_visual'],
    })[0]!;
    expect(p.changedVariable).not.toBe('opening_visual');
  });

  it('un gagnant naissant se décline aussi', () => {
    expect(proposeIterations({ ...base, verdict: 'baby_winner' })[0]!.mode).toBe('more');
  });
});

describe('un échec localisé se corrige sur son étape, seul', () => {
  it('chute au CONVERT · on change l’offre, pas la créa', () => {
    const [p] = proposeIterations({ ...base, failedStage: 'convert' });
    expect(p!.mode).toBe('better');
    expect(p!.changedVariable).toBe('offer');
    expect(p!.stageTargeted).toBe('convert');
  });

  it('chute au CONVERT · l’amont est gelé et la raison le dit', () => {
    const [p] = proposeIterations({ ...base, failedStage: 'convert' });
    expect(p!.freeze).toContain('hook');
    expect(p!.rationale).toContain('déjà payé');
  });

  it('chute au CONVERT et au CLICK passent avant le reste', () => {
    const convert = proposeIterations({ ...base, failedStage: 'convert' })[0]!;
    const hook = proposeIterations({ ...base, failedStage: 'hook' })[0]!;
    expect(convert.priority).toBeLessThan(hook.priority);
  });

  it('chute au HOOK · rien n’est acquis, et on le dit', () => {
    const [p] = proposeIterations({ ...base, failedStage: 'hook' });
    expect(p!.changedVariable).toBe('hook');
    expect(p!.freeze).toEqual([]);
    expect(p!.rationale).toContain('rien à préserver');
  });

  it('propose un repli, un seul, sur la même étape', () => {
    const ps = proposeIterations({ ...base, failedStage: 'convert' });
    expect(ps).toHaveLength(2);
    expect(ps[1]!.changedVariable).toBe('landing');
    expect(ps[1]!.stageTargeted).toBe('convert');
    expect(ps[1]!.priority).toBeGreaterThan(ps[0]!.priority);
  });

  it('sur une perdante, la filiation est refusée · ce sera un nouveau concept', () => {
    const [p] = proposeIterations({ ...base, verdict: 'loser', failedStage: 'convert' });
    expect(p!.edgeLegal).toBe(false);
  });

  it('sur une gagnante avec un point faible, la filiation est légale', () => {
    const [p] = proposeIterations({ ...base, verdict: 'baby_winner', failedStage: 'click' });
    expect(p!.edgeLegal).toBe(true);
    expect(p!.mode).toBe('better');
  });
});

describe('un coût trop élevé désigne l’offre, jamais le montage', () => {
  it('killFlag cost sans étape en échec vise l’offre', () => {
    const [p] = proposeIterations({ ...base, killFlag: 'cost' });
    expect(p!.changedVariable).toBe('offer');
    expect(p!.priority).toBe(0);
    expect(p!.rationale).toContain('Refaire la vidéo');
  });
});

describe('une lignée s’épuise, et on le dit', () => {
  it('au-delà de la profondeur maximale, on repart', () => {
    const [p] = proposeIterations({
      ...base, failedStage: 'hook', lineageDepth: MAX_PROFONDEUR,
    });
    expect(p!.mode).toBe('new');
    expect(p!.changedVariable).toBe('angle');
  });

  it('une gagnante profonde se décline quand même', () => {
    const [p] = proposeIterations({
      ...base, verdict: 'winner', lineageDepth: MAX_PROFONDEUR + 3,
    });
    expect(p!.mode).toBe('more');
  });

  it('quand toutes les corrections d’une étape sont usées, on repart', () => {
    const [p] = proposeIterations({
      ...base, failedStage: 'convert',
      lineageChanged: ['offer', 'offer', 'landing', 'landing'],
    });
    expect(p!.mode).toBe('new');
    expect(p!.rationale).toContain('deux fois');
  });

  it('une perdante sans étape identifiée ne fait pas semblant de savoir', () => {
    const [p] = proposeIterations({ ...base, verdict: 'loser' });
    expect(p!.mode).toBe('new');
    expect(p!.rationale).toContain('sans qu\'on sache où');
  });
});

describe('le plan classe par ce que le prochain euro rapporte', () => {
  it('les chutes au CONVERT passent devant les chutes au HOOK', () => {
    const plan = iterationPlan([
      { ...base, adId: 'hook', label: 'H', failedStage: 'hook', spend: 900 },
      { ...base, adId: 'conv', label: 'C', failedStage: 'convert', spend: 50 },
    ]);
    expect(plan[0]!.adId).toBe('conv');
  });

  it('à priorité égale, la dépense engagée départage', () => {
    const plan = iterationPlan([
      { ...base, adId: 'petit', label: 'P', failedStage: 'convert', spend: 30 },
      { ...base, adId: 'gros', label: 'G', failedStage: 'convert', spend: 400 },
    ]);
    expect(plan[0]!.adId).toBe('gros');
  });

  it('un plan vide ne casse pas', () => {
    expect(iterationPlan([])).toEqual([]);
  });
});
