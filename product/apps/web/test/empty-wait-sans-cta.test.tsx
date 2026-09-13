import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { Empty } from '../components/Empty';

/**
 * Un état `wait` (« ça se remplira tout seul ») ne porte AUCUN CTA de
 * navigation · rien à faire, donc rien qui appelle le clic. Trois écrans Jarvis
 * empilaient pourtant le même « Ouvrir Pubs IA » sur des sections vides.
 *
 * On RG le composant et on lit le HTML · un `wait` ne rend aucun `<a>`. Le type
 * interdit désormais de lui passer une `action` · ce test verrouille le RÉSULTAT
 * rendu, au cas où le composant se remettrait à fabriquer un lien de lui-même.
 */
describe('Empty · un état « wait » ne rend aucun CTA', () => {
  it('aucun lien dans un état wait', () => {
    const html = renderToStaticMarkup(
      <Empty tone="wait" title="Aucune créa notée pour l’instant." why="Le Score s’ouvre depuis Pubs IA." />,
    );
    expect(html, 'un état wait rend un lien · rien ne doit appeler le clic').not.toContain('<a');
  });

  it('un état todo, lui, porte bien son geste (contre-épreuve · le test n’est pas vide)', () => {
    const html = renderToStaticMarkup(
      <Empty tone="todo" title="Sélectionne une marque." action={{ label: 'Choisir', href: '/brands' }} />,
    );
    expect(html).toContain('href="/brands"');
  });
});
