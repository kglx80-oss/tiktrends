import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BadgeNatureLot, ReserveNatureLot } from '../app/(app)/adsmap/lots/NatureLot';

/**
 * Ce que l'écran AFFICHE, pas ce que le fichier mentionne · on rend les pièces
 * de nature et on lit le HTML. Un lot importé (analysé, jamais lancé) doit
 * afficher le badge « Importé · historique » ET la phrase qui explique la
 * coexistence avec des ads « Brouillon » ; un lot suivi ne montre ni l'un ni
 * l'autre (CDC v8 · R04).
 */
const badge = (o: { status: string; launchedAt: string | null }) => renderToStaticMarkup(<BadgeNatureLot {...o} />);
const reserve = (o: { status: string; launchedAt: string | null }) => renderToStaticMarkup(<ReserveNatureLot {...o} />);

describe('l’écran des lots montre la nature d’un lot importé', () => {
  it('lot importé · badge « Importé · historique » rendu', () => {
    const h = badge({ status: 'analyzed', launchedAt: null });
    expect(h).toContain('Importé');
    expect(h).toContain('historique');
  });

  it('lot importé · la réserve explique « Brouillon » et l’origine tierce', () => {
    const h = reserve({ status: 'analyzed', launchedAt: null });
    expect(h).toContain('Brouillon');
    expect(h).toMatch(/importé|outil tiers/i);
    expect(h, 'la réserve doit dire que le verdict n’est pas comparable').toContain('comparable');
  });

  it('lot suivi (analysé APRÈS lancement) · ni badge ni réserve', () => {
    const facts = { status: 'analyzed', launchedAt: '2026-01-01T00:00:00Z' };
    expect(badge(facts)).toBe('');
    expect(reserve(facts)).toBe('');
  });

  it('lot en cours · rien à signaler', () => {
    expect(badge({ status: 'testing', launchedAt: '2026-01-01T00:00:00Z' })).toBe('');
    expect(reserve({ status: 'planned', launchedAt: null })).toBe('');
  });
});
