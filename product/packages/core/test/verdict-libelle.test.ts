import { describe, expect, it } from 'vitest';
import {
  LIBELLE_VERDICT, GAGNANTES_ABSOLUES, EVALUABLES_ABSOLU, estGagnanteAbsolue, estGagnanteValidee, tauxReussite,
} from '../src/adsmap/verdict-libelle';
import { verdictEffectif, type VerdictValue } from '../src/adsmap/types';

/** Raccourci · un verdict évalué au protocole (comparable) pour les cas d'avant. */
const ok = (value: VerdictValue | null) => ({ value, comparable: true });

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

describe('verdictEffectif · un gagnant non comparable n’est pas prouvé (N02)', () => {
  it('un gagnant COMPARABLE reste gagnant', () => {
    expect(verdictEffectif('winner', true)).toBe('winner');
    expect(verdictEffectif('baby_winner', true)).toBe('baby_winner');
  });

  it('un gagnant NON comparable (importé/déclaré) redevient prometteuse relative', () => {
    expect(verdictEffectif('winner', false)).toBe('relative_winner');
    expect(verdictEffectif('baby_winner', false)).toBe('relative_winner');
  });

  it('une perdante ou un non-concluant ne sont pas gonflés vers le haut', () => {
    // On ne rétrograde que les VICTOIRES · une perdante déclarée reste perdante.
    expect(verdictEffectif('loser', false)).toBe('loser');
    expect(verdictEffectif('inconclusive', false)).toBe('inconclusive');
  });

  it('estGagnanteValidee exige la comparabilité, estGagnanteAbsolue non', () => {
    expect(estGagnanteValidee('winner', true)).toBe(true);
    expect(estGagnanteValidee('winner', false), 'un gagnant non comparable n’est pas validé').toBe(false);
    expect(estGagnanteAbsolue('winner')).toBe(true); // brut, ignore la comparabilité (provenance)
  });
});

describe('tauxReussite · numérateur, dénominateur et exclusions explicites', () => {
  it('ne compte que les évaluables, la relative va aux prometteuses', () => {
    const r = tauxReussite([ok('winner'), ok('baby_winner'), ok('loser'), ok('relative_winner'), ok('inconclusive'), ok(null)]);
    expect(r.succes).toBe(2);        // winner + baby_winner
    expect(r.evaluables).toBe(3);    // + loser
    expect(r.prometteuses).toBe(1);  // relative
    expect(r.exclus).toBe(2);        // inconclusive + null(en mesure)
    expect(r.taux).toBeCloseTo(2 / 3, 6);
  });

  it('un gagnant NON comparable est déclaré, pas validé · il quitte le taux (N02)', () => {
    // Le cas Mistakes v4 · deux « gagnants » importés sans protocole, 0 comparable ·
    // le taux devient « Non calculable », jamais un 6 % trompeur.
    const r = tauxReussite([
      { value: 'winner', comparable: false },
      { value: 'winner', comparable: false },
      { value: 'inconclusive', comparable: false },
    ]);
    expect(r.taux, 'sans mesure admissible, aucun taux validé').toBeNull();
    expect(r.succes).toBe(0);
    expect(r.evaluables).toBe(0);
    expect(r.prometteuses).toBe(2); // les deux gagnants déclarés → prometteuses
  });

  it('aucun test évaluable → Non calculable (null), jamais 0 %', () => {
    const r = tauxReussite([ok('relative_winner'), ok('inconclusive'), ok('insufficient_delivery'), ok(null)]);
    expect(r.taux, 'sans évaluable, le taux est nul (non calculable), pas 0').toBeNull();
    expect(r.evaluables).toBe(0);
    expect(r.prometteuses).toBe(1);
  });

  it('une perdante COMPARABLE donne 0 %, ce qui est un vrai zéro mesuré', () => {
    const r = tauxReussite([ok('loser')]);
    expect(r.taux).toBe(0);
    expect(r.evaluables).toBe(1);
  });

  it('une perdante NON comparable n’est pas un zéro mesuré · elle quitte le taux', () => {
    const r = tauxReussite([{ value: 'loser', comparable: false }]);
    expect(r.taux, 'une perdante déclarée sans protocole ne fait pas un 0 % mesuré').toBeNull();
    expect(r.evaluables).toBe(0);
    expect(r.exclus).toBe(1);
  });

  it('liste vide → non calculable', () => {
    expect(tauxReussite([]).taux).toBeNull();
  });
});
