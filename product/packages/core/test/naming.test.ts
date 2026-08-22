import { describe, it, expect } from 'vitest';
import { parseNaming } from '../src/naming';

describe('naming parser (§F2)', () => {
  it('extrait les dimensions', () => {
    const dims = parseNaming('acme_ugc_problem_v3', '{client}_{format}_{angle}_{v}');
    expect(dims).toEqual({ client: 'acme', format: 'ugc', angle: 'problem', v: 'v3' });
  });
  it('retourne null si le nom ne correspond pas', () => {
    expect(parseNaming('nope', '{client}_{format}')).toBeNull();
  });
});
