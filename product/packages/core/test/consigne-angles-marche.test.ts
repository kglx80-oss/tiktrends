import { describe, it, expect } from 'vitest';
import { perfParAngle, consigneAnglesMarche, CONCLUSIFS_PLANCHER, type CreaLancee } from '../src/adsmap/perf-par-angle';

/** Fabrique n créas d'un angle, dont `gagnantes` gagnantes, le reste perdantes. */
function lot(angle: string, n: number, gagnantes: number): CreaLancee[] {
  return Array.from({ length: n }, (_, i) => ({
    angle,
    verdict: i < gagnantes ? 'winner' : 'loser',
    spend: 10, ctr: 0.02,
  }));
}

describe('consigneAnglesMarche · les angles que le marché a tranchés gagnants, pour la génération', () => {
  it('silence tant qu’aucun angle n’est conclusif · on n’oriente pas sur du bruit', () => {
    expect(consigneAnglesMarche(perfParAngle([]))).toBeNull();
    // Un angle sous le plancher de conclusifs ne parle pas.
    const sousPlancher = lot('angle faible', CONCLUSIFS_PLANCHER - 1, CONCLUSIFS_PLANCHER - 1);
    expect(consigneAnglesMarche(perfParAngle(sousPlancher))).toBeNull();
  });

  it('nomme un angle qui bat la moyenne au-dessus du plancher', () => {
    // « fort » : 8/8 gagnantes. « faible » : 1/8. Général = 9/16 ≈ 56 %.
    const creas = [...lot('angle fort', 8, 8), ...lot('angle faible', 8, 1)];
    const c = consigneAnglesMarche(perfParAngle(creas));
    expect(c).toBeTruthy();
    expect(c!).toContain('angle fort');
    // « faible » (12,5 %) est sous la moyenne · il ne doit pas être privilégié.
    expect(c!).not.toContain('angle faible');
    // C'est bien le signal MARCHÉ, pas le subjectif.
    expect(c!.toLowerCase()).toContain('marché');
  });

  it('un angle exactement à la moyenne générale a le droit d’être cité (barre = référence, pas au-dessus stricte)', () => {
    // Deux angles à 5/5 · général = 100 %, chacun est à la référence.
    const creas = [...lot('a', 5, 5), ...lot('b', 5, 5)];
    const c = consigneAnglesMarche(perfParAngle(creas));
    expect(c).toBeTruthy();
    expect(c!).toContain('a');
    expect(c!).toContain('b');
  });

  it('aucun angle au-dessus de la moyenne → null (tous à égalité sous la référence n’arrive pas, mais un seul groupe conclusif borde le cas)', () => {
    // Un seul angle : il EST la moyenne, donc il se cite lui-même · la consigne
    // existe. Le null vient de l'absence de conclusifs, couvert plus haut.
    const c = consigneAnglesMarche(perfParAngle(lot('seul', 6, 3)));
    expect(c).toBeTruthy();
    expect(c!).toContain('seul');
  });
});
