// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { SwipeFile } from '../app/(app)/veille/scale/SwipeFile';

/**
 * Lot 18B · « Ce qui scale » · les filtres et le tri vivaient en état local et
 * revenaient au défaut au rechargement comme au Retour (mesuré, 3 largeurs sur
 * 3). On lit ce qu'on VOIT au premier rendu, et l'URL après un changement.
 */
describe('Ce qui scale · filtres dans l’URL (lot 18B)', () => {
  const STATS = { total: 2, videos: 2, advertisers: 2, spendCumul: '0 €', medianDuration: 0, medianGrowth: 0 };
  const items = [
    { ad: { id: '1', platform: 'meta', status: 'active', daysRunning: 10, mediaType: 'video', advertiserName: 'Old Spice.' }, angle: 'other', saved: false, following: false },
    { ad: { id: '2', platform: 'meta', status: 'active', daysRunning: 20, mediaType: 'video', advertiserName: 'Neutrogena' }, angle: 'other', saved: false, following: false },
  ] as never;
  let root: Root | null = null; let el: HTMLDivElement | null = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); window.history.replaceState(null, '', '/veille/scale?q=caf%C3%A9&country=FR&annonceur=Old+Spice.&tri=duration'); });
  afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); });

  it('relus au premier rendu · puces et « X sur Y » affichés sans repasser par le défaut', () => {
    const html = renderToStaticMarkup(<SwipeFile items={items} stats={STATS} advertisers={['Old Spice.', 'Neutrogena']} niche="café" country="FR"
      initial={{ type: 'all', annonceur: 'Old Spice.', angle: 'all', texte: '', tri: 'duration' }} />);
    expect(html, 'le filtre relu n’est pas appliqué').toContain('1 sur 2 créa(s)');
    expect(html).toContain('aria-label="Retirer le critère · Old Spice."');
  });

  it('un changement réécrit l’URL (niche gardée), sans entrée d’historique de plus', async () => {
    const avant = window.history.length;
    act(() => { root!.render(<SwipeFile items={items} stats={STATS} advertisers={['Old Spice.', 'Neutrogena']} niche="café" country="FR"
      initial={{ type: 'all', annonceur: 'Old Spice.', angle: 'all', texte: '', tri: 'duration' }} />); });
    await act(async () => { [...el!.querySelectorAll('button')].find((b) => b.textContent === 'Vidéos')!.click(); });
    expect(window.location.search, 'le filtre ne survit pas au rechargement').toBe('?q=caf%C3%A9&country=FR&annonceur=Old+Spice.&tri=duration&type=video');
    expect(window.history.length).toBe(avant);
    await act(async () => { [...el!.querySelectorAll('button')].find((b) => b.textContent === 'Réinitialiser')!.click(); });
    expect(window.location.search, 'la réinitialisation laisse des critères dans l’URL').toBe('?q=caf%C3%A9&country=FR&tri=duration');
  });
});
