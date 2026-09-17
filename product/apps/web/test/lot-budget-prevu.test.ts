import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R04 · une dépense FUTURE n'est pas une dépense engagée. Le brief de
 * lancement d'un lot (un plan à recopier dans Meta · il ne dépense rien) affichait
 * son budget total « engagés ». On dit « prévus ». La dépense RÉELLE d'un test qui
 * a tourné (Suites, `spend > 0`) garde « engagés » · c'est un vrai débit.
 *
 * Composants client · non rendables · adoption source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('R04 · budget de brief = prévu, pas engagé', () => {
  it('le brief de lancement annonce un budget PRÉVU', () => {
    const s = read('app/(app)/adsmap/lots/Lots.tsx');
    expect(s, 'le brief affiche encore le budget « engagés »').not.toContain('€ engagés au total');
    expect(s, 'le brief n’annonce pas un budget prévu').toContain('€ prévus au total');
  });

  it('la dépense RÉELLE d’un test gardé garde « engagés » (vrai débit)', () => {
    const s = read('app/(app)/adsmap/suites/Suites.tsx');
    // Non touché · « engagés » reste, mais borné à une dépense réelle (spend > 0).
    expect(s).toContain('row.spend > 0');
    expect(s).toContain('€ engagés');
  });
});
