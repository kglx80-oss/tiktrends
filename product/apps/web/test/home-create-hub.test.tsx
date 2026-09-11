import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le chat tire une action serveur · on le neutralise pour rendre la home seule.
vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
// next/link → une ancre simple, pour lire les href sans contexte de routeur.
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} brandName="Klorea" brandId="b1" aiReady />,
);

describe('la home est une page de garde CRÉER, au trait, sans emoji', () => {
  it('accueille et mène aux quatre studios', () => {
    const h = html();
    expect(h).toContain('Bonjour Kévin');
    for (const t of ['Pubs IA', 'Image IA', 'Vidéo IA', 'Textes IA']) expect(h, `studio ${t}`).toContain(t);
    expect(h, 'la CTA mène à Pubs IA').toContain('/studio/ads');
  });

  it('Pubs IA est marqué comme le produit phare', () => {
    expect(html()).toContain('Phare');
  });

  it('affiche des icônes au trait (<svg>), jamais un emoji', () => {
    const h = html();
    expect(h).toContain('<svg');
    expect(h, 'une home premium ne porte pas d’emoji').not.toMatch(/👋|🩺|📊|👥|🔭|🎬|💡|📈|✨|◈|✦|↗|🖼️/u);
  });

  it('offre les raccourcis observer/piloter', () => {
    const h = html();
    expect(h).toContain('/veille/scale');
    expect(h).toContain('/adsmap');
    expect(h).toContain('/jarvis');
  });
});
