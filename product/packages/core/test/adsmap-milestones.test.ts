import { describe, it, expect } from 'vitest';
import { newMilestones, learnedSince, MIN_CONCLUSIVE, type Milestone } from '../src/adsmap/milestones';
import type { StatRow } from '../src/adsmap/brand-stats';

const stat = (key: string, nConclusive: number, hitRate: number | null = 0.5): StatRow => ({
  dimension: 'hook_type', key, nAds: nConclusive + 2, nConclusive,
  nWinners: 1, nBaby: 0, hitRate,
  hookRateMedian: null, holdRateMedian: null, ctrMedian: null, cpaMedian: null,
});

describe('un jalon marque le moment où une dimension COMMENCE à compter', () => {
  it('en dessous du seuil, rien n’est daté', () => {
    expect(newMilestones([stat('ugc', MIN_CONCLUSIVE - 1)], [{ dimension: 'x', key: 'y' }])).toEqual([]);
  });

  it('au seuil, le jalon est posé', () => {
    const m = newMilestones([stat('ugc', MIN_CONCLUSIVE)], [{ dimension: 'x', key: 'y' }]);
    expect(m).toHaveLength(1);
    expect(m[0]!.key).toBe('ugc');
  });

  /**
   * Ce qu'on veut savoir c'est quand elle a commencé à compter, pas quand elle
   * a grossi · re-dater à chaque test ferait annoncer le même apprentissage
   * toutes les semaines.
   */
  it('une dimension déjà datée ne se re-date pas, même en grossissant', () => {
    const connus = [{ dimension: 'hook_type', key: 'ugc' }];
    expect(newMilestones([stat('ugc', 40)], connus)).toEqual([]);
  });

  it('deux dimensions du même nom sur des axes différents sont deux jalons', () => {
    const autre: StatRow = { ...stat('ugc', 5), dimension: 'format' };
    const m = newMilestones([stat('ugc', 5), autre], [{ dimension: 'hook_type', key: 'ugc' }]);
    expect(m).toHaveLength(1);
    expect(m[0]!.dimension).toBe('format');
  });

  it('le jalon garde l’effectif et le taux du moment · pas une promesse, un relevé', () => {
    const m = newMilestones([stat('ugc', 7, 0.42)], [{ dimension: 'x', key: 'y' }]);
    expect(m[0]!.nConclusive).toBe(7);
    expect(m[0]!.hitRate).toBe(0.42);
  });
});

describe('le premier passage est du rattrapage, et ne s’annonce jamais', () => {
  /**
   * Six mois de tests franchiraient le seuil le même jour · la première lettre
   * annoncerait un déluge d'apprentissages qui datent de l'an dernier.
   */
  it('sans aucun jalon connu, tout est marqué rattrapé', () => {
    const m = newMilestones([stat('ugc', 9), stat('listicle', 4)], []);
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.backfilled)).toBe(true);
  });

  it('dès qu’un jalon existe, les suivants sont de vrais apprentissages', () => {
    const m = newMilestones([stat('listicle', 4)], [{ dimension: 'hook_type', key: 'ugc' }]);
    expect(m[0]!.backfilled).toBe(false);
  });
});

describe('ce qui s’est appris pendant la fenêtre', () => {
  const jalon = (key: string, jours: number, backfilled = false): Milestone & { reachedAt: Date } => ({
    dimension: 'hook_type', key, nConclusive: 4, hitRate: 0.5, backfilled,
    reachedAt: new Date(Date.now() - jours * 86_400_000),
  });
  const semaine = new Date(Date.now() - 7 * 86_400_000);

  it('rend ce qui a tranché dans la fenêtre', () => {
    expect(learnedSince([jalon('ugc', 2)], semaine)).toEqual(['ugc']);
  });

  it('écarte ce qui est plus ancien que la fenêtre', () => {
    expect(learnedSince([jalon('ugc', 30)], semaine)).toEqual([]);
  });

  /**
   * Les annoncer serait présenter une lecture de base comme un apprentissage.
   */
  it('écarte le rattrapage, même récent', () => {
    expect(learnedSince([jalon('ugc', 1, true)], semaine)).toEqual([]);
  });

  it('rien à annoncer sur une semaine calme', () => {
    expect(learnedSince([jalon('ugc', 20), jalon('listicle', 40)], semaine)).toEqual([]);
  });
});
