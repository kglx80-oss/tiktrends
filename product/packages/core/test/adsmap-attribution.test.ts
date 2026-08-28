import { describe, it, expect } from 'vitest';
import { attributionStats, attributionByPart, MIN_N_GROUP, type AttributedAd } from '../src/adsmap/attribution';

const avec = (verdict: string, hooks = 3): AttributedAd =>
  ({ memory: { measured: true, market: false, hooks }, verdict });
const sans = (verdict: string): AttributedAd => ({ memory: null, verdict });
const rep = (n: number, f: () => AttributedAd) => Array.from({ length: n }, f);

describe('effectif minimal', () => {
  it('refuse de comparer sous le seuil', () => {
    const r = attributionStats([...rep(3, () => avec('winner')), ...rep(3, () => sans('loser'))]);
    expect(r.liftPoints).toBeNull();
    expect(r.conclusive).toBe(false);
    expect(r.summary).toContain('Pas encore de quoi comparer');
  });

  it('dit lequel des deux groupes manque', () => {
    const r = attributionStats([...rep(10, () => avec('winner')), ...rep(2, () => sans('loser'))]);
    // Plus de témoins : bon signe pour l'outil, ennuyeux pour la mesure.
    expect(r.summary).toContain('plus assez de témoins');
  });
});

describe('comparaison des deux groupes', () => {
  it('mesure l’écart quand les deux groupes sont fournis', () => {
    const r = attributionStats([
      ...rep(10, () => avec('winner')), ...rep(10, () => sans('loser')),
    ]);
    expect(r.withMemory.rate).toBe(1);
    expect(r.without.rate).toBe(0);
    expect(r.liftPoints).toBeCloseTo(1, 6);
  });

  it('ne conclut pas quand les intervalles se chevauchent', () => {
    // 6 contre 5 sur 10 · l'écart existe et ne prouve rien.
    const r = attributionStats([
      ...rep(6, () => avec('winner')), ...rep(4, () => avec('loser')),
      ...rep(5, () => sans('winner')), ...rep(5, () => sans('loser')),
    ]);
    expect(r.conclusive).toBe(false);
    expect(r.summary).toContain('ne prouve rien');
  });

  it('conclut quand les intervalles sont disjoints', () => {
    const r = attributionStats([...rep(12, () => avec('winner')), ...rep(12, () => sans('loser'))]);
    expect(r.conclusive).toBe(true);
    expect(r.summary).toContain('fait gagner');
  });

  it('alerte franchement quand la mémoire fait PERDRE', () => {
    // Le cas qu'on n'a pas envie de voir est celui qu'il faut le plus voir.
    const r = attributionStats([...rep(12, () => avec('loser')), ...rep(12, () => sans('winner'))]);
    expect(r.conclusive).toBe(true);
    expect(r.summary).toContain('fait PERDRE');
  });
});

describe('ce qui entre dans les groupes', () => {
  it('exclut les tests non concluants des deux côtés', () => {
    const r = attributionStats([
      ...rep(8, () => avec('winner')), ...rep(20, () => avec('inconclusive')),
      ...rep(8, () => sans('loser')), ...rep(20, () => sans('insufficient_delivery')),
    ]);
    expect(r.withMemory.n).toBe(8);
    expect(r.without.n).toBe(8);
  });

  it('le marché seul ne compte pas comme mémoire', () => {
    // Le marché ne dit rien de ce qui marche ICI · l'inclure diluerait la mesure.
    const marcheSeul: AttributedAd = { memory: { measured: false, market: true, hooks: 0 }, verdict: 'winner' };
    const r = attributionStats([...rep(8, () => marcheSeul), ...rep(8, () => avec('winner'))]);
    expect(r.without.n).toBe(8);
  });

  it('compte les gagnantes naissantes et relatives comme des gagnantes', () => {
    const r = attributionStats([
      ...rep(6, () => avec('baby_winner')), ...rep(6, () => sans('relative_winner')),
    ]);
    expect(r.withMemory.wins).toBe(6);
    expect(r.without.wins).toBe(6);
  });
});

describe('attributionByPart', () => {
  it('teste chaque composant séparément', () => {
    const parts = attributionByPart([...rep(8, () => avec('winner')), ...rep(8, () => sans('loser'))]);
    expect(parts.map((p) => p.part)).toEqual(['measured', 'hooks', 'market']);
    expect(parts.find((p) => p.part === 'measured')!.liftPoints).toBeCloseTo(1, 6);
  });

  it('ne conclut pas sur un composant jamais utilisé', () => {
    const parts = attributionByPart([...rep(8, () => avec('winner')), ...rep(8, () => sans('loser'))]);
    // `market` n'est jamais vrai dans ce jeu · aucun groupe « avec ».
    expect(parts.find((p) => p.part === 'market')!.conclusive).toBe(false);
  });
});

describe('MIN_N_GROUP', () => {
  it('est plus exigeant que le seuil par dimension · on compare DEUX taux', () => {
    expect(MIN_N_GROUP).toBeGreaterThan(3);
  });
});
