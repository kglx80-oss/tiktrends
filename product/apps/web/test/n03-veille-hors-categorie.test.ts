import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CDC v7 · N03 · quand la veille se rabat sur un échantillon GÉNÉRAL (la
 * catégorie de la marque n'a rien remonté, ou n'est pas renseignée), l'écran
 * doit le DIRE · sinon les inspirations hors catégorie se lisent comme celles de
 * la marque active. « Sous Klorea » ne doit pas laisser croire « catégorie de
 * Klorea » quand ce n'en est pas une.
 */
describe('N03 · la veille contextualise l’échantillon hors catégorie', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/veille/page.tsx'), 'utf8');

  it('le repli hors catégorie est nommé comme tel', () => {
    // Lot Veille · la ligne factuelle de sélection le mentionne, et SEULEMENT
    // hors catégorie (le cas dans la catégorie ne l'affiche pas).
    expect(page).toContain('hors catégorie');
    expect(page).toMatch(/!defaut\.parCategorie[\s\S]{0,140}hors catégorie/);
  });

  it('il invite à renseigner la catégorie de la marque pour cibler (aide à la demande)', () => {
    expect(page).toMatch(/catégorie de marque|précise la catégorie pour cibler/);
  });

  it('le cas « dans la catégorie » reste distinct (teinte normale vs teinte d’alerte)', () => {
    // Dans la catégorie → échantillon en teinte normale ; hors catégorie →
    // teinte d'alerte ET mention « hors catégorie ». Les deux ne se confondent pas.
    expect(page).toContain("defaut.parCategorie ? 'var(--ink-2)' : '#ffcf8f'");
  });
});
