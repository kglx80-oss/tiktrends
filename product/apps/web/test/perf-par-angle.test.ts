import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { perfParAngle, CONCLUSIFS_PLANCHER, type CreaLancee } from '@tiktrends/core';

/**
 * Le pendant OBJECTIF de #300 · la performance réelle par angle.
 * On teste le RÉSULTAT · taux de gagnants sur les CONCLUSIVES, référence, et le
 * silence sous le plancher.
 */

const win = (angle: string): CreaLancee => ({ angle, verdict: 'winner', ctr: 0.03, spend: 100 });
const lose = (angle: string): CreaLancee => ({ angle, verdict: 'loser', ctr: 0.01, spend: 50 });
const inconc = (angle: string): CreaLancee => ({ angle, verdict: 'inconclusive', spend: 10 });

describe('perfParAngle · le vote du marché par angle', () => {
  it('compte les gagnants sur les CONCLUSIVES seulement', () => {
    const creas = [
      ...Array(6).fill(0).map(() => win('Témoignage')),
      ...Array(2).fill(0).map(() => lose('Témoignage')),
      inconc('Témoignage'), // ne compte pas dans le taux
    ];
    const p = perfParAngle(creas);
    const l = p.lignes.find((x) => x.angle === 'Témoignage')!;
    expect(l.total).toBe(9);
    expect(l.conclusifs).toBe(8);
    expect(l.gagnants).toBe(6);
    expect(l.tauxGagnant).toBeCloseTo(6 / 8, 5);
    expect(l.aConfirmer).toBe(false);
  });

  it('rend la référence · taux de gagnants général sur les conclusives', () => {
    const p = perfParAngle([win('A'), win('A'), lose('B')]);
    expect(p.conclusifsTotal).toBe(3);
    expect(p.tauxGeneral).toBeCloseTo(2 / 3, 5);
  });

  it('« à confirmer » sous le plancher de conclusives', () => {
    const p = perfParAngle(Array(CONCLUSIFS_PLANCHER - 1).fill(0).map(() => win('Offre / promo')));
    expect(p.lignes[0]!.aConfirmer).toBe(true);
  });

  it('cumule la dépense et moyenne le CTR', () => {
    const p = perfParAngle([win('A'), lose('A')]);
    const l = p.lignes[0]!;
    expect(l.spend).toBe(150);
    expect(l.ctrMoyen).toBeCloseTo(0.02, 5);
  });

  it('ignore les créas sans angle', () => {
    expect(perfParAngle([{ angle: null, verdict: 'winner' }]).lignes).toHaveLength(0);
  });
});

const PAGE = readFileSync(join(process.cwd(), 'app/(app)/admin/intelligence/page.tsx'), 'utf8');

describe('l’écran relie la performance réelle à l’angle', () => {
  it('il joint les verdicts ADSMAP et appelle perfParAngle', () => {
    expect(PAGE).toMatch(/perfParAngle\(/);
    expect(PAGE).toMatch(/schema\.verdicts\.computed/);
    // Le lien passe par la génération source (ad-level) puis son angle.
    expect(PAGE).toMatch(/sourceRef.*generationId|generationId/);
  });
});
