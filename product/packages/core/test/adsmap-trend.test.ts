import { describe, it, expect } from 'vitest';
import { creativeTrend, MIN_N_WINDOW, type TrendAd } from '../src/adsmap/trend';

const JOUR = 86_400_000;
const NOW = Date.UTC(2026, 8, 1);

/** `il` jours avant maintenant. */
const ad = (il: number, verdict: string): TrendAd => ({ at: NOW - il * JOUR, verdict });
const rep = (n: number, f: () => TrendAd) => Array.from({ length: n }, f);

describe('deux fenêtres qui se touchent', () => {
  it('sépare bien les 30 derniers jours des 30 précédents', () => {
    const r = creativeTrend([
      ...rep(6, () => ad(10, 'winner')),
      ...rep(6, () => ad(45, 'loser')),
    ], NOW);
    expect(r.recent.n).toBe(6);
    expect(r.previous.n).toBe(6);
    expect(r.recent.rate).toBe(1);
    expect(r.previous.rate).toBe(0);
  });

  it('ignore ce qui est plus vieux que les deux fenêtres', () => {
    const r = creativeTrend([...rep(20, () => ad(200, 'winner'))], NOW);
    expect(r.recent.n).toBe(0);
    expect(r.previous.n).toBe(0);
  });

  it('ignore une date dans le futur', () => {
    // Une horloge de travers ne doit pas gonfler la fenêtre récente.
    const r = creativeTrend([...rep(8, () => ad(-3, 'winner'))], NOW);
    expect(r.recent.n).toBe(0);
  });
});

describe('le silence est la réponse par défaut', () => {
  it('refuse de comparer sous le seuil', () => {
    const r = creativeTrend([...rep(2, () => ad(5, 'winner')), ...rep(2, () => ad(40, 'loser'))], NOW);
    expect(r.liftPoints).toBeNull();
    expect(r.conclusive).toBe(false);
    expect(r.summary).toContain('Pas encore de quoi comparer');
  });

  it('dit qu’il n’y a pas de passé quand la période d’avant est vide', () => {
    const r = creativeTrend([...rep(9, () => ad(5, 'winner'))], NOW);
    expect(r.summary).toContain('pas encore de passé');
  });

  it('dit qu’il faut lancer quand c’est le présent qui manque', () => {
    // Générer sans tester ne fait pas avancer la mesure · on le dit.
    const r = creativeTrend([...rep(9, () => ad(40, 'winner'))], NOW);
    expect(r.summary).toContain('lancer, pas seulement générer');
  });

  it('ne conclut pas quand les intervalles se chevauchent', () => {
    const r = creativeTrend([
      ...rep(6, () => ad(5, 'winner')), ...rep(4, () => ad(5, 'loser')),
      ...rep(5, () => ad(40, 'winner')), ...rep(5, () => ad(40, 'loser')),
    ], NOW);
    expect(r.conclusive).toBe(false);
    expect(r.summary).toContain('ne prouve rien');
  });
});

describe('quand ça tranche', () => {
  it('annonce le progrès', () => {
    const r = creativeTrend([...rep(14, () => ad(5, 'winner')), ...rep(14, () => ad(40, 'loser'))], NOW);
    expect(r.conclusive).toBe(true);
    expect(r.liftPoints).toBeCloseTo(1, 6);
    expect(r.summary).toContain('Ça va mieux');
  });

  it('annonce la régression aussi franchement', () => {
    // Le cas qu'on n'a pas envie de voir est celui qu'il faut le plus voir.
    const r = creativeTrend([...rep(14, () => ad(5, 'loser')), ...rep(14, () => ad(40, 'winner'))], NOW);
    expect(r.conclusive).toBe(true);
    expect(r.summary).toContain('moins bien');
  });

  it('les non concluantes ne comptent nulle part', () => {
    const r = creativeTrend([
      ...rep(6, () => ad(5, 'winner')), ...rep(30, () => ad(5, 'inconclusive')),
      ...rep(6, () => ad(40, 'loser')), ...rep(30, () => ad(40, 'insufficient_delivery')),
    ], NOW);
    expect(r.recent.n).toBe(6);
    expect(r.previous.n).toBe(6);
  });

  it('la fenêtre est réglable et le résumé le dit', () => {
    const r = creativeTrend([...rep(6, () => ad(3, 'winner')), ...rep(6, () => ad(10, 'loser'))], NOW, 7);
    expect(r.days).toBe(7);
    expect(r.summary).toContain('7 jours');
  });

  it('MIN_N_WINDOW reste au-dessus de l’anecdote', () => {
    expect(MIN_N_WINDOW).toBeGreaterThan(3);
  });
});
