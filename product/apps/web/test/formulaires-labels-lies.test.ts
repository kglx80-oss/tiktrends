import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S24 · associer chaque champ à son nom, sur les formulaires marque et profil.
 * Les libellés étaient VOISINS (non liés) · on enrobe désormais le champ dans son
 * `<label>` · association structurelle, sans id.
 *
 * Composants non rendables · garde par adoption de la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('S24 · libellés liés · marque & profil', () => {
  it('BrandOverviewForm · le composant F enrobe son champ', () => {
    const s = read('components/BrandOverviewForm.tsx');
    const i = s.indexOf('function F(');
    const corps = s.slice(i, i + 400);
    expect(corps).toContain('<label style={{ display: \'block\', marginBottom: 14, flex: flex ?? \'1 1 auto\' }}>');
    expect(corps).toContain('{children}');
  });

  it('ProfileIdentity · Nom et E-mail sont enrobés, plus de <label> voisin', () => {
    const s = read('app/(app)/profile/ProfileIdentity.tsx');
    expect(s, 'un libellé Nom voisin non lié subsiste').not.toContain('<label style={lbl}>Nom complet</label>');
    expect(s).toContain('<span style={{ ...lbl, display: \'block\' }}>Nom complet</span>');
  });
});
