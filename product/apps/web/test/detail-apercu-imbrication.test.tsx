import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdMedia } from '../components/AdMedia';

/**
 * CDC v8 · F04 · un aperçu ne doit contenir AUCUN interactif imbriqué.
 *
 * Un bouton d'aperçu qui enveloppe `AdMedia` · si celui-ci pose un `<a>` (image)
 * ou un bouton de lecture (vidéo) à l'intérieur, on a un interactif DANS un
 * bouton · invalide, et au clic ça ouvrait un onglet de miniature EN PLUS du
 * détail. On rend le HTML · `AdMedia` non interactif ne pose ni lien ni bouton.
 */

describe('F04 · l’aperçu n’imbrique aucun interactif', () => {
  it('AdMedia non interactif ne rend ni lien ni bouton', () => {
    const h = renderToStaticMarkup(<AdMedia mediaUrl="https://x/p.png" interactive={false} />);
    expect(h).not.toContain('<a ');
    expect(h).not.toContain('<button');
  });

  it('AdMedia interactif (autonome) garde son lien d’ouverture', () => {
    const h = renderToStaticMarkup(<AdMedia mediaUrl="https://x/p.png" />);
    expect(h).toContain('<a ');
  });
});
