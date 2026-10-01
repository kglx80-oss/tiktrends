import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Tags from '../app/(app)/tags/page';

/**
 * Ce que la page AFFICHE, pas ce que le fichier mentionne · on la rend et on lit
 * le HTML.
 *
 * La page Tags calcule TOUT sur un échantillon (`fixtures.tagged`) mais ne le
 * disait nulle part et n'offrait aucune sortie : un cul-de-sac de chiffres
 * faux pris pour les siens. On exige donc, dans le rendu réel, que la démo soit
 * nommée. Recette #106 · aucun compte n'alimente cette page · la « porte vers
 * le réel » (« Brancher un compte ») promettait une analyse qui n'existe pas ·
 * on exige désormais qu'elle soit absente et que la limite soit dite.
 */
describe('la page Tags nomme sa démo et dit sa limite', () => {
  const html = renderToStaticMarkup(<Tags />);

  it('la donnée d’exemple est annoncée comme telle', () => {
    expect(html, 'aucune mention que ces tags sont un échantillon').toContain('Mode démonstration');
  });

  it('aucune porte vers un branchement qui n’existe pas · la limite est dite', () => {
    expect(html, 'promesse de branchement').not.toContain('href="/connections"');
    expect(html, 'promesse de branchement').not.toContain('Brancher un compte');
    expect(html, 'la limite n’est pas dite').toContain('n’est pas encore disponible ici');
  });
});
