// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Message 72 · après le rollback d'un rangement (et à la bascule #106), l'onglet
 * rendu focalisé passait SOUS la barre haute collante.
 *
 * Mesuré au navigateur sur a3361d12 (refus réel, marque active changée) · barre
 * haute (HEADER sticky) en bas à 65 px aux trois largeurs · onglet « Hooks »
 * focalisé à −1,2 → 31,5 à 1440 et 1280, `elementFromPoint` au centre =
 * « Rechercher » · à 390, 337,5 → 381,5, visible. `focus()` ne défile pas un
 * élément déjà dans la vue.
 *
 * On MONTE Sauvegardes et on lit le résultat · le style RENDU de chaque onglet
 * porte la marge sous la barre haute (`scroll-margin-top`), et l'onglet focalisé
 * est ramené (`scrollIntoView({block:'start'})`) quand sa boîte est sous la
 * barre · laissé en place quand il est visible. La mesure au navigateur confirme.
 */
const appel = vi.hoisted(() => ({ repondre: () => {}, defile: [] as Array<{ onglet: string; block: unknown }>, haut: 0 }));
vi.mock('../app/actions/inspo', () => ({
  setSavedAdFolder: () => new Promise((ok) => { appel.repondre = () => ok({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' }); }),
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
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.defile = []; window.history.replaceState(null, '', '/saved'); });
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
// La position d'un onglet, telle que mesurée au navigateur · jsdom n'a pas de mise en page.
HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
  const t = this.closest('[role="group"][aria-label="Boards"]') ? appel.haut : 0;
  return { top: t, bottom: t + 33, left: 0, right: 80, width: 80, height: 33, x: 0, y: t, toJSON() {} } as DOMRect;
};
(HTMLElement.prototype as unknown as { scrollIntoView: (o?: unknown) => void }).scrollIntoView = function (this: HTMLElement, o?: unknown) {
  appel.defile.push({ onglet: (this.textContent || '').replace(/\s*·?\s*\d+$/, '').trim(), block: (o as { block?: unknown } | undefined)?.block });
};

const ad = (id: string) => ({ id, platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'Marque ' + id }) as InspoAd;
const items: SavedItem[] = [
  { id: 's1', externalId: 'e1', platform: 'meta', folder: 'Hooks', ad: ad('e1') },
  { id: 's2', externalId: 'e2', platform: 'meta', folder: null, ad: ad('e2') },
];
const onglets = (h: HTMLElement) => [...h.querySelectorAll('[role="group"][aria-label="Boards"] button')] as HTMLButtonElement[];

async function rollback(haut: number) {
  appel.haut = haut;
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
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  appel.defile = [];
  await act(async () => { appel.repondre(); });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return h;
}

describe('Onglet rendu focalisé · jamais sous la barre haute', () => {
  it('chaque onglet RENDU porte la marge sous la barre haute (65 mesurés + anneau 4 · 80)', async () => {
    const h = await rollback(337.5);
    for (const b of onglets(h)) {
      expect(b.getAttribute('style') ?? '', `l’onglet « ${b.textContent} » n’a pas de marge sous la barre haute · il s’arrête dessous`).toMatch(/scroll-margin-top:\s*80px/);
    }
  });

  it('onglet sous la barre (mesuré · −1,2) · focalisé ET ramené au début (scrollIntoView block:start)', async () => {
    const h = await rollback(-1.2);
    expect(document.activeElement?.textContent?.replace(/\s*·?\s*\d+$/, '').trim(), 'le focus n’est pas sur l’onglet d’origine').toBe('Hooks');
    expect(appel.defile, 'l’onglet focalisé reste sous la barre haute · rien ne le ramène').toContainEqual({ onglet: 'Hooks', block: 'start' });
    expect(onglets(h).find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent?.replace(/\s*·?\s*\d+$/, '').trim()).toBe('Hooks');
  });

  it('onglet déjà visible (390 · 337,5) · focalisé, la page ne saute pas', async () => {
    await rollback(337.5);
    expect(document.activeElement?.textContent?.replace(/\s*·?\s*\d+$/, '').trim()).toBe('Hooks');
    expect(appel.defile, 'la page défile pour un onglet déjà visible').toEqual([]);
  });
});
