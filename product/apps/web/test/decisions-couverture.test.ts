import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v6 · R03 · une file de décisions vide ne prouve pas « rien ne brûle ».
 * La règle est prouvée au noyau (`summarizeDecisions` avec `aDesMesures`). Ici
 * on vérifie que l'action FOURNIT bien ce signal · elle lit le MÊME horodatage
 * de mesure que le bouton (`adsmapSyncedAt`) pour ne jamais le contredire, et le
 * passe au résumé. `'use server'`, non exécutable ici · adoption source.
 */
const src = readFileSync(join(process.cwd(), 'app/actions/adsmap-decisions.ts'), 'utf8');

describe('R03 · le résumé de la file connaît la couverture', () => {
  it('l’action lit l’horodatage de mesure de la marque (le même que le bouton)', () => {
    expect(src, 'ne lit pas la date de mesure Adsmap').toContain('schema.brands.adsmapSyncedAt');
    expect(src, 'ne restreint pas à la marque').toContain('where(eq(schema.brands.id, g.brand.id))');
    expect(src, 'ne dérive pas le drapeau de mesure de cette date').toContain('const aDesMesures = mes?.at != null');
  });

  it('le drapeau est transmis au résumé', () => {
    expect(src, 'le résumé n’est pas informé de la couverture')
      .toContain('summarizeDecisions(items, { aDesMesures })');
  });

  it('le bouton « Mesurer » lit le MÊME horodatage · pas de contradiction possible', () => {
    // « Jamais mesurée » (le bouton) et « rien ne brûle » (l'entête) doivent se
    // lire sur le même signal · sinon ils se contredisent sur le même écran.
    const page = readFileSync(join(process.cwd(), 'app/(app)/adsmap/page.tsx'), 'utf8');
    expect(page).toContain('schema.brands.adsmapSyncedAt');
    expect(page).toMatch(/SyncButton syncedAt=/);
  });
});
