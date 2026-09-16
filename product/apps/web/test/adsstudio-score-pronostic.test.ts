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

describe('AdsStudio · le Score Jarvis se dit comme un pronostic (S07)', () => {
  it('la pastille de la vignette nomme la prédiction près du nombre', () => {
    expect(src, 'la pastille de score n’annonce pas la prédiction').toContain('Préd. {score}');
    expect(src, 'le survol doit rappeler que ce n’est pas une mesure').toContain('un pronostic, pas un résultat mesuré');
  });

  it('la carte détaillée étiquette le score comme un pronostic', () => {
    expect(src).toContain('SCORE JARVIS · PRONOSTIC');
  });
});
