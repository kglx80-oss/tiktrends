import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'écran « aucune marque » proposait DEUX mécanismes de création côte à côte :
 * l'`action` de l'Empty (lien vers la page pleine /brands/new) ET le bouton
 * NewBrandButton (qui ouvre le parcours en pop-up). Deux destinations pour la
 * même intention · on garde un seul geste, le bouton pop-up (même chemin qu'en
 * en-tête). Le `todo` reste valide car le geste est le `children`.
 *
 * Page serveur (session, db) · non rendable. Adoption par la source, bornée au
 * bloc de l'état vide.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/brands/page.tsx'), 'utf8');
const i = src.indexOf('rows.length === 0');
const bloc = src.slice(i, i > -1 ? i + 700 : undefined);

describe('Marques · l’écran vide n’a qu’un seul geste de création', () => {
  it('le bloc de l’état vide existe', () => {
    expect(i, 'état vide des marques introuvable').toBeGreaterThan(-1);
  });

  it('plus de lien /brands/new concurrent du bouton pop-up', () => {
    expect(bloc, 'l’écran vide double le geste par un lien vers /brands/new')
      .not.toContain("href: '/brands/new'");
  });

  it('le geste unique est bien le bouton de création', () => {
    expect(bloc, 'le geste de création a disparu de l’écran vide').toContain('<NewBrandButton');
  });
});
