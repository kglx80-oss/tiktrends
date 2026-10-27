import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Adsmap · le verdict vient d'une source UNIQUE (CDC v6 · R01, N02). L'ancienne
 * Adsmap est retirée · les écrans Spatial de Résultats lisent le libellé et le
 * verdict EFFECTIF par les règles du noyau (`pastilleVerdict`, `lireCarte`,
 * `reperesTests`), testées dans `packages/core/test/spatial-resultats-gestes.test.ts`.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const TABLE = read('spatial/vues/resultats/Tests.tsx');
const CARTE = read('spatial/vues/resultats/Carte.tsx');
const FICHE = read('app/(spatial)/sp/adsmap/tests/[id]/page.tsx');
const REGLES = read('../../packages/core/src/spatial/resultats/gestes.ts');

describe('Adsmap · le verdict vient d’une source unique', () => {
  for (const [nom, s] of [['table', TABLE], ['carte', CARTE], ['fiche', FICHE]] as const) {
    it(`${nom} · aucune carte de libellés codée en dur`, () => {
      expect(s, 'garde une carte de libellés codée en dur').not.toContain("winner: 'Gagnante'");
      expect(s, 'affiche encore la relative comme une gagnante').not.toContain("relative_winner: 'Gagnante");
    });
  }
  it('table · carte · fiche passent par les règles du noyau (verdict effectif)', () => {
    expect(TABLE).toContain('pastilleVerdict(');
    expect(CARTE).toContain('lireCarte(');
    expect(FICHE).toContain('pastilleVerdict(');
    expect(FICHE, 'la fiche active « gagnante » sans exiger la comparabilité').toContain('estGagnanteValidee(');
    expect(FICHE).toContain('verdictEffectif(');
    expect(REGLES).toContain('verdictEffectif(verdict as VerdictValue | null, !!comparable)');
  });
  it('les repères de la table passent par le taux honnête du noyau', () => {
    expect(REGLES, 'la table ne passe pas par le taux honnête du noyau').toContain('tauxReussite(');
    expect(REGLES).toContain('TAUX_NON_CALCULABLE');
  });
  it('Suites reçoit la comparabilité · une gagnante non prouvée ne « gagne » pas (N02)', () => {
    const action = read('app/actions/adsmap-iterate.ts');
    expect(action, 'le plan ne charge pas la comparabilité').toContain('comparable: schema.verdicts.comparable');
    expect(action, 'le plan ne transmet pas la comparabilité').toContain('comparable: !!r.comparable');
  });
});
