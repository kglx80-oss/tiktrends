import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hub, type HubCard } from '../components/Hub';

/**
 * Ce que la page de garde AFFICHE. Le défaut, vu à l'écran sur le Studio :
 * « Aucune visuel pour l'instant », « Aucune brief pour l'instant ». On rend le
 * Hub avec un compteur masculin à zéro et on lit le HTML · l'accord fautif ne
 * survit pas à une lecture du balisage.
 */
const carte = (over: Partial<HubCard>): HubCard => ({
  href: '/x', icon: '🖼️', title: 'Image IA', makes: 'un visuel', when: 'quand',
  state: { kind: 'ready' }, count: { n: 0, label: 'visuel', genre: 'm' }, ...over,
});

describe('la page de garde accorde « aucun » au genre du nom', () => {
  it('un nom masculin à zéro ne prend jamais « Aucune »', () => {
    const html = renderToStaticMarkup(<Hub intro="i" cards={[carte({})]} />);
    expect(html, 'l’accord féminin traîne encore sur un nom masculin').not.toContain('Aucune visuel');
    expect(html, 'le compteur vide ne s’affiche pas').toContain('Aucun visuel');
  });

  it('un nom féminin à zéro prend « Aucune »', () => {
    const html = renderToStaticMarkup(<Hub intro="i" cards={[carte({ count: { n: 0, label: 'vidéo', genre: 'f' } })]} />);
    expect(html).toContain('Aucune vidéo');
  });
});
