// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 19C · message 60 · `move()` de Sauvegardes (ranger dans un board) sur une
 * EXCEPTION (réseau, serveur) · la promesse de `setSavedAdFolder` est rejetée.
 * Mesuré avant correction · la créa restait affichée dans le nouveau board,
 * sans aucun retour. On MONTE Sauvegardes (jsdom) et on lit le board affiché,
 * les onglets de boards et les retours émis · trois cas (rejet, refus `ok:false`,
 * succès).
 */
const appel = vi.hoisted(() => ({ dossier: (): Promise<unknown> => Promise.resolve({ ok: true }), retours: [] as Array<[string, string | undefined]> }));
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
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => null }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.retours = []; window.history.replaceState(null, '', '/saved'); });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const ad = (id: string) => ({ id, platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Marque ' + id }) as InspoAd;
const items: SavedItem[] = [
  { id: 's1', externalId: 'e1', platform: 'meta', folder: 'Hooks', ad: ad('e1') },
  { id: 's2', externalId: 'e2', platform: 'meta', folder: null, ad: ad('e2') },
];
const onglets = (h: HTMLElement) => [...h.querySelectorAll('button[aria-pressed]')].map((b) => (b.textContent || '').replace(/\s*·?\s*\d+$/, '').trim());
const boardDe = (h: HTMLElement, i = 0) => (h.querySelectorAll('button[aria-expanded]')[i] as HTMLElement | undefined)?.textContent?.replace('▾', '').trim();

async function ranger(dans: string, url = '/saved') {
  window.history.replaceState(null, '', url);
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SavedBoards items={items} followKeys={[]} />); });
  const h = el;
  await act(async () => { (h.querySelector('button[aria-expanded]') as HTMLButtonElement).click(); });
  const champ = h.querySelector('input[aria-label="Nom du nouveau board"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, dans);
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { (h.querySelector('button[aria-label="Créer ce board"]') as HTMLButtonElement).click(); });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return h;
}

describe('Ranger dans un board · exception du serveur', () => {
  it('promesse rejetée · la créa revient dans son board, l’erreur est dite, aucun « Rangé dans »', async () => {
    appel.dossier = () => Promise.reject(new Error('réseau'));
    const h = await ranger('Ailleurs');
    expect(boardDe(h), 'la créa reste affichée dans le nouveau board malgré l’échec').toBe('Hooks');
    expect(appel.retours.map((r) => r[0]).join(' | '), 'succès annoncé sur un échec').not.toContain('Rangé dans');
    expect(appel.retours, 'l’échec n’est pas dit').toEqual([['Rangement non enregistré · vérifie ta connexion puis réessaie.', 'err']]);
    expect(onglets(h), 'le board d’origine a disparu des onglets').toContain('Hooks');
    expect(onglets(h)).not.toContain('Ailleurs');
  });

  it('rejet depuis le board vidé · la créa et l’onglet de son board reviennent', async () => {
    appel.dossier = () => Promise.reject(new Error('serveur'));
    const h = await ranger('Ailleurs', '/saved?onglet=creations&board=Hooks');
    expect(boardDe(h)).toBe('Hooks');
    expect(onglets(h)).toContain('Hooks');
    expect(appel.retours.at(-1)?.[1]).toBe('err');
  });

  it('refus explicite (ok:false) · inchangé · retour au board et raison du serveur', async () => {
    appel.dossier = () => Promise.resolve({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' });
    const h = await ranger('Ailleurs');
    expect(boardDe(h)).toBe('Hooks');
    expect(appel.retours).toEqual([['Annonce introuvable dans les sauvegardes de cette marque · recharge la page.', 'err']]);
  });

  it('succès · inchangé · « Rangé dans » et le nouveau board, onglet ajouté', async () => {
    appel.dossier = () => Promise.resolve({ ok: true });
    const h = await ranger('Ailleurs');
    expect(boardDe(h)).toBe('Ailleurs');
    expect(appel.retours).toEqual([['Rangé dans « Ailleurs ».', undefined]]);
    expect(onglets(h)).toContain('Ailleurs');
  });
});
