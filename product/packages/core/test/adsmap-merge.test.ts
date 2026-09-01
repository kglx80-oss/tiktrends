import { describe, it, expect } from 'vitest';
import { planMerge, isTrivialMerge, type MergePersona } from '../src/adsmap/merge';

const d = (id: string, label: string, angles = 0, tested = 0) => ({ id, label, angles, tested });
const p = (id: string, name: string, desires: ReturnType<typeof d>[] = []): MergePersona => ({ id, name, desires });

describe('une fusion se montre avant de se faire', () => {
  it('un désir absent chez la cible change simplement de parent', () => {
    const plan = planMerge(p('a', 'À qualifier', [d('d1', 'Ranger le garage')]), p('b', 'Bricoleur'));
    expect(plan.moves.map((m) => m.desireId)).toEqual(['d1']);
    expect(plan.folds).toEqual([]);
  });

  /**
   * Sans le repli, fusionner deux « À qualifier » donnerait deux désirs du même
   * nom sous un seul persona · on aurait déplacé le problème d'un cran.
   */
  it('un désir déjà présent se replie sur son homonyme', () => {
    const plan = planMerge(
      p('a', 'À qualifier', [d('d1', 'Ranger', 3)]),
      p('b', 'Bricoleur', [d('d9', 'Ranger')]),
    );
    expect(plan.moves).toEqual([]);
    expect(plan.folds).toEqual([{ fromDesireId: 'd1', intoDesireId: 'd9', label: 'Ranger', angles: 3 }]);
  });

  it('la casse et les accents ne distinguent pas deux désirs', () => {
    const plan = planMerge(
      p('a', 'X', [d('d1', 'ÉCONOMISER  du temps')]),
      p('b', 'Y', [d('d9', 'economiser du temps')]),
    );
    expect(plan.folds).toHaveLength(1);
  });

  it('déplacements et replis cohabitent', () => {
    const plan = planMerge(
      p('a', 'X', [d('d1', 'Ranger'), d('d2', 'Gagner du temps')]),
      p('b', 'Y', [d('d9', 'Ranger')]),
    );
    expect(plan.moves.map((m) => m.label)).toEqual(['Gagner du temps']);
    expect(plan.folds.map((f) => f.label)).toEqual(['Ranger']);
  });
});

describe('ce qu’on dit avant d’écrire', () => {
  it('la première note dit toujours ce qui disparaît et où ça va', () => {
    const plan = planMerge(p('a', 'À qualifier', [d('d1', 'Ranger')]), p('b', 'Bricoleur'));
    expect(plan.notes[0]).toContain('« À qualifier » sera archivé');
    expect(plan.notes[0]).toContain('« Bricoleur »');
  });

  it('le repli s’annonce, avec ce qu’il emporte', () => {
    const plan = planMerge(p('a', 'X', [d('d1', 'Ranger', 4)]), p('b', 'Y', [d('d9', 'Ranger')]));
    expect(plan.notes.join(' ')).toContain('4 angle(s)');
  });

  /**
   * Une branche détachée emporterait des tests payés · on dit explicitement
   * qu'ils suivent, sinon la fusion a l'air d'un geste risqué qu'on n'ose pas.
   */
  it('les tests sous la branche sont annoncés comme suivant', () => {
    const plan = planMerge(p('a', 'X', [d('d1', 'Ranger', 2, 7)]), p('b', 'Y'));
    expect(plan.notes.join(' ')).toContain('7 test(s)');
    expect(plan.notes.join(' ')).toContain('aucun n’est perdu');
  });

  it('sans test dessous, on n’en parle pas', () => {
    const plan = planMerge(p('a', 'X', [d('d1', 'Ranger')]), p('b', 'Y'));
    expect(plan.notes.join(' ')).not.toContain('test(s)');
  });
});

describe('ce qu’on refuse', () => {
  it('un persona ne se fusionne pas avec lui-même', () => {
    const plan = planMerge(p('a', 'X'), p('a', 'X'));
    expect(plan.ok).toBe(false);
    expect(plan.blocked).toContain('lui-même');
  });

  it('un plan refusé ne propose aucune écriture', () => {
    const plan = planMerge(p('a', 'X', [d('d1', 'Ranger')]), p('a', 'X'));
    expect(plan.moves).toEqual([]);
    expect(plan.folds).toEqual([]);
  });
});

describe('une fusion sans rien dessous se dit', () => {
  it('deux personas vides · rien à déplacer', () => {
    expect(isTrivialMerge(planMerge(p('a', 'X'), p('b', 'Y')))).toBe(true);
  });

  it('dès qu’un désir bouge, ce n’est plus trivial', () => {
    expect(isTrivialMerge(planMerge(p('a', 'X', [d('d1', 'R')]), p('b', 'Y')))).toBe(false);
  });
});
