import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Seconde passe cibles tactiles · des contrôles secondaires mais bien visibles
 * restaient sous la cible : la croix du panneau de partage Adsmap (28 px), le
 * bouton « + » des chartes de marque (32 px). Portés à CIBLE_TACTILE_MIN (40, prouvé au noyau).
 *
 * Composants clients tirant le graphe serveur · adoption par la source, contrôle
 * par contrôle.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Cibles tactiles · seconde passe', () => {

  it('le bouton d’ajout des chartes de marque atteint la cible', () => {
    const s = read('components/BrandGuidelines.tsx');
    expect(s).toContain("CIBLE_TACTILE_MIN } from '@tiktrends/core'");
    const i = s.indexOf('const addBtn');
    expect(s.slice(i, i + 140), 'le bouton + est sous la cible').toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
  });
});
