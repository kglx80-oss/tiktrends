import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les angles que le MARCHÉ a tranchés gagnants pilotent la génération.
 *
 * Le défaut réparé : `perfParAngle` reliait chaque angle à son verdict ADSMAP
 * (le marché a payé), mais ne vivait que dans l'analyse fondateur · il ne
 * revenait jamais là où l'on génère. Le pouce du client (`preferencesAngles`)
 * y revenait, lui · le signal objectif restait une archive.
 *
 * On vérifie le CÂBLAGE (la règle pure, elle, est éprouvée côté noyau) : la
 * lecture existe, passe par le noyau, et son résultat entre dans les motifs
 * gagnants injectés. Retirer l'injection casse ici.
 */
const ADS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('le signal marché revient dans la génération', () => {
  it('une lecture brand-scoped passe par la règle du noyau', () => {
    expect(ADS, 'la lecture du marché par angle a disparu').toMatch(/async function preferencesMarche\(/);
    expect(ADS, 'la lecture ne passe plus par le noyau').toMatch(/consigneAnglesMarche\(perfParAngle\(creas\)\)/);
  });

  it('le résultat entre dans les motifs gagnants injectés au prompt', () => {
    // La ligne d'assemblage de winningPatterns doit contenir anglesMarche.
    const ligne = ADS.split('\n').find((l) => l.includes('const winningPatterns'));
    expect(ligne, 'winningPatterns introuvable').toBeTruthy();
    expect(ligne!, 'le signal marché n’est pas injecté dans le prompt').toContain('anglesMarche');
  });

  it('le signal marché est lu en parallèle des autres préférences', () => {
    expect(ADS, 'preferencesMarche n’est pas appelé dans la génération').toMatch(/preferencesMarche\(brand\.id\)/);
  });
});
