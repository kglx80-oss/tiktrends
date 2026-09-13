import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

/**
 * L'accueil ne porte qu'UN appel à l'action « créer des pubs » · la carte « Pubs
 * IA » (phare) de la grille « Créer ». Le bandeau d'accueil portait EN PLUS un
 * bouton héros vers /studio/ads, côte à côte · deux CTA pour la même action sur
 * le même écran. On rend l'accueil et on COMPTE les liens vers /studio/ads.
 */
const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} brandName="Klorea" brandId="b1" aiReady />,
);

describe('l’accueil ne dédouble pas le CTA « créer des pubs »', () => {
  it('un seul lien vers /studio/ads · la carte Pubs IA, pas aussi le héros', () => {
    const h = html();
    expect((h.match(/href="\/studio\/ads"/g) ?? []).length, 'CTA « créer des pubs » dédoublé').toBe(1);
  });

  it('l’accueil reste un accueil · salutation et solde présents', () => {
    const h = html();
    expect(h).toContain('Bonjour Kévin');
    expect(h).toContain('crédits');
  });
});
