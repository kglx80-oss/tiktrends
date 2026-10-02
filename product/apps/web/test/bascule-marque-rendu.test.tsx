// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CLE_FOCUS_BASCULE_MARQUE, ECHEC_BASCULE_MARQUE } from '@tiktrends/core';

/**
 * Lot 14 · registre n° 29 (la bascule de marque ne s'appliquait pas une fois
 * sur deux) et n° 23 (nom de marque tronqué dans le rail).
 *
 * Le défaut vivait dans la transition du routeur client (mesures dans le noyau
 * `bascule-marque`) · on ne peut pas le rejouer dans jsdom. On garde donc ce
 * que le correctif PRODUIT : la page n'est rechargée qu'APRÈS la pose du
 * cookie, jamais sur la marque déjà active, jamais après un échec, et le focus
 * revient au sélecteur au retour. Le nom se lit en entier, sans ellipse.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setActiveBrand = vi.fn<(id: string) => Promise<void>>();
vi.mock('../app/actions/brands', () => ({
  setActiveBrand: (id: string) => setActiveBrand(id),
  createBrandAction: vi.fn(), createBrandFromShopifyAction: vi.fn(),
}));

const { BrandSwitcher, navigateur } = await import('../components/BrandSwitcher');

const LONG = 'Maison Lumière des Herboristes Associés · Collection Printemps-Été Édition Limitée';
const MARQUES = [{ id: 'neva', name: 'Neva' }, { id: 'long', name: LONG }, { id: 'oree', name: 'Orée Cosmétiques' }];

let root: Root | null = null; let el: HTMLDivElement | null = null;
const recharger = vi.fn();
beforeEach(() => { setActiveBrand.mockReset(); recharger.mockReset(); navigateur.recharger = recharger; sessionStorage.clear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

function monter(activeId: string | null) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(<BrandSwitcher brands={MARQUES} activeId={activeId} canManage={false} />); });
  return el;
}
const declencheur = () => el!.querySelector('button[aria-controls="selecteur-marque-liste"]') as HTMLButtonElement;
const option = (nom: string) => [...el!.querySelectorAll('#selecteur-marque-liste button')].find((b) => (b.querySelector(':scope > span:last-child')?.textContent ?? b.textContent) === nom) as HTMLButtonElement;
const ouvrir = () => act(() => { declencheur().click(); });

describe('Sélecteur de marque · bascule par rechargement complet', () => {
  it('recharge la page seulement APRÈS la pose du cookie, une seule fois', async () => {
    let poser!: () => void;
    setActiveBrand.mockImplementation(() => new Promise<void>((r) => { poser = r; }));
    monter('neva'); ouvrir();
    await act(async () => { option('Orée Cosmétiques').click(); });
    expect(setActiveBrand).toHaveBeenCalledWith('oree');
    expect(recharger, 'la page est rechargée avant que le cookie soit posé').not.toHaveBeenCalled();
    expect(declencheur().getAttribute('aria-busy'), 'aucun état « en cours » pendant la pose').toBe('true');
    expect(declencheur().disabled, 'un second clic reste possible pendant la bascule').toBe(true);
    await act(async () => { poser(); });
    expect(recharger, 'la bascule ne recharge pas la page (le routeur souple calait)').toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CLE_FOCUS_BASCULE_MARQUE), 'le retour de focus n’est pas préparé').toBe('1');
  });

  it('la marque déjà active ne recharge rien et rend le focus au sélecteur', async () => {
    monter('neva'); ouvrir();
    await act(async () => { option('Neva').click(); });
    expect(setActiveBrand).not.toHaveBeenCalled();
    expect(recharger).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(declencheur());
  });

  it('un échec ne recharge pas, le dit et rend la main', async () => {
    setActiveBrand.mockRejectedValue(new Error('réseau'));
    monter('neva'); ouvrir();
    await act(async () => { option('Orée Cosmétiques').click(); });
    expect(recharger).not.toHaveBeenCalled();
    expect(el!.querySelector('[role="alert"]')?.textContent).toBe(ECHEC_BASCULE_MARQUE);
    expect(declencheur().disabled).toBe(false);
    expect(document.activeElement).toBe(declencheur());
  });

  it('au retour du rechargement, le focus revient au sélecteur, une seule fois', () => {
    sessionStorage.setItem(CLE_FOCUS_BASCULE_MARQUE, '1');
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 12, top: 110, right: 172, bottom: 154, width: 160, height: 44, x: 12, y: 110, toJSON: () => ({}) } as DOMRect);
    monter('oree');
    rect.mockRestore();
    expect(document.activeElement, 'le focus est perdu au document après la bascule').toBe(declencheur());
    expect(sessionStorage.getItem(CLE_FOCUS_BASCULE_MARQUE)).toBeNull();
  });

  it('à 390 · la coquille passe en tiroir après le montage · le focus va au bouton du menu, pas au sélecteur caché', () => {
    sessionStorage.setItem(CLE_FOCUS_BASCULE_MARQUE, '1');
    const menu = document.createElement('button'); menu.setAttribute('aria-controls', 'nav-rail'); menu.textContent = 'Ouvrir le menu'; document.body.appendChild(menu);
    const mm = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    (window as unknown as { matchMedia: unknown }).matchMedia = mm;
    // Au premier montage, la coquille est encore en disposition bureau · le
    // sélecteur EST à l'écran (comme mesuré sur 959b554) · il ne faut pas s'y fier.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 12, top: 110, right: 172, bottom: 154, width: 160, height: 44, x: 12, y: 110, toJSON: () => ({}) } as DOMRect);
    monter('oree');
    rect.mockRestore();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    expect(document.activeElement, 'le focus part au sélecteur, aussitôt caché dans le tiroir fermé').toBe(menu);
    expect(sessionStorage.getItem(CLE_FOCUS_BASCULE_MARQUE)).toBeNull();
    menu.remove();
  });

  it('Échap ferme la liste et rend le focus au sélecteur', () => {
    monter('neva'); ouvrir();
    expect(declencheur().getAttribute('aria-expanded')).toBe('true');
    act(() => { option('Orée Cosmétiques').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(el!.querySelector('#selecteur-marque-liste')).toBeNull();
    expect(document.activeElement).toBe(declencheur());
  });
});

describe('Sélecteur de marque · nom complet (n° 23)', () => {
  it('le nom long se lit en entier dans le rail et dans la liste, sans ellipse', () => {
    monter('long'); ouvrir();
    const nom = [...declencheur().querySelectorAll('span')].find((s) => s.textContent === LONG)!;
    expect(nom, 'le nom complet n’est pas rendu dans le sélecteur').toBeTruthy();
    for (const s of [nom.getAttribute('style') ?? '', (option(LONG).querySelector(':scope > span:last-child') as HTMLElement).getAttribute('style') ?? '']) {
      expect(s, 'nom tronqué par une ellipse').not.toMatch(/text-overflow:\s*ellipsis|white-space:\s*nowrap/);
      expect(s).toMatch(/overflow-wrap:\s*anywhere/);
    }
    expect(declencheur().getAttribute('aria-label'), 'le nom accessible ne porte pas le nom complet').toBe(`Marque active : ${LONG} · changer de marque`);
  });
  it('les décorations (initiales, flèche) sont cachées aux lecteurs d’écran et chaque option fait 44 px', () => {
    monter('neva'); ouvrir();
    for (const b of el!.querySelectorAll('#selecteur-marque-liste button')) {
      expect((b as HTMLElement).style.minHeight, `option sous 44 px : ${b.textContent}`).toBe('44px');
    }
    const visibles = [...declencheur().childNodes].filter((n) => !(n as HTMLElement).getAttribute?.('aria-hidden')).map((n) => n.textContent).join('');
    expect(visibles).toBe('Neva');
    expect(option('Neva').getAttribute('aria-current')).toBe('true');
  });
});
