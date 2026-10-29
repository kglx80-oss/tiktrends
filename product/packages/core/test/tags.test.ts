import { describe, it, expect } from 'vitest';
import { topCreativeTags, personaHookMatrix, type TaggedCreative } from '../src/tags';

const set: TaggedCreative[] = [
  { id: 'c1', spend: 500, metric: 4.0, tags: { persona: ['Femme 30-45'], hook_type: ['problem_callout'] } },
  { id: 'c2', spend: 400, metric: 3.6, tags: { persona: ['Femme 30-45'], hook_type: ['problem_callout'] } },
  { id: 'c3', spend: 300, metric: 2.0, tags: { persona: ['Femme 30-45'], hook_type: ['question'] } },
  { id: 'c4', spend: 200, metric: 1.2, tags: { persona: ['Homme 25-40'], hook_type: ['problem_callout'] } },
];

describe('Top Creative Tags (§2.2)', () => {
  it('classe les valeurs par métrique pondérée par le spend', () => {
    const hooks = topCreativeTags(set, 'hook_type');
    expect(hooks[0]!.value).toBe('problem_callout'); // (4*500+3.6*400+1.2*200)/1100 ≈ 3.35
    expect(hooks[0]!.weightedMetric).toBeCloseTo(3.345, 2);
  });
  it('trouve la combinaison gagnante persona × hook', () => {
    const cells = personaHookMatrix(set);
    expect(cells[0]!.persona).toBe('Femme 30-45');
    expect(cells[0]!.hook).toBe('problem_callout');
  });
});
