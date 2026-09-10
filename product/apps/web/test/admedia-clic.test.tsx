import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdMedia } from '../components/AdMedia';

/**
 * Ce que la zone média PRODUIT, pas ce que le fichier mentionne.
 *
 * Le défaut : quand une créa n'a ni média ni miniature, la zone montre « Aperçu
 * indisponible » mais restait un `<a href="#">`. Cliquer faisait sauter la page
 * en haut · un cul-de-sac. On rend le composant et on lit le HTML · un lien mort
 * ne sait pas se cacher d'une lecture du balisage.
 *
 * Pas de DOM · `renderToStaticMarkup` suffit, on ne clique pas (l'état de départ
 * n'est jamais « en lecture »).
 */
describe('la zone média n’offre un clic que s’il y a quelque chose à ouvrir', () => {
  it('sans média ni miniature, aucun lien · surtout pas vers « # »', () => {
    const html = renderToStaticMarkup(<AdMedia />);
    expect(html, 'la zone vide affiche pourtant son repli').toContain('Aperçu indisponible');
    expect(html, 'un href="#" fait sauter la page au clic').not.toContain('href="#"');
    expect(html, 'rien à ouvrir ne doit pas être un lien').not.toContain('<a ');
  });

  it('une image ouvre son média en grand dans un onglet', () => {
    const html = renderToStaticMarkup(<AdMedia mediaUrl="https://cdn.exemple/pub.jpg" />);
    expect(html).toContain('href="https://cdn.exemple/pub.jpg"');
    expect(html).toContain('target="_blank"');
  });

  it('à défaut de média, la miniature suffit comme cible', () => {
    const html = renderToStaticMarkup(<AdMedia thumbnailUrl="https://cdn.exemple/mini.jpg" />);
    expect(html).toContain('href="https://cdn.exemple/mini.jpg"');
  });
});
