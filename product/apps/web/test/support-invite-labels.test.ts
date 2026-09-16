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

  it('Invitation · E-mail et Rôle sont enrobés', () => {
    const s = read('components/InviteMemberButton.tsx');
    expect(s, 'un libellé voisin non lié subsiste').not.toContain('<label style={lbl}>E-mail</label>');
    expect(s).toContain('<span style={lbl}>E-mail</span>');
    expect(s).toContain('<span style={lbl}>Rôle</span>');
  });
});
