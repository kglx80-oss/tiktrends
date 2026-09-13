import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une dimension d'insight vide affichait « Analyse IA requise. » · trompeur, car
 * le rapport EXISTE (on est sur sa fiche) · c'est cette dimension-là qui n'a
 * rien retenu. On dit la vérité et on nomme le geste déjà présent en haut de
 * page (« Rafraîchir l'analyse »), au lieu d'une impasse muette.
 *
 * Page serveur (session, db) · non rendable. Adoption par la source.
 */
const src = readFileSync(
  join(process.cwd(), 'app/(app)/brands/[id]/competitors/[name]/page.tsx'),
  'utf8',
);

describe('Fiche concurrent · une dimension vide dit la vérité', () => {
  it('plus de « Analyse IA requise » trompeur', () => {
    expect(src, 'le message trompeur « Analyse IA requise » traîne encore')
      .not.toContain('Analyse IA requise');
  });

  it('l’état vide est honnête et nomme le geste existant', () => {
    const i = src.indexOf('Rien de notable sur cette dimension');
    expect(i, 'le message honnête de dimension vide manque').toBeGreaterThan(-1);
    expect(src.slice(i, i + 200), 'l’état vide ne renvoie pas au geste « Rafraîchir l’analyse »')
      .toContain('Rafraîchir l’analyse');
  });
});
