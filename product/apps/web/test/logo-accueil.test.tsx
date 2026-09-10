import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LogoHome } from '../components/LogoHome';

/**
 * Le défaut rapporté, mot pour mot : « il manque un accueil · j'ai pas de bouton
 * (logo ou autre) pour un retour ». Le logo était muet. On rend le logo et on
 * lit le HTML · déplié, il doit être un lien vers l'accueil.
 */
describe('le logo ramène à l’accueil', () => {
  it('déplié · le logo est un lien vers le Dashboard, étiqueté « Accueil »', () => {
    const html = renderToStaticMarkup(<LogoHome collapsed={false} onExpand={() => {}} />);
    expect(html, 'le logo ne pointe pas vers l’accueil').toContain('href="/dashboard"');
    expect(html, 'le retour n’est pas nommé pour les lecteurs d’écran').toContain('aria-label="Accueil"');
  });

  it('replié · le logo rouvre la barre, il n’usurpe pas un faux lien', () => {
    const html = renderToStaticMarkup(<LogoHome collapsed onExpand={() => {}} />);
    expect(html).not.toContain('href="/dashboard"');
    expect(html).toContain('aria-label="Déplier la barre"');
  });
});
