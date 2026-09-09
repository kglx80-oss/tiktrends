import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyseSurvie, EFFECTIF_PLANCHER, PART_MINORITE } from '@tiktrends/core';

/**
 * Mesurer le seuil « éprouvé », ne pas le poser d'instinct.
 *
 * On teste le RÉSULTAT · la courbe, la recommandation avec marge, et surtout le
 * SILENCE sous l'effectif plancher (une conclusion valable, la plus fréquente).
 */

// Beaucoup de créas jeunes, un déclin PROGRESSIF, une minorité qui tient · la
// forme réelle d'un marché. Cumul depuis le haut : ≥7j 60 %, ≥14j 40 %, ≥21j
// 26 %, ≥28j 18 % · la barre des 20 % se franchit entre 21 et 28 j.
function marche(): number[] {
  const jours: number[] = [];
  for (let i = 0; i < 40; i++) jours.push(3);    // < 7 j
  for (let i = 0; i < 20; i++) jours.push(10);   // 7-13 j
  for (let i = 0; i < 14; i++) jours.push(17);   // 14-20 j
  for (let i = 0; i < 8; i++) jours.push(24);    // 21-27 j
  for (let i = 0; i < 18; i++) jours.push(35);   // ≥ 28 j · la minorité qui tient
  return jours; // total 100
}

describe('analyseSurvie · la courbe mesurée', () => {
  it('compte l’effectif au-delà de chaque seuil', () => {
    const a = analyseSurvie(marche());
    expect(a.effectifTotal).toBe(100);
    const p28 = a.paliers.find((p) => p.jour === 28)!;
    expect(p28.effectif).toBe(18);
    expect(p28.partAuDela).toBeCloseTo(0.18, 5);
    const p21 = a.paliers.find((p) => p.jour === 21)!;
    expect(p21.partAuDela).toBeCloseTo(0.26, 5); // encore au-dessus de la minorité
  });

  it('recommande le premier palier réduit à la minorité persistante', () => {
    const a = analyseSurvie(marche());
    // 21 j reste à 26 % (> 20 %) · 28 j tombe à 18 % avec 18 créas · c'est lui.
    expect(a.recommande).toBe(28);
    expect(a.paliers.find((p) => p.jour === a.recommande)!.partAuDela).toBeLessThanOrEqual(PART_MINORITE);
  });

  it('SE TAIT sous l’effectif plancher · le silence est une conclusion', () => {
    const a = analyseSurvie(Array(EFFECTIF_PLANCHER - 1).fill(30));
    expect(a.recommande).toBeNull();
    expect(a.raison).toMatch(/insuffisant|silence/i);
  });

  it('se tait aussi quand aucun palier ne laisse de minorité chiffrable', () => {
    // 60 créas toutes très anciennes · aucun seuil ne descend sous 20 %.
    const a = analyseSurvie(Array(60).fill(200));
    expect(a.recommande).toBeNull();
  });
});

const PAGE = readFileSync(join(process.cwd(), 'app/(app)/admin/intelligence/page.tsx'), 'utf8');

describe('l’écran admin montre la mesure sans toucher au seuil', () => {
  it('lit la donnée réelle et appelle analyseSurvie', () => {
    expect(PAGE).toMatch(/analyseSurvie\(/);
    expect(PAGE).toMatch(/schema\.marketCreatives\.daysRunning/);
  });
});
