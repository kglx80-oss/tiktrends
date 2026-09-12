import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le chat tire une action serveur (`server-only` via lib/auth) · on le neutralise.
vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
// next/link → une ancre simple, comme les autres tests de rendu du home.
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

/**
 * Chaque studio a sa couleur d'identité · quatre pastilles roses identiques ne
 * distinguaient rien. On rend le home et on lit que les pastilles portent bien
 * des teintes DIFFÉRENTES, pas la même pour tous.
 */
const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} brandName="Klorea" brandId="b1" aiReady />,
);

describe('les studios se distinguent à la couleur', () => {
  it('chaque studio porte sa propre teinte d’icône', () => {
    const h = html();
    // Pubs IA (phare) garde l'accent de la marque.
    expect(h, 'Pubs IA garde l’accent phare').toContain('var(--grad-accent)');
    // Les trois autres ont chacune une teinte propre.
    expect(h, 'Image IA · teal').toContain('#1f9e8f');
    expect(h, 'Vidéo IA · violet').toContain('#8b5cf6');
    expect(h, 'Textes IA · ambre').toContain('#d69a3a');
  });

  it('ce ne sont pas quatre fois la même pastille', () => {
    // Si les quatre studios repartageaient l'accent, aucune des teintes propres
    // ne serait rendue · ce test tomberait.
    const h = html();
    const teintes = ['#1f9e8f', '#8b5cf6', '#d69a3a'].filter((t) => h.includes(t));
    expect(teintes.length, 'les studios ne sont pas différenciés').toBe(3);
  });
});
