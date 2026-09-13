import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deux états vides d'Adsmap nommaient un geste sans le rendre cliquable · une
 * phrase grise sans issue. On exige un vrai lien de sortie.
 *
 * - Vivier de lot vide (Lots) · « pousse une créa du Studio » → /studio/ads.
 * - Radar sans concurrent suivi (Radar) · « ajoute des marques » → /veille.
 *
 * Clients à chargement par action serveur (effet) · non rendables seuls.
 * Adoption par la source, bornée à chaque bloc vide.
 */
const lire = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Adsmap · les états vides orphelins mènent quelque part', () => {
  it('vivier de lot vide → un lien vers le Studio', () => {
    const src = lire('app/(app)/adsmap/lots/Lots.tsx');
    const i = src.indexOf('Aucune ad libre.');
    expect(i, 'l’état vide du vivier a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc, 'le vivier vide ne mène nulle part').toContain('href="/studio/ads"');
  });

  it('radar sans concurrent suivi → un lien vers la veille', () => {
    const src = lire('app/(app)/adsmap/radar/Radar.tsx');
    const i = src.indexOf('Aucun concurrent suivi');
    expect(i, 'l’état vide du radar a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc, 'le radar sans concurrent ne mène nulle part').toContain('href="/veille"');
  });
});
