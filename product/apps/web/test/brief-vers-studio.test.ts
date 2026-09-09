import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { consigneAngleMarche } from '@tiktrends/core';

/**
 * Du brief à la créa · l'angle dominant d'une marque arme le studio.
 *
 * On teste le RÉSULTAT · la consigne produite, une directive attribuée et
 * bornée, jamais de copy recopiée.
 */

describe('consigneAngleMarche · reprends l’angle, pas les mots', () => {
  it('porte le libellé d’angle et la marque, en directive', () => {
    const c = consigneAngleMarche({ angleLabel: 'Témoignage', marque: 'Klorea' })!;
    expect(c).toContain('Témoignage');
    expect(c).toContain('Klorea');
    expect(c).toMatch(/NOTRE version/);
    expect(c).toMatch(/sans recopier/);
  });

  it('borne à 300 caractères', () => {
    const c = consigneAngleMarche({ angleLabel: 'Réponse à l’objection', marque: 'x'.repeat(400) })!;
    expect(c.length).toBeLessThanOrEqual(300);
  });

  it('null sans angle · on n’arme pas du vide', () => {
    expect(consigneAngleMarche({ angleLabel: null, marque: 'Klorea' })).toBeNull();
    expect(consigneAngleMarche({ angleLabel: '  ', marque: 'Klorea' })).toBeNull();
  });

  it('marque absente · une formulation générique', () => {
    expect(consigneAngleMarche({ angleLabel: 'Offre / promo' })).toContain('ce concurrent');
  });
});

const MARQUES = readFileSync(join(process.cwd(), 'components/MarquesSuivies.tsx'), 'utf8');

describe('le brief arme le studio', () => {
  it('la puce ouvre le studio avec la consigne d’angle dominant', () => {
    expect(MARQUES).toMatch(/consigneAngleMarche\(/);
    expect(MARQUES).toMatch(/\/studio\/ads\?angle=/);
  });
});
