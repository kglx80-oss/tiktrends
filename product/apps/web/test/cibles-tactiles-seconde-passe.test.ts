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
  it('la croix du panneau de partage Adsmap atteint la cible', () => {
    // Lot A3 (V5) · le panneau de partage est passé sur la `Modal` partagée · sa
    // croix est celle de toute modale, mesurée au rendu dans
    // `cibles-tactiles-partagees.test.tsx`. On vérifie qu'il n'en porte plus une
    // à lui (une copie locale pourrait redescendre sous la cible).
    const s = read('app/(app)/adsmap/SharePanel.tsx');
    expect(s, 'le partage n’utilise plus la Modal partagée').toMatch(/<Modal\b/);
    expect(s, 'le partage porte de nouveau sa propre croix').not.toContain('aria-label="Fermer"');
  });

  it('le bouton d’ajout des chartes de marque atteint la cible', () => {
    const s = read('components/BrandGuidelines.tsx');
    expect(s).toContain("CIBLE_TACTILE_MIN } from '@tiktrends/core'");
    const i = s.indexOf('const addBtn');
    expect(s.slice(i, i + 140), 'le bouton + est sous la cible').toContain('width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN');
  });
});
