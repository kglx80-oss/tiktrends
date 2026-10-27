import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S24 · associer chaque champ à son nom · formulaire de support et invitation
 * de membre. Les libellés étaient voisins · on enrobe le champ dans son
 * `<label>`. Composants non rendables · garde par adoption de la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('S24 · libellés liés · support & invitation', () => {
  it('Support · Type/Titre/Message sont enrobés, plus de <label> voisin', () => {
    const s = read('app/(app)/support/page.tsx');
    expect(s, 'un libellé voisin non lié subsiste').not.toContain('<label style={lbl}>Type</label>');
    expect(s).toContain("<span style={{ ...lbl, display: 'block' }}>Message</span>");
  });

  it('Invitation · E-mail et Rôle portent leur nom accessible', () => {
    // Vague 2 · l'invitation vit dans l'écran Spatial Équipe (formulaire en ligne de la maquette).
    const s = read('spatial/vues/reglages/Equipe.tsx');
    expect(s).toContain('aria-label="Email à inviter"');
    expect(s).toContain('aria-label="Rôle"');
  });
});
