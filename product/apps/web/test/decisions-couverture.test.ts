import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R03 · une file de décisions vide ne prouve pas « rien ne brûle ».
 * La règle est prouvée au noyau (`summarizeDecisions` avec `aDesMesures`). Ici
 * on vérifie que l'action FOURNIT bien ce signal · elle compte les mesures
 * réelles de la marque et le passe au résumé. `'use server'`, non exécutable
 * ici · adoption source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/adsmap-decisions.ts'), 'utf8');

describe('R03 · le résumé de la file connaît la couverture', () => {
  it('l’action compte les mesures arbitrées de la marque', () => {
    expect(src, 'ne compte pas les apprentissages (verdicts validés)').toContain('from(schema.learnings)');
    expect(src, 'ne restreint pas à la marque').toContain('eq(schema.learnings.brandId, g.brand.id)');
    expect(src, 'ne calcule pas le drapeau de mesure').toContain('const aDesMesures =');
  });

  it('le drapeau est transmis au résumé', () => {
    expect(src, 'le résumé n’est pas informé de la couverture')
      .toContain('summarizeDecisions(items, { aDesMesures })');
  });
});
