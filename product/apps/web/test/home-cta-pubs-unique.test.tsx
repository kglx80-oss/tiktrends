import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

/**
 * L'accueil ne porte qu'UN appel à l'action « créer » · la carte « Nouveau
 * projet » de la rangée Studios. Le bandeau d'accueil portait EN PLUS un bouton
 * héros vers la création, côte à côte · deux CTA pour la même action sur le
 * même écran. On rend l'accueil et on COMPTE les liens vers la préparation.
 */
const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} unlimited={false} brandName="Klorea" brandId="b1" aiReady />,
);

describe('l’accueil ne dédouble pas le CTA « créer des pubs »', () => {
  it('un seul lien vers la préparation d’un projet · la carte, pas aussi le héros', () => {
    const h = html();
    expect((h.match(/href="\/studio\/projets\/nouveau[^"]*"/g) ?? []).length, 'CTA « créer » dédoublé').toBe(1);
  });

  it('l’accueil reste un accueil · salutation et solde présents', () => {
    const h = html();
    expect(h).toContain('Bonjour Kévin');
    expect(h).toContain('crédits');
  });
});
