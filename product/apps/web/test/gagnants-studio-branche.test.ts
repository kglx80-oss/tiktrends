import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les valeurs gagnantes d'essai sont NOMMÉES et réappliquables dans le Studio.
 *
 * `essaiSuivant` disait « applique ce qui a gagné » sans jamais dire quoi ·
 * le gagnant vivait dans le cumul, l'écran ne le lisait pas (règle pure et
 * nommage éprouvés côté noyau). On vérifie ici le CÂBLAGE : le panneau lit
 * `suggestion.gagnants`, les habille (`libelleGagnant`) et les réapplique
 * (`appliquerGagnant` → composeur). Retirer l'affichage casse ici.
 */
const ADS = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('les gagnants mesurés reviennent dans le Studio', () => {
  it('le panneau d’hypothèse lit et affiche suggestion.gagnants', () => {
    expect(ADS, 'les gagnants ne sont plus lus').toMatch(/suggestion\.gagnants\.length > 0/);
    expect(ADS, 'la valeur gagnante n’est plus habillée').toContain('libelleGagnant(g)');
  });

  it('un gagnant se réapplique dans le composeur', () => {
    expect(ADS, 'l’application d’un gagnant a disparu').toMatch(/onClick=\{\(\) => appliquerGagnant\(g\)\}/);
    // appliquerGagnant pré-sélectionne la valeur mesurée dans le composeur.
    expect(ADS).toMatch(/if \(g\.variable === 'mise_en_page'\) setLayout\(g\.valeur\)/);
    expect(ADS).toMatch(/else if \(g\.variable === 'univers'\) setUniverse\(g\.valeur\)/);
  });
});
