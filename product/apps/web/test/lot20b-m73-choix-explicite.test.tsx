// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Message 73 · rollback d'un rangement · un choix EXPLICITE fait pendant
 * l'attente doit être respecté.
 *
 * Constat de code sur cdb65a5d · `restaurer` rend l'onglet d'origine dès que
 * l'onglet affiché est « Toutes » (`tabRef.current === BOARD_TOUS`) · il ne
 * distingue pas la bascule automatique (board vidé par le déplacement
 * optimiste) d'un clic de l'utilisateur sur « Toutes » pendant l'attente · le
 * refus le ramenait de force sur « Hooks » (onglet, URL, focus). On MONTE
 * Sauvegardes, réponse DIFFÉRÉE, et on lit l'onglet pressé, l'URL et le focus.
 * Contre-épreuve · sans choix intervenant, « Hooks » est rendu.
 */
const appel = vi.hoisted(() => ({ repondre: () => {}, issue: 'refus' as 'refus' | 'panne' }));
vi.mock('../app/actions/inspo', () => ({
  setSavedAdFolder: () => new Promise((ok, ko) => {
    appel.repondre = () => (appel.issue === 'panne' ? ko(new Error('réseau')) : ok({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' }));
  }),
  classerFormatSauvegarde: async () => ({ ok: true }),
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => 1 }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../components/AdCard', () => ({ AdCard: ({ ad }: { ad: { id: string } }) => <div data-adcard={ad.id} /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => null }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; window.history.replaceState(null, '', '/saved'); });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const ad = (id: string) => ({ id, platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Marque ' + id }) as InspoAd;
const items: SavedItem[] = [
  { id: 's1', externalId: 'e1', platform: 'meta', folder: 'Hooks', ad: ad('e1') },
  { id: 's2', externalId: 'e2', platform: 'meta', folder: null, ad: ad('e2') },
  { id: 's3', externalId: 'e3', platform: 'meta', folder: 'Inspirations', ad: ad('e3') },
];
const nom = (b: Element | null | undefined) => (b?.textContent || '').replace(/\s*·?\s*\d+$/, '').trim();
const presse = (h: HTMLElement) => [...h.querySelectorAll('[role="group"][aria-label="Boards"] button[aria-pressed="true"]')].map(nom);
const onglet = (h: HTMLElement, n: string) => [...h.querySelectorAll('[role="group"][aria-label="Boards"] button')].find((b) => nom(b) === n) as HTMLButtonElement;
const boardUrl = () => new URLSearchParams(window.location.search).get('board');
const vider = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

async function ranger() {
  window.history.replaceState(null, '', '/saved?board=Hooks');
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SavedBoards items={items} followKeys={[]} />); });
  const h = el;
  await act(async () => { (h.querySelector('button[aria-expanded]') as HTMLButtonElement).click(); });
  const champ = h.querySelector('input[aria-label="Nom du nouveau board"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'Ailleurs');
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { (h.querySelector('button[aria-label="Créer ce board"]') as HTMLButtonElement).click(); });
  await vider();
  expect(presse(h), 'la bascule automatique sur « Toutes » n’a pas eu lieu').toEqual(['Toutes']);
  return h;
}
// Un clic de l'utilisateur · focus puis clic, comme au navigateur.
const choisir = async (h: HTMLElement, n: string) => { const b = onglet(h, n); await act(async () => { b.focus(); b.click(); }); };

describe('Rollback · le choix explicite fait pendant l’attente est respecté', () => {
  for (const issue of ['refus', 'panne'] as const) {
    it(`${issue} · clic explicite sur « Toutes » pendant l’attente · reste sur « Toutes », URL sans board, focus sur « Toutes »`, async () => {
      appel.issue = issue;
      const h = await ranger();
      await choisir(h, 'Toutes');
      await act(async () => { appel.repondre(); });
      await vider();
      expect(presse(h), 'le choix explicite de « Toutes » est écrasé par le retour sur « Hooks »').toEqual(['Toutes']);
      expect(boardUrl(), 'l’URL repart sur board=Hooks malgré le choix explicite').toBeNull();
      expect(nom(document.activeElement), 'le focus quitte « Toutes »').toBe('Toutes');
    });

    it(`${issue} · « Inspirations » puis « Toutes » pendant l’attente · reste sur « Toutes »`, async () => {
      appel.issue = issue;
      const h = await ranger();
      await choisir(h, 'Inspirations');
      await choisir(h, 'Toutes');
      await act(async () => { appel.repondre(); });
      await vider();
      expect(presse(h), 'le choix explicite de « Toutes » est écrasé par le retour sur « Hooks »').toEqual(['Toutes']);
      expect(boardUrl()).toBeNull();
    });

    it(`${issue} · « Inspirations » choisi pendant l’attente · reste sur « Inspirations »`, async () => {
      appel.issue = issue;
      const h = await ranger();
      await choisir(h, 'Inspirations');
      await act(async () => { appel.repondre(); });
      await vider();
      expect(presse(h)).toEqual(['Inspirations']);
      expect(boardUrl()).toBe('Inspirations');
    });

    it(`${issue} · contre-épreuve · sans choix intervenant, « Hooks » est rendu (onglet, URL, focus)`, async () => {
      appel.issue = issue;
      const h = await ranger();
      await act(async () => { appel.repondre(); });
      await vider();
      expect(presse(h), 'l’onglet d’origine n’est plus rendu après un refus').toEqual(['Hooks']);
      expect(boardUrl()).toBe('Hooks');
      expect(nom(document.activeElement)).toBe('Hooks');
    });
  }
});
