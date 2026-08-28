import { describe, it, expect } from 'vitest';
import { findGaps, iterationParentSet, countGraph, summarizeGaps, type GraphNodeShape } from '../src/adsmap/graph';

const n = (id: string, kind: GraphNodeShape['kind'], childCount = 0, verdict?: string): GraphNodeShape =>
  ({ id, kind, parentId: null, childCount, verdict: verdict ?? null });

describe('findGaps', () => {
  it('repère un désir sans angle', () => {
    const g = findGaps([n('d1', 'desire', 0), n('d2', 'desire', 2)]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ nodeId: 'd1', kind: 'desire_no_angle' });
  });

  it('repère un angle sans concept et un concept sans ad', () => {
    const g = findGaps([n('a1', 'angle', 0), n('c1', 'concept', 0)]);
    expect(g.map((x) => x.kind)).toEqual(['angle_no_concept', 'concept_no_ad']);
  });

  it('repère une gagnante jamais itérée', () => {
    const g = findGaps([n('ad1', 'ad', 0, 'winner')]);
    expect(g[0]).toMatchObject({ kind: 'winner_no_iteration' });
  });

  it('ne signale pas une gagnante déjà itérée', () => {
    expect(findGaps([n('ad1', 'ad', 0, 'winner')], new Set(['ad1']))).toHaveLength(0);
  });

  it('traite la gagnante naissante et la gagnante relative comme des gagnantes', () => {
    const g = findGaps([n('a', 'ad', 0, 'baby_winner'), n('b', 'ad', 0, 'relative_winner')]);
    expect(g).toHaveLength(2);
  });

  it('ne signale pas une perdante non itérée · c’est le comportement voulu', () => {
    // On n'itère pas sur un échec · l'absence d'itération n'est pas un manque ici.
    expect(findGaps([n('ad1', 'ad', 0, 'loser'), n('ad2', 'ad', 0, 'inconclusive')])).toHaveLength(0);
  });

  it('ne signale pas une ad sans verdict', () => {
    expect(findGaps([n('ad1', 'ad', 0)])).toHaveLength(0);
  });

  it('ne signale jamais un persona · un persona sans désir se voit assez', () => {
    expect(findGaps([n('p1', 'persona', 0)])).toHaveLength(0);
  });
});

describe('iterationParentSet', () => {
  it('ne retient que les arêtes de filiation', () => {
    const s = iterationParentSet([
      { source: 'a', kind: 'iteration' },
      { source: 'b', kind: 'tree' },
    ]);
    expect([...s]).toEqual(['a']);
  });
});

describe('countGraph', () => {
  it('compte par type et par manque', () => {
    const nodes = [n('p', 'persona', 1), n('d', 'desire', 0), n('ad', 'ad', 0, 'winner')];
    const c = countGraph(nodes, findGaps(nodes));
    expect(c).toMatchObject({ personas: 1, desires: 1, ads: 1, winners: 1 });
    expect(c.gaps.desire_no_angle).toBe(1);
    expect(c.gaps.winner_no_iteration).toBe(1);
  });
});

describe('summarizeGaps', () => {
  const base = { personas: 1, desires: 1, angles: 1, concepts: 1, ads: 1, winners: 0 };
  const gaps = (o: Partial<Record<string, number>> = {}) => ({
    desire_no_angle: 0, angle_no_concept: 0, concept_no_ad: 0, winner_no_iteration: 0, ...o,
  }) as ReturnType<typeof countGraph>['gaps'];

  it('nomme la gagnante non itérée en priorité, même si tout manque', () => {
    // L'ordre est celui du rendement · itérer coûte moins cher que tout le reste.
    const s = summarizeGaps({ ...base, gaps: gaps({ winner_no_iteration: 2, concept_no_ad: 9, desire_no_angle: 5 }) });
    expect(s).toContain('gagnante');
  });

  it('descend ensuite sur les concepts, puis les angles, puis les désirs', () => {
    expect(summarizeGaps({ ...base, gaps: gaps({ concept_no_ad: 3, angle_no_concept: 4 }) })).toContain('concept');
    expect(summarizeGaps({ ...base, gaps: gaps({ angle_no_concept: 4, desire_no_angle: 7 }) })).toContain('angle');
    expect(summarizeGaps({ ...base, gaps: gaps({ desire_no_angle: 7 }) })).toContain('désir');
  });

  it('distingue une carte vide d’une carte saine', () => {
    expect(summarizeGaps({ ...base, ads: 0, gaps: gaps() })).toContain('vide');
    expect(summarizeGaps({ ...base, gaps: gaps() })).toContain('Aucune branche morte');
  });
});
