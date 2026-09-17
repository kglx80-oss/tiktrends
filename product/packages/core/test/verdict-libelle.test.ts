import { describe, expect, it } from 'vitest';
import {
  LIBELLE_VERDICT, GAGNANTES_ABSOLUES, EVALUABLES_ABSOLU, estGagnanteAbsolue, tauxReussite,
} from '../src/adsmap/verdict-libelle';
import type { VerdictValue } from '../src/adsmap/types';

/**
 * CDC v6 · R01 · un seul qualificatif par verdict, et la certitude ne gonfle
 * pas. La gagnante relative est prometteuse (pas gagnée), ne compte pas comme
 * succès, et un taux de réussite se calcule sur les seuls tests évaluables au
 * protocole absolu · « Non calculable » plutôt que 0 % quand rien n'est évaluable.
 */
describe('LIBELLE_VERDICT · une seule carte', () => {
  it('tout verdict a un libellé et un ton', () => {
    const tous: VerdictValue[] = ['winner', 'baby_winner', 'relative_winner', 'loser', 'inconclusive', 'insufficient_delivery'];
    for (const v of tous) {
      expect(LIBELLE_VERDICT[v]?.court, `libellé de ${v}`).toBeTruthy();
      expect(LIBELLE_VERDICT[v]?.ton, `ton de ${v}`).toBeTruthy();
    }
  });

  it('la relative est prometteuse, neutre, avec sa limite dite', () => {
    const r = LIBELLE_VERDICT.relative_winner;
    expect(r.court.toLowerCase()).toContain('prometteuse');
    expect(r.court.toLowerCase()).not.toContain('gagn');
    expect(r.ton, 'la relative ne porte pas le ton de la victoire').not.toBe('win');
    expect(r.note, 'la limite doit être explicite').toMatch(/relative|seuil/);
  });

  it('les gagnantes ABSOLUES excluent la relative', () => {
    expect(GAGNANTES_ABSOLUES.has('winner')).toBe(true);
    expect(GAGNANTES_ABSOLUES.has('baby_winner')).toBe(true);
    expect(GAGNANTES_ABSOLUES.has('relative_winner')).toBe(false);
    expect(estGagnanteAbsolue('relative_winner')).toBe(false);
    expect(estGagnanteAbsolue('winner')).toBe(true);
    expect(estGagnanteAbsolue(null)).toBe(false);
  });

  it('les ÉVALUABLES en absolu = gagnante, petite gagnante, perdante', () => {
    expect([...EVALUABLES_ABSOLU].sort()).toEqual(['baby_winner', 'loser', 'winner']);
    expect(EVALUABLES_ABSOLU.has('relative_winner')).toBe(false);
    expect(EVALUABLES_ABSOLU.has('inconclusive')).toBe(false);
  });
});

describe('tauxReussite · numérateur, dénominateur et exclusions explicites', () => {
  it('ne compte que les évaluables, la relative va aux prometteuses', () => {
    const r = tauxReussite(['winner', 'baby_winner', 'loser', 'relative_winner', 'inconclusive', null]);
    expect(r.succes).toBe(2);        // winner + baby_winner
    expect(r.evaluables).toBe(3);    // + loser
    expect(r.prometteuses).toBe(1);  // relative
    expect(r.exclus).toBe(2);        // inconclusive + null(en mesure)
    expect(r.taux).toBeCloseTo(2 / 3, 6);
  });

  it('aucun test évaluable → Non calculable (null), jamais 0 %', () => {
    const r = tauxReussite(['relative_winner', 'inconclusive', 'insufficient_delivery', null]);
    expect(r.taux, 'sans évaluable, le taux est nul (non calculable), pas 0').toBeNull();
    expect(r.evaluables).toBe(0);
    expect(r.prometteuses).toBe(1);
  });

  it('une perdante seule donne 0 %, ce qui est un vrai zéro mesuré', () => {
    const r = tauxReussite(['loser']);
    expect(r.taux).toBe(0);
    expect(r.evaluables).toBe(1);
  });

  it('liste vide → non calculable', () => {
    expect(tauxReussite([]).taux).toBeNull();
  });
});
