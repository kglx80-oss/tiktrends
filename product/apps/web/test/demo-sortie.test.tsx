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
 * nommée ET qu'une porte vers le réel existe.
 */
describe('la page Tags nomme sa démo et montre la sortie', () => {
  const html = renderToStaticMarkup(<Tags />);

  it('la donnée d’exemple est annoncée comme telle', () => {
    expect(html, 'aucune mention que ces tags sont un échantillon').toContain('Mode démonstration');
  });

  it('une sortie vers le réel est offerte · brancher un compte', () => {
    expect(html, 'pas de lien vers /connections').toContain('href="/connections"');
    expect(html, 'le CTA ne nomme pas son geste').toContain('Brancher un compte');
  });
});
