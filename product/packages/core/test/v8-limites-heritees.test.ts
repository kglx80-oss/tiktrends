import { describe, it, expect } from 'vitest';
import { documentSynthetique } from '../src/studios/perf/synthetique';
import { CALQUES_MAX } from '../src/studios/perf/limites';
import { supprimerCalque, ajouterForme } from '../src/studios/calques/operations';

/**
 * Raccord vague 8 (L8-C) · un document HÉRITÉ déjà au-delà de la limite de
 * calques doit pouvoir DESCENDRE depuis l'éditeur ; seul ce qui le fait
 * grandir est refusé. Sans la base passée à la validation, l'éditeur
 * refusait même la suppression d'un calque.
 */
describe('limites · document hérité au-delà de la limite', () => {
  const herite = documentSynthetique(CALQUES_MAX + 5);
  const premier = Object.keys(herite.layers)[0]!;

  it('supprimer un calque reste possible', () => {
    const r = supprimerCalque(herite, premier);
    expect(r.ok, 'un document hérité au-delà de la limite ne peut plus descendre').toBe(true);
  });
  it('ajouter un calque reste refusé, avec la limite dite', () => {
    const r = ajouterForme(herite);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain(`la limite est de ${CALQUES_MAX}`);
  });
});
