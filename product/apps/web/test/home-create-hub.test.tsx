import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le chat tire une action serveur · on le neutralise pour rendre la home seule.
vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
// next/link → une ancre simple, pour lire les href sans contexte de routeur.
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} unlimited={false} brandName="Klorea" brandId="b1" aiReady />,
);

describe('la home mène par l’ANALYSE, création secondaire, au trait, sans emoji', () => {
  it('accueille et propose les Studios en accès secondaire · préparer un projet, reprendre ses projets', () => {
    const h = html();
    expect(h).toContain('Bonjour Kévin');
    for (const t of ['Nouveau projet', 'Mes projets']) expect(h, `accès ${t}`).toContain(t);
    expect(h, 'l’accès « Nouveau projet » a disparu').toContain('href="/studio/projets/nouveau"');
    for (const t of ['Pubs IA', 'Image IA', 'Vidéo IA', 'Textes IA']) expect(h, `ancien studio ${t} encore proposé`).not.toContain(t);
  });

  it('la création n’est PLUS mise en vedette (lot Dashboard · secondaire)', () => {
    // Mutation : réintroduire une pastille « Phare » sur la création ferait
    // retomber cette assertion · la création n'est plus la vedette de l'accueil.
    expect(html(), 'la création est encore mise en vedette').not.toContain('Phare');
  });

  it('affiche des icônes au trait (<svg>), jamais un emoji', () => {
    const h = html();
    expect(h).toContain('<svg');
    expect(h, 'une home premium ne porte pas d’emoji').not.toMatch(/👋|🩺|📊|👥|🔭|🎬|💡|📈|✨|◈|✦|↗|🖼️/u);
  });

  it('offre les accès d’ANALYSE (Adsmap, Analytics, Veille, Jarvis)', () => {
    const h = html();
    expect(h).toContain('/adsmap');
    // Lot 19A · Analytics est la vue de l'Accueil (lien natif).
    expect(h).toContain('/dashboard?vue=analytics');
    expect(h).toContain('/veille');
    expect(h).toContain('/jarvis');
  });
});
