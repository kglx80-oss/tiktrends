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
  // Support · vague 4 · servi par Spatial · Type/Titre/Message enrobés, gardés
  // sur le rendu (`spatial-support.test.tsx`).

  it('Invitation · E-mail et Rôle portent leur nom accessible', () => {
    // Vague 2 · l'invitation vit dans l'écran Spatial Équipe (formulaire en ligne de la maquette).
    const s = read('spatial/vues/reglages/Equipe.tsx');
    expect(s).toContain('aria-label="Email à inviter"');
    expect(s).toContain('aria-label="Rôle"');
  });
});
