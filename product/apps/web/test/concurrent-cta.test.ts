import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La page concurrent affichait DEUX fois le même bouton « Analyser ce
 * concurrent » (un dans l'en-tête, un au centre) tant que rien n'était analysé ·
 * un doublon sans intérêt. On n'en garde qu'un, dans la carte d'accueil ·
 * l'en-tête ne porte un bouton qu'une fois l'analyse faite (pour la rafraîchir).
 *
 * La page importe des actions serveur · non rendable en test. Adoption par la
 * source.
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/brands/[id]/competitors/[name]/page.tsx'),
  'utf8',
);

describe('page concurrent · un seul appel à l’action', () => {
  it('un seul CTA « Analyser ce concurrent » dans toute la page', () => {
    expect(src.split('Analyser ce concurrent').length - 1, 'plus de double CTA').toBe(1);
  });

  it('le bouton de l’en-tête n’apparaît qu’une fois l’analyse faite', () => {
    // Conditionné par `report` · sinon il redoublonnerait le CTA de la carte.
    expect(src).toContain('{report && (');
    expect(src).toContain('Rafraîchir l’analyse');
  });

  it('la carte d’accueil montre ce qu’on va extraire (chips)', () => {
    // L'état non-analysé n'est plus deux phrases grises · il présente la valeur
    // sous forme de pastilles (les dimensions extraites).
    expect(src).toContain("['Hooks', 'Angles', 'USP', 'Désirs', 'Émotions', 'Thèmes']");
  });
});
