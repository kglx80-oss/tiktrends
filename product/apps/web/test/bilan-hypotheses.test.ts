import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bilanHypotheses, JUGEES_PLANCHER, type CreaJugee } from '@tiktrends/core';

/**
 * Fermer la boucle · relier chaque créa générée à son angle et au jugement.
 * On teste le RÉSULTAT · le regroupement, le taux, la référence, et le silence
 * sous le plancher de jugements.
 */

const up = (angle: string): CreaJugee => ({ angle, rating: 'up' });
const down = (angle: string): CreaJugee => ({ angle, rating: 'down' });

describe('bilanHypotheses · l’angle testé → la pertinence', () => {
  it('regroupe par angle et calcule le taux sur les JUGÉES', () => {
    const creas = [
      ...Array(6).fill(0).map(() => up('Témoignage')),
      ...Array(2).fill(0).map(() => down('Témoignage')),
      { angle: 'Témoignage', rating: null }, // générée, pas encore jugée
    ];
    const b = bilanHypotheses(creas);
    const l = b.lignes.find((x) => x.angle === 'Témoignage')!;
    expect(l.total).toBe(9);
    expect(l.jugees).toBe(8);
    expect(l.pertinentes).toBe(6);
    expect(l.tauxPertinence).toBeCloseTo(6 / 8, 5);
    expect(l.aConfirmer).toBe(false);
  });

  it('rend la référence · le taux général', () => {
    const b = bilanHypotheses([up('A'), up('A'), down('B')]);
    expect(b.jugeesTotal).toBe(3);
    expect(b.tauxGeneral).toBeCloseTo(2 / 3, 5);
  });

  it('« à confirmer » sous le plancher de jugements', () => {
    const b = bilanHypotheses(Array(JUGEES_PLANCHER - 1).fill(0).map(() => up('Offre / promo')));
    expect(b.lignes[0]!.aConfirmer).toBe(true);
  });

  it('ignore les créas sans angle · rien à attribuer', () => {
    const b = bilanHypotheses([{ angle: null, rating: 'up' }, { angle: '  ', rating: 'down' }]);
    expect(b.lignes).toHaveLength(0);
    expect(b.tauxGeneral).toBeNull();
  });
});

const ADS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/admin/intelligence/page.tsx'), 'utf8');

describe('la boucle est câblée · l’angle est consigné, puis lu', () => {
  it('la génération consigne l’angle sur la créa produite', () => {
    // On range l'angle à côté de la recette, dans le jsonb stocké.
    expect(ADS).toMatch(/angle: o\.angle \?\? null/);
  });
  it('l’écran fondateur lit les générations et appelle bilanHypotheses', () => {
    expect(PAGE).toMatch(/bilanHypotheses\(/);
    expect(PAGE).toMatch(/schema\.generations\.kind/);
  });
});
