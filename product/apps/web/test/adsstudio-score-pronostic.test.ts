import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S07 du cahier des charges · une hypothèse IA se dit PRÈS du chiffre. Le Score
 * Jarvis est un PRONOSTIC ; il s'affichait en chiffre nu, indistinct du verdict
 * mesuré (le résultat payé du marché). On exige que le mot « prédiction /
 * pronostic » accompagne le score, sur la vignette et dans la carte détaillée.
 *
 * Composant non rendable · garde par adoption de la source · le libellé EST ce
 * que l'utilisateur lit à côté du nombre.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
// La pastille de prédiction vit désormais dans la carte commune, où la grille
// Pubs IA la branche via CartePub · le libellé reste ce que l'utilisateur lit.
const carte = readFileSync(join(process.cwd(), 'components/CarteCreative.tsx'), 'utf8');

describe('AdsStudio · le Score Jarvis se dit comme un pronostic (S07)', () => {
  it('la pastille de l’aperçu nomme la prédiction près du nombre', () => {
    expect(carte, 'la pastille de score n’annonce pas la prédiction').toContain('Préd. {performance.prediction}');
    expect(carte, 'le survol doit rappeler que ce n’est pas une mesure').toContain('un pronostic, pas un résultat mesuré');
  });

  it('la carte détaillée étiquette le score comme un pronostic', () => {
    expect(src).toContain('SCORE JARVIS · PRONOSTIC');
  });
});
