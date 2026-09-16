import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S24 · associer chaque champ à son nom. Le wizard de marque (le formulaire le
 * plus long de l'onboarding) avait des libellés VOISINS non liés · sans
 * association, rien n'est annoncé au focus. On enrobe désormais le champ dans son
 * `<label>` · l'association est structurelle, sans id à gérer.
 *
 * Composant client à actions serveur · non rendable · garde par adoption de la
 * source · le libellé qui ENROBE l'input est le lien réel.
 */
const src = readFileSync(join(process.cwd(), 'app/../components/BrandWizard.tsx'), 'utf8');

describe('BrandWizard · chaque champ est lié à son libellé (S24)', () => {
  it('le composant Field enrobe son champ dans un <label>', () => {
    const i = src.indexOf('function Field(');
    const corps = src.slice(i, i + 400);
    expect(corps, 'Field n’enrobe pas son champ').toContain('<label style={{ display: \'block\', marginBottom: 14 }}>');
    expect(corps, 'le champ (children) doit être DANS le label').toContain('{children}');
  });

  it('les champs directs Nom/Site sont enrobés, plus des <div><label> voisins', () => {
    expect(src, 'un libellé voisin non lié subsiste').not.toContain('<label style={lbl}>Nom de la marque *</label>');
    expect(src).toContain('<span style={{ ...lbl, display: \'block\' }}>Nom de la marque *</span>');
  });
});
