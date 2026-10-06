// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 19C · message 56 · `unsaveAd` et `setSavedAdFolder` peuvent désormais
 * répondre `ok:false` (rôle, autre marque). Leurs appelants (★ et sélecteur de
 * board de Sauvegardes) ne montrent aucun succès sur un refus · on MONTE les
 * composants (jsdom) et on lit le DOM et les retours émis.
 */
const appel = vi.hoisted(() => ({ unsave: { ok: true } as unknown, dossier: { ok: true } as unknown, retours: [] as Array<[string, string | undefined]> }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async () => ({ ok: true }), unsaveAd: async () => appel.unsave, setSavedAdFolder: async () => appel.dossier,
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

import { SaveButton } from '../components/InspoButtons';
import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.retours = []; });
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el; };
const attendre = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

const ad = { id: 'e1', platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Marque' } as InspoAd;
const items: SavedItem[] = [{ id: 's1', externalId: 'e1', platform: 'meta', folder: 'Hooks', ad }];

async function ranger(dans: string) {
  const h = await monter(<SavedBoards items={items} followKeys={[]} />);
  const ouvrir = h.querySelector('button[aria-expanded]') as HTMLButtonElement;
  await act(async () => { ouvrir.click(); });
  const champ = h.querySelector('input[aria-label="Nom du nouveau board"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, dans);
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { (h.querySelector('button[aria-label="Créer ce board"]') as HTMLButtonElement).click(); });
  await attendre();
  return h;
}

describe('★ retirer · aucun faux succès', () => {
  it('refus du serveur · le ★ reste plein et le refus est dit', async () => {
    appel.unsave = { ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' };
    const h = await monter(<SaveButton ad={ad} initialSaved />);
    const b = h.querySelector('button')!;
    await act(async () => { b.click(); });
    await attendre();
    expect(b.getAttribute('aria-pressed'), 'refusé, le ★ est affiché comme retiré').toBe('true');
    expect(appel.retours).toEqual([['Annonce introuvable dans les sauvegardes de cette marque · recharge la page.', 'err']]);
  });
  it('oui du serveur · ★ vide, aucun retour', async () => {
    appel.unsave = { ok: true };
    const h = await monter(<SaveButton ad={ad} initialSaved />);
    const b = h.querySelector('button')!;
    await act(async () => { b.click(); });
    await attendre();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(appel.retours).toEqual([]);
  });
});

describe('Ranger dans un board · aucun faux succès', () => {
  it('refus du serveur · la créa reste dans son board, aucun « Rangé dans »', async () => {
    appel.dossier = { ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' };
    const h = await ranger('Ailleurs');
    expect(appel.retours.map((r) => r[0]).join(' | '), 'succès annoncé sur un refus').not.toContain('Rangé dans');
    expect(appel.retours).toContainEqual(['Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.', 'err']);
    expect((h.querySelector('button[aria-expanded]') as HTMLElement).textContent, 'la créa a quitté son board malgré le refus').toContain('Hooks');
  });
  it('oui du serveur · « Rangé dans » et le nouveau board', async () => {
    appel.dossier = { ok: true };
    const h = await ranger('Ailleurs');
    expect(appel.retours).toEqual([['Rangé dans « Ailleurs ».', undefined]]);
    expect((h.querySelector('button[aria-expanded]') as HTMLElement).textContent).toContain('Ailleurs');
  });
});
