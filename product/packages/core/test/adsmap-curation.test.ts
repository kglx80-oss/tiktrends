import { describe, it, expect } from 'vitest';
import {
  planValidation, rejectImpact, needsRename, renameReason, PARENT_OF,
  type NodeRef,
} from '../src/adsmap/curation';

const n = (kind: NodeRef['kind'], label: string, status: NodeRef['status'] = 'proposed'): NodeRef => ({
  id: `${kind}-${label}`, kind, label, status,
});

describe('valider un nœud valide ce qui le porte', () => {
  /**
   * Un concept validé sous un angle proposé serait accroché à rien · bloquer
   * aurait été l'autre option, et c'est une impasse.
   */
  it('remonte les ancêtres encore proposés', () => {
    const p = planValidation(n('concept', 'Garage'), [n('angle', 'Désordre'), n('desire', 'Ranger'), n('persona', 'Bricoleur')]);
    expect(p.ids).toHaveLength(4);
    expect(p.notice).toContain('angle « Désordre »');
    expect(p.notice).toContain('accroché à rien');
  });

  it('s’arrête au premier ancêtre déjà validé', () => {
    const p = planValidation(n('concept', 'Garage'), [n('angle', 'Désordre'), n('desire', 'Ranger', 'validated'), n('persona', 'Bricoleur')]);
    expect(p.ids.map((x) => x.kind)).toEqual(['concept', 'angle']);
  });

  it('un nœud dont le parent est validé ne dit rien de plus', () => {
    const p = planValidation(n('concept', 'Garage'), [n('angle', 'Désordre', 'validated')]);
    expect(p.ids).toHaveLength(1);
    expect(p.notice).toBeNull();
  });

  it('un persona n’a pas de parent · rien à remonter', () => {
    const p = planValidation(n('persona', 'Bricoleur'), []);
    expect(p.ids).toEqual([{ id: 'persona-Bricoleur', kind: 'persona' }]);
    expect(p.notice).toBeNull();
  });

  it('la chaîne déclarée est celle du cahier des charges', () => {
    expect(PARENT_OF.concept).toBe('angle');
    expect(PARENT_OF.angle).toBe('desire');
    expect(PARENT_OF.desire).toBe('persona');
    expect(PARENT_OF.persona).toBeNull();
  });
});

describe('rejeter n’efface jamais un test payé', () => {
  it('un nœud isolé se rejette sans un mot', () => {
    expect(rejectImpact(n('angle', 'X'), 0, 0)).toEqual({ safe: true, warning: null });
  });

  it('des propositions en dessous · on prévient, ça reste sûr', () => {
    const r = rejectImpact(n('angle', 'X'), 4, 0);
    expect(r.safe).toBe(true);
    expect(r.warning).toContain('4 élément(s)');
  });

  /**
   * Un angle refusé dont un concept a déjà tourné effacerait un test payé · on
   * avertit et on laisse décider, on ne cascade pas.
   */
  it('des tests en dessous · ce n’est plus un geste anodin', () => {
    const r = rejectImpact(n('angle', 'X'), 6, 2);
    expect(r.safe).toBe(false);
    expect(r.warning).toContain('2 test(s)');
    expect(r.warning).toContain('resteront sur la carte');
  });
});

describe('un nom provisoire ne devient pas définitif par distraction', () => {
  it('« À qualifier » et ses variantes sont refusés', () => {
    expect(needsRename('À qualifier')).toBe(true);
    expect(needsRename('A qualifier (Studio)')).toBe(true);
    expect(needsRename('À qualifier (Radar)')).toBe(true);
  });

  it('un nom entre parenthèses aussi · c’est une note, pas un nom', () => {
    expect(needsRename('(auto)')).toBe(true);
  });

  it('un nom trop court ne désigne rien six mois plus tard', () => {
    expect(needsRename('X')).toBe(true);
    expect(needsRename('  ')).toBe(true);
  });

  it('un vrai nom passe', () => {
    expect(needsRename('Bricoleur du dimanche')).toBe(false);
    expect(needsRename('Piscine verte')).toBe(false);
  });

  it('la raison est une phrase, pas un code', () => {
    expect(renameReason('À qualifier')).toContain('provisoire');
    expect(renameReason('X')).toContain('Trop court');
    expect(renameReason('Bricoleur du dimanche')).toBeNull();
  });
});
