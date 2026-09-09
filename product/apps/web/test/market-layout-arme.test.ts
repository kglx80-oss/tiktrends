import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le pipeline de la grammaire de layout est ARMÉ, sans migration.
 *
 * ── Ce que ça défend ─────────────────────────────────────────────────────────
 *
 * #261 a posé la taxonomie de layout, mais `market-learn` ne rangeait ces
 * dimensions que dans le RÉSUMÉ TEXTE de l'analyse · un humain les lisait, aucun
 * agrégateur ne pouvait les compter. Pour que `grammaireLayout` puisse un jour
 * mesurer « 60 % des gagnantes posent l'accroche en haut », les dimensions
 * doivent être rangées en CLÉS STRUCTURÉES dans le jsonb `analysis`.
 *
 * Ces champs vivent désormais dans la ligne PARTAGÉE (`ligneMarketCreative`,
 * `market-rows.ts`), construite à l'identique par le lot on-demand ET le radar ·
 * un seul endroit à garder, qui couvre les deux pipelines. Si cette écriture
 * disparaît, le futur agrégat sera vide en silence · ce garde l'en empêche.
 */

const SRC = readFileSync(join(process.cwd(), 'lib/market-rows.ts'), 'utf8');

describe('market-learn range la grammaire de layout en clés structurées', () => {
  it('persiste les quatre dimensions dans le jsonb analysis', () => {
    const bloc = SRC.slice(SRC.indexOf('analysis: {'), SRC.indexOf('analysisConfidence'));
    expect(bloc, 'la position d’accroche structurée n’est plus persistée').toMatch(/headlinePosition: n\.headlinePosition/);
    expect(bloc, 'la composition structurée n’est plus persistée').toMatch(/composition: n\.composition/);
    expect(bloc, 'la densité de texte structurée n’est plus persistée').toMatch(/textDensity: n\.textDensity/);
    expect(bloc, 'le fond structuré n’est plus persisté').toMatch(/background: n\.background/);
  });

  it('persiste aussi la charte · typographie et palette', () => {
    const bloc = SRC.slice(SRC.indexOf('analysis: {'), SRC.indexOf('analysisConfidence'));
    expect(bloc, 'le registre typographique n’est plus persisté').toMatch(/typoRegister: n\.typoRegister/);
    expect(bloc, 'la palette n’est plus persistée').toMatch(/palette: n\.palette/);
  });
});
