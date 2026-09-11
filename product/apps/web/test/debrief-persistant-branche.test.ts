import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le débrief de lot survit au rechargement.
 *
 * Il vivait en état d'écran · il disparaissait au rechargement, alors que sa
 * matière (les contrôles par créa) est persistée. On vérifie le CÂBLAGE : un
 * identifiant de LOT est consigné à la génération et relu, et l'écran
 * reconstruit le débrief du dernier lot au chargement (la règle pure est
 * éprouvée côté noyau).
 */
const ADS_ACTION = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('l’identifiant de lot est consigné et relu', () => {
  it('la génération pose un lot commun à toutes les créas de l’appel', () => {
    expect(ADS_ACTION).toMatch(/const lotId = crypto\.randomUUID\(\)/);
    expect(ADS_ACTION, 'le lot n’est pas consigné dans l’input persisté').toMatch(/lot: lotId/);
  });
  it('listBrandAds relit le lot sur chaque créa', () => {
    expect(ADS_ACTION).toMatch(/lot: rec\.lot/);
  });
});

describe('l’écran reconstruit le débrief du dernier lot au chargement', () => {
  it('l’état débrief s’initialise depuis la grille chargée, pas à null', () => {
    expect(STUDIO, 'le débrief repart de zéro au chargement').toMatch(/useState<DebriefLot \| null>\(\(\) => debriefDuDernierLot\(initial\)\)/);
  });
  it('la reconstruction regroupe par lot et passe par le noyau', () => {
    expect(STUDIO).toMatch(/a\.lot === lot/);
    expect(STUDIO).toMatch(/debriefDepuisControles\(/);
  });
});
