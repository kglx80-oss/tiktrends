import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bandeau } from '../components/Bandeau';

/**
 * Le bandeau d'état unique · on le rend et on lit le HTML.
 *
 * Il remplace quatre formes divergentes du même sens. On vérifie donc : le ton
 * porte son signe, le titre et le message s'affichent, et la SORTIE n'apparaît
 * que si un geste existe · une page sur échantillon sans porte de sortie était
 * le défaut d'origine.
 */
describe('le bandeau d’état dit son ton et n’offre une sortie que s’il y en a une', () => {
  it('démo avec sortie · signe au trait (bulb), titre, message, et le lien vers le réel', () => {
    const html = renderToStaticMarkup(
      <Bandeau ton="demo" titre="Mode démonstration" sortie={{ href: '/connections', label: 'Brancher un compte' }}>
        Ces tags portent sur un échantillon.
      </Bandeau>,
    );
    // Le ton porte désormais une icône du jeu (plus d'emoji) · le rendu contient
    // le tracé de « bulb », pas un pictogramme.
    expect(html).not.toContain('🧪');
    expect(html).toContain('M9 18h6');
    expect(html).toContain('Mode démonstration');
    expect(html).toContain('Ces tags portent sur un échantillon.');
    expect(html).toContain('href="/connections"');
    expect(html).toContain('Brancher un compte');
    expect(html, 'l’encre sur surface accent doit rester var(--on-accent)').toContain('var(--on-accent)');
  });

  it('erreur sans sortie · signe au trait (alert), message, aucun lien', () => {
    const html = renderToStaticMarkup(<Bandeau ton="error">Erreur de la source de données.</Bandeau>);
    expect(html).not.toContain('⚠');
    expect(html).toContain('M10.3 3.9'); // tracé de « alert »
    expect(html).toContain('Erreur de la source de données.');
    expect(html, 'un bandeau sans sortie n’invente pas de lien').not.toContain('<a ');
  });
});
