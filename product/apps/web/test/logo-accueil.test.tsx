import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LogoHome } from '../components/LogoHome';

/**
 * Le défaut d'origine, mot pour mot : « il manque un accueil · j'ai pas de bouton
 * (logo ou autre) pour un retour ». Le logo était muet.
 *
 * Kevin, 29/09 · le logo ramène à l'accueil dans TOUS les états — déplié ET
 * replié. En replié, l'expansion de la barre est une icône SÉPARÉE (dans la
 * coquille), le logo n'usurpe plus ce geste. On rend le logo et on lit le HTML.
 */
describe('le logo ramène à l’accueil · dans tous les états', () => {
  it('déplié · lien vers le Dashboard, étiqueté « Accueil », avec le mot TikTrends', () => {
    const html = renderToStaticMarkup(<LogoHome collapsed={false} />);
    expect(html, 'le logo ne pointe pas vers l’accueil').toContain('href="/dashboard"');
    expect(html, 'le retour n’est pas nommé pour les lecteurs d’écran').toContain('aria-label="Accueil"');
    expect(html, 'le mot TikTrends manque en déplié').toContain('TikTrends');
  });

  it('replié · le logo RESTE un lien accueil (mutation : le rendre muet fait tomber)', () => {
    const html = renderToStaticMarkup(<LogoHome collapsed />);
    expect(html, 'replié, le logo ne ramène plus à l’accueil').toContain('href="/dashboard"');
    expect(html).toContain('aria-label="Accueil"');
    // À 64 px, le mot n'a pas la place · seul le symbole (le lien reste accueil).
    expect(html, 'le mot ne devrait pas s’afficher à 64 px').not.toContain('TikTrends');
  });
});
