// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 20B · Sauvegardes · l'ONGLET d'origine après l'échec d'un rangement.
 *
 * Mesuré avant correction (70200777) · depuis l'onglet « Hooks » qui ne contient
 * qu'une créa, la ranger ailleurs vide l'onglet · l'interface bascule sur
 * « Toutes » (l'onglet disparaît). Le serveur refuse (ou lève) · `restaurer()`
 * remettait la créa dans « Hooks » mais l'interface restait sur « Toutes », le
 * focus sur « Toutes » et l'URL sans `board=Hooks`. On MONTE Sauvegardes et on
 * lit ce qu'on voit · l'onglet pressé, l'URL, le focus, la créa affichée.
 */
const appel = vi.hoisted(() => ({ dossier: (): Promise<unknown> => Promise.resolve({ ok: true }), retours: [] as Array<[string, string | undefined]>, repondre: () => {} }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async () => ({ ok: true }), unsaveAd: async () => ({ ok: true }), setSavedAdFolder: () => appel.dossier(),
  followBrand: async () => {}, unfollowBrand: async () => {},
}));
vi.mock('../components/Toast', () => {
  const api = { toast: (m: string, k?: string) => { appel.retours.push([m, k]); return 1; }, dismiss: () => {} };
  return { useToast: () => api, useToastSiPresent: () => api };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../components/AdCard', () => ({ AdCard: ({ ad }: { ad: { id: string } }) => <div data-adcard={ad.id} /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => null }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.retours = []; appel.repondre = () => {}; window.history.replaceState(null, '', '/saved'); });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const ad = (id: string) => ({ id, platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Marque ' + id }) as InspoAd;
const it_ = (id: string, folder: string | null): SavedItem => ({ id: 's-' + id, externalId: id, platform: 'meta', folder, ad: ad(id) });
/** « Hooks » ne contient qu'UNE créa · la ranger ailleurs vide l'onglet. */
const SEULE = [it_('e1', 'Hooks'), it_('e2', null), it_('e3', 'Inspirations')];
/** « Hooks » en contient deux · l'onglet survit au déplacement. */
const DEUX = [it_('e1', 'Hooks'), it_('e4', 'Hooks'), it_('e2', null)];

const presse = (h: HTMLElement) => [...h.querySelectorAll('[role="group"][aria-label="Boards"] button[aria-pressed="true"]')].map((b) => (b.textContent || '').replace(/\s*·?\s*\d+$/, '').trim());
const cartes = (h: HTMLElement) => [...h.querySelectorAll('[data-adcard]')].map((c) => c.getAttribute('data-adcard'));
const boardUrl = () => new URLSearchParams(window.location.search).get('board');
const focus = () => { const a = document.activeElement; return a && a !== document.body ? (a.textContent || '').replace(/\s*·?\s*\d+$/, '').trim() : 'BODY'; };

async function ranger(items: SavedItem[], dans: string, url: string) {
  window.history.replaceState(null, '', url);
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SavedBoards items={items} followKeys={[]} />); });
  const h = el;
  expect(presse(h), 'l’onglet d’URL n’est pas actif au départ').toEqual(['Hooks']);
  await act(async () => { (h.querySelector('button[aria-expanded]') as HTMLButtonElement).click(); });
  const champ = h.querySelector('input[aria-label="Nom du nouveau board"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, dans);
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { (h.querySelector('button[aria-label="Créer ce board"]') as HTMLButtonElement).click(); });
  // Le serveur répond APRÈS le déplacement optimiste (comme au navigateur) ·
  // on laisse d'abord passer la bascule et son focus, on les constate, puis la
  // réponse arrive.
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  pendant = { presse: presse(h), focus: focus() };
  await act(async () => { appel.repondre(); });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return h;
}
let pendant: { presse: string[]; focus: string } = { presse: [], focus: '' };
/** La réponse du serveur n'arrive qu'à `appel.repondre()`. */
const differe = (r: () => Promise<unknown>) => () => new Promise<unknown>((ok, ko) => { appel.repondre = () => { r().then(ok, ko); }; });

describe('Ranger dans un board · échec · l’onglet d’origine redevient actif', () => {
  it('refus ok:false depuis l’onglet vidé · onglet, URL et focus reviennent sur « Hooks »', async () => {
    appel.dossier = differe(() => Promise.resolve({ ok: false, error: 'Rangement refusé · rôle insuffisant.' }));
    const h = await ranger(SEULE, 'Ailleurs', '/saved?onglet=creations&board=Hooks');
    expect(pendant, 'le déplacement optimiste ne bascule plus sur « Toutes » (scénario non reproduit)').toEqual({ presse: ['Toutes'], focus: 'Toutes' });
    expect(appel.retours).toEqual([['Rangement refusé · rôle insuffisant.', 'err']]);
    expect(presse(h), 'l’interface reste sur « Toutes » après le rollback').toEqual(['Hooks']);
    expect(boardUrl(), 'l’URL a perdu le board d’origine').toBe('Hooks');
    expect(cartes(h), 'la vue ne montre pas le board d’origine').toEqual(['e1']);
    expect(focus(), 'le focus n’est pas rendu à l’onglet d’origine').toBe('Hooks');
  });

  it('exception (réseau) depuis l’onglet vidé · même retour sur « Hooks »', async () => {
    appel.dossier = differe(() => Promise.reject(new Error('réseau')));
    const h = await ranger(SEULE, 'Ailleurs', '/saved?onglet=creations&board=Hooks');
    expect(pendant).toEqual({ presse: ['Toutes'], focus: 'Toutes' });
    expect(appel.retours.at(-1)).toEqual(['Rangement non enregistré · vérifie ta connexion puis réessaie.', 'err']);
    expect(presse(h), 'l’interface reste sur « Toutes » après le rollback').toEqual(['Hooks']);
    expect(boardUrl(), 'l’URL a perdu le board d’origine').toBe('Hooks');
    expect(cartes(h)).toEqual(['e1']);
    expect(focus(), 'le focus n’est pas rendu à l’onglet d’origine').toBe('Hooks');
  });

  it('échec sans onglet vidé · inchangé · on reste sur « Hooks »', async () => {
    appel.dossier = differe(() => Promise.reject(new Error('réseau')));
    const h = await ranger(DEUX, 'Ailleurs', '/saved?board=Hooks');
    expect(presse(h)).toEqual(['Hooks']);
    expect(cartes(h)).toEqual(['e1', 'e4']);
    expect(boardUrl()).toBe('Hooks');
  });

  it('succès depuis l’onglet vidé · inchangé · bascule sur « Toutes », la créa est dans « Ailleurs »', async () => {
    appel.dossier = differe(() => Promise.resolve({ ok: true }));
    const h = await ranger(SEULE, 'Ailleurs', '/saved?board=Hooks');
    expect(appel.retours).toEqual([['Rangé dans « Ailleurs ».', undefined]]);
    expect(presse(h)).toEqual(['Toutes']);
    expect(boardUrl()).toBeNull();
    expect(focus()).toBe('Toutes');
  });

  it('filtre de recherche conservé · le rollback rend l’onglet sans effacer la recherche', async () => {
    appel.dossier = differe(() => Promise.resolve({ ok: false, error: 'Refusé.' }));
    const h = await ranger(SEULE, 'Ailleurs', '/saved?board=Hooks&q=Marque');
    expect(presse(h)).toEqual(['Hooks']);
    expect(new URLSearchParams(window.location.search).get('q'), 'la recherche a été perdue').toBe('Marque');
    expect((h.querySelector('input[aria-label="Rechercher dans les créas gardées"]') as HTMLInputElement).value).toBe('Marque');
  });
});
