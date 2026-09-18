import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R06 · les taux se saisissent dans leur unité de lecture, sans
 * conversion mentale, et chaque champ porte un nom associé. Les seuils de
 * probabilité (tolérance « naissante », niveau de confiance) étaient saisis en
 * FRACTION (0,3 · 0,80) · on les saisit en % (30 · 80), stockés en fraction.
 * Les multiples (×) et montants (€) restent tels quels. Et le champ est enrobé
 * dans son libellé (association).
 *
 * Formulaire client à actions serveur · non rendable · adoption source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/adsmap/protocole/ProtocolForm.tsx'), 'utf8');

describe('R06 · protocole · saisie en % et champs nommés', () => {
  it('la tolérance et la confiance se saisissent en %, stockées en fraction', () => {
    expect(src, 'la tolérance n’est pas saisie en %').toContain('value={Math.round(s.verdict.babyTolerance * 100)}');
    expect(src, 'la tolérance saisie n’est pas reconvertie en fraction').toContain("setV('babyTolerance', Number(e.target.value) / 100)");
    expect(src, 'la confiance n’est pas saisie en %').toContain('value={Math.round(s.verdict.ciLevelOneSided * 100)}');
    expect(src, 'la confiance saisie n’est pas reconvertie en fraction').toContain("setV('ciLevelOneSided', Number(e.target.value) / 100)");
    // Les libellés portent l'unité.
    expect(src).toContain('Tolérance « naissante » (%)');
    expect(src).toContain('Niveau de confiance (%)');
  });

  // CDC v8 · R06 · l'écart de budget toléré affichait la fraction brute « 0.2 »,
  // sans unité, alors que ses voisins étaient déjà en %. On l'aligne.
  it('l’écart de budget toléré se saisit aussi en %, pas en fraction brute', () => {
    expect(src, 'l’écart de budget n’est pas saisi en %').toContain('value={Math.round(s.protocol.budgetVarianceTolerance * 100)}');
    expect(src, 'l’écart de budget n’est pas reconverti en fraction').toContain("setP('budgetVarianceTolerance', Number(e.target.value) / 100)");
    expect(src, 'le libellé ne porte pas l’unité').toContain('Écart de budget toléré (%)');
    expect(src, 'la fraction brute 0.2 (max={1}) subsiste').not.toMatch(/value=\{s\.protocol\.budgetVarianceTolerance\}/);
  });

  it('chaque champ est enrobé dans son libellé (nom accessible)', () => {
    const i = src.indexOf('function Champ(');
    const corps = src.slice(i, i + 700);
    expect(corps, 'le champ n’est pas enrobé dans son label').toContain('<label style={{ display: \'block\' }}>');
    expect(corps, 'le libellé n’est pas un span dans le label').toContain('<span style={{ display: \'block\'');
    expect(corps).toContain('{children}');
  });
});
