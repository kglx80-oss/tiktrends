import { describe, it, expect } from 'vitest';
import { debriefVisuels } from '../src/debrief-visuels';

describe('le débrief d’un lot de visuels COMPTE, il ne conclut pas', () => {
  it('rien de jugé · null (le silence est une réponse)', () => {
    expect(debriefVisuels([])).toBeNull();
    expect(debriefVisuels([null, null])).toBeNull();
  });

  it('ne compte que les visuels jugés · les non notés n’entrent pas', () => {
    const d = debriefVisuels(['up', null, 'down', null])!;
    expect(d.n).toBe(2);
    expect(d.retenus).toBe(1);
    expect(d.ecartes).toBe(1);
    expect(d.toutBon).toBe(false);
  });

  it('tous retenus · toutBon, et le dit', () => {
    const d = debriefVisuels(['up', 'up', null])!;
    expect(d.toutBon).toBe(true);
    expect(d.resume.toLowerCase()).toContain('retenu');
    expect(d.resume).not.toContain('écarté');
  });

  it('des écartés · ils apparaissent dans le résumé', () => {
    const d = debriefVisuels(['up', 'down', 'down'])!;
    expect(d.resume).toContain('écarté');
    expect(d.ecartes).toBe(2);
  });
});
