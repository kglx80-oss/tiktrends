// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Message 71 · « Nouveau board » validé par Entrée · le sélecteur se ROUVRAIT.
 *
 * Mesuré au navigateur sur bcd12a75 (390 × 720, puis 1440 et 1280) pendant le
 * retour d'échec d'un rangement · le retour (634 → 696) ne recouvre aucun
 * onglet (338 → 486), mais AUCUN onglet n'est atteignable à la souris · au
 * centre de chacun, `elementFromPoint` rend le fond fixe du sélecteur
 * (`position:fixed; inset:0; z-index:20`) · le premier clic ne fait que le
 * fermer. Cause, relevée au navigateur · `keydown Enter` sur le champ crée le
 * board et rend le focus au bouton du sélecteur · le `keypress Enter` qui suit
 * ACTIVE ce bouton (`click`) · le panneau se rouvre. Même chose sur un succès.
 *
 * jsdom ne simule pas l'activation par `keypress` · on lit donc ce qui la
 * produit · l'Entrée du champ doit être CONSOMMÉE (`defaultPrevented`, ce qui
 * annule le `keypress` au navigateur) · et le résultat · panneau fermé, focus
 * rendu au bouton, aucun fond fixe. La mesure au navigateur confirme.
 */
const appel = vi.hoisted(() => ({ dossiers: [] as Array<string | null> }));
vi.mock('../app/actions/inspo', () => ({
  setSavedAdFolder: async (x: { folder: string | null }) => { appel.dossiers.push(x.folder); return { ok: true }; },
  classerFormatSauvegarde: async () => ({ ok: true }),
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => 1 }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => null }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.dossiers = []; window.history.replaceState(null, '', '/saved'); });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const items: SavedItem[] = [{ id: 's1', externalId: 'e1', platform: 'meta', folder: null, ad: { id: 'e1', platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Marque' } as InspoAd }];
const fondFixe = (h: HTMLElement) => [...h.querySelectorAll('div')].some((d) => d.style.position === 'fixed' && d.style.zIndex === '20');

describe('Nouveau board par Entrée · le sélecteur reste fermé', () => {
  it('Entrée consommée, board créé, panneau fermé, focus au bouton, aucun fond fixe', async () => {
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(<SavedBoards items={items} followKeys={[]} />); });
    const h = el;
    const bouton = h.querySelector('button[aria-expanded]') as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    const champ = h.querySelector('input[aria-label="Nom du nouveau board"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'essai');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const entree = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { champ.dispatchEvent(entree); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(appel.dossiers, 'le board n’est pas créé').toEqual(['essai']);
    expect(entree.defaultPrevented, 'l’Entrée du champ n’est pas consommée · au navigateur, son keypress active le bouton et rouvre le sélecteur').toBe(true);
    const b = h.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(b.getAttribute('aria-expanded'), 'le sélecteur est resté ouvert').toBe('false');
    expect(fondFixe(h), 'le fond fixe du sélecteur couvre encore la page').toBe(false);
    expect(document.activeElement, 'le focus n’est pas rendu au bouton du sélecteur').toBe(b);
  });
});
