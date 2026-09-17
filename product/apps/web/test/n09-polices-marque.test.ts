import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N09 · une fonte d'icônes n'est jamais une police de marque · le
 * filtre s'applique à l'AFFICHAGE (polices déjà stockées) et à la SAUVEGARDE
 * (saisie manuelle), pas seulement à l'extraction du site.
 */
describe('N09 · le filtre d’icônes couvre l’affichage et la sauvegarde', () => {
  it('la charte affichée nettoie les polices stockées', () => {
    const brandDa = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/BrandDA.tsx'), 'utf8');
    expect(brandDa).toMatch(/fonts: fonts\.filter\(\(f\) => !policeTechnique\(f\)\)/);
  });

  it('l’enregistrement de la charte écarte une fonte d’icônes saisie à la main', () => {
    const detail = readFileSync(join(process.cwd(), 'app/actions/brand-detail.ts'), 'utf8');
    expect(detail).toMatch(/fonts: clean\(input\.fonts\)\.filter\(\(f\) => !policeTechnique\(f\)\)/);
  });

  it('la création de marque écarte aussi les fontes d’icônes saisies', () => {
    const brands = readFileSync(join(process.cwd(), 'app/actions/brands.ts'), 'utf8');
    const n = (brands.match(/fonts: commas\(formData\.get\('fonts'\)\)\.filter\(\(f\) => !policeTechnique\(f\)\)/g) ?? []).length;
    expect(n, 'les deux chemins de création filtrent').toBeGreaterThanOrEqual(2);
  });
});
