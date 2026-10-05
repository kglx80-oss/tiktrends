// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 19C · message 56 · le retour d'erreur du ★ ne recouvre pas le ★.
 *
 * Mesuré au navigateur (build local, 390 × 720, avant correction) · pile de
 * retours 615 → 696, ★ 604 → 648 · 1 416 px² recouverts, `elementFromPoint` au
 * centre du ★ = la pile (non atteignable). On MONTE le ★ sous la vraie pile
 * (jsdom) et on donne aux boîtes les positions MESURÉES · on lit où la pile se
 * pose (`data-pile-retours`, `top`/`bottom` rendus) et l'état du ★.
 */
const appel = vi.hoisted(() => ({ reponse: { ok: false, error: 'Annonce déjà sauvegardée pour une autre marque de l’espace.' } as unknown }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async () => appel.reponse, unsaveAd: async () => ({ ok: true }), followBrand: async () => {}, unfollowBrand: async () => {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { SaveButton } from '../components/InspoButtons';
import { ToastProvider, useToast } from '../components/Toast';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type R = [number, number, number, number];
const geo = { etoile: [323, 604, 367, 648] as R, ligne: [16, 615, 374, 696] as R };
const rect = ([l, t, r, b]: R) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t, toJSON() {} }) as DOMRect;
let origine: typeof Element.prototype.getBoundingClientRect;
beforeEach(() => {
  origine = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.matches('button[aria-pressed]')) return rect(geo.etoile);
    if (this.parentElement?.hasAttribute('data-pile-retours')) return rect(geo.ligne);
    return rect([0, 0, 0, 0]);
  };
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
});
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { Element.prototype.getBoundingClientRect = origine; act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

const ad = { id: 'e1', platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Marque' } as InspoAd;
async function cliquer() {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<ToastProvider><SaveButton ad={ad} initialSaved={false} /></ToastProvider>); });
  const b = el.querySelector('button[aria-pressed]') as HTMLButtonElement;
  await act(async () => { b.click(); });
  await act(async () => { await Promise.resolve(); });
  return { b, pile: el.querySelector('[data-pile-retours]') as HTMLElement };
}

describe('★ · le retour d’erreur ne recouvre pas le geste', () => {
  it('à 390 (mesure réelle) · la pile passe en haut, le ★ reste vide et atteignable', async () => {
    geo.etoile = [323, 604, 367, 648]; geo.ligne = [16, 615, 374, 696];
    const { b, pile } = await cliquer();
    expect(pile.textContent).toContain('autre marque');
    expect(pile.getAttribute('data-pile-retours'), 'le retour recouvre le ★').toBe('haut');
    expect(pile.style.top).toBe('24px');
    expect(pile.style.bottom).toBe('');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.disabled).toBe(false);
  });

  it('à 1440 (mesure réelle, aucun recouvrement) · la pile reste en bas', async () => {
    geo.etoile = [465, 406, 509, 450]; geo.ligne = [510, 615, 930, 696];
    const { pile } = await cliquer();
    expect(pile.getAttribute('data-pile-retours')).toBe('bas');
    expect(pile.style.bottom).toBe('24px');
  });

  it('un retour SANS ancre (les autres écrans) ne bouge pas', async () => {
    geo.etoile = [323, 604, 367, 648]; geo.ligne = [16, 615, 374, 696];
    function Bouton() { const { toast } = useToast(); return <button type="button" data-x onClick={() => toast('Fait.')}>x</button>; }
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(<ToastProvider><Bouton /></ToastProvider>); });
    await act(async () => { (el!.querySelector('[data-x]') as HTMLButtonElement).click(); });
    expect(el.querySelector('[data-pile-retours]')!.getAttribute('data-pile-retours')).toBe('bas');
  });
});
