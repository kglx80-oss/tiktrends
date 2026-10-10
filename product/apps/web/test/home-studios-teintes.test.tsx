import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Le chat tire une action serveur (`server-only` via lib/auth) · on le neutralise.
vi.mock('../components/AssistantChat', () => ({ AssistantChat: () => null }));
// next/link → une ancre simple, comme les autres tests de rendu du home.
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { AssistantHome } from '../components/AssistantHome';

/**
 * Les deux accès Studios de l'accueil (« Nouveau projet », « Mes projets » ·
 * anciens studios retirés le 10/10) se distinguent à la couleur · deux
 * pastilles identiques ne distingueraient rien. On rend le home et on lit les
 * teintes.
 */
const html = () => renderToStaticMarkup(
  <AssistantHome firstName="Kévin" credits={1200} unlimited={false} brandName="Klorea" brandId="b1" aiReady />,
);

describe('les accès Studios se distinguent à la couleur', () => {
  it('« Nouveau projet » garde l’accent, « Mes projets » sa teinte propre', () => {
    const h = html();
    expect(h, 'Nouveau projet garde l’accent').toContain('var(--grad-accent)');
    expect(h, 'Mes projets · violet').toContain('#8b5cf6');
  });

  it('aucune teinte des anciens studios (teal, ambre) n’est rendue', () => {
    const h = html();
    expect(['#1f9e8f', '#d69a3a'].filter((t) => h.includes(t))).toEqual([]);
  });
});
