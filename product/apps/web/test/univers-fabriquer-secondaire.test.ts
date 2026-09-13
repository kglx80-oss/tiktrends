import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le bouton « Fabriquer · N cr. » DÉPENSE des crédits · c'est une préparation
 * optionnelle. Il portait le dégradé primaire (var(--grad-accent)), le même que
 * « Suivant → » sur l'étape « style » de l'assistant · deux CTA de poids égal,
 * l'un payant, l'autre non · on clique la dépense en croyant avancer. On exige
 * qu'il reste SECONDAIRE (contour), jamais le dégradé primaire.
 *
 * Client à actions serveur + chargement par effet · non rendable seul. Adoption
 * par la source, bornée au bouton Fabriquer.
 */
const src = readFileSync(join(process.cwd(), 'components/UniversePicker.tsx'), 'utf8');
const i = src.indexOf('onClick={fabriquer}');
const bloc = src.slice(i, i > -1 ? i + 320 : undefined);

describe('UniversePicker · le bouton payant reste secondaire', () => {
  it('le bouton Fabriquer existe', () => {
    expect(i, 'bouton Fabriquer introuvable').toBeGreaterThan(-1);
  });

  it('le bouton payant ne porte pas le dégradé primaire', () => {
    expect(bloc, "« Fabriquer » (dépense) rivalise avec « Suivant » en dégradé primaire")
      .not.toContain('var(--grad-accent)');
  });

  it('il est bien rendu en secondaire (contour accent)', () => {
    expect(bloc, 'le bouton payant n’est pas un contour secondaire')
      .toContain('border: \'1px solid var(--accent-strong)\'');
  });
});
