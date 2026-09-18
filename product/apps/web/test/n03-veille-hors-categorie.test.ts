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
    expect(page).toContain('hors de la catégorie');
    expect(page).toContain('échantillon général');
  });

  it('il invite à renseigner la catégorie de la marque pour cibler', () => {
    expect(page).toMatch(/renseigne la catégorie de/);
  });

  it('le cas « dans ta catégorie » reste distinct', () => {
    expect(page).toContain('dans ta catégorie');
  });
});
