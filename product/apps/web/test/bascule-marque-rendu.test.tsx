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
const { oublierSaisies } = await import('../components/saisiesEnCours');

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

describe('Changer de marque avec une saisie en cours (lot 15)', () => {
  let main: HTMLElement | null = null;
  const champ = (prerempli = '') => {
    main = document.createElement('main'); document.body.appendChild(main);
    const t = document.createElement('textarea'); t.setAttribute('aria-label', 'Message à Jarvis'); t.value = prerempli; main.appendChild(t);
    return t;
  };
  const taper = (t: HTMLTextAreaElement, v: string) => { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); };
  const dialogue = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
  const bouton = (txt: string) => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === txt) as HTMLButtonElement;
  afterEach(() => { main?.remove(); main = null; oublierSaisies(); });

  it('une saisie tapée demande avant de changer · « Garder » ne touche ni au texte, ni au cookie, ni à la marque', async () => {
    const t = champ(); monter('neva'); taper(t, 'Analyse ma dernière pub');
    ouvrir();
    await act(async () => { option('Orée Cosmétiques').click(); });
    expect(dialogue(), 'la saisie est effacée sans prévenir').toBeTruthy();
    expect(setActiveBrand, 'le cookie change avant la réponse').not.toHaveBeenCalled();
    expect(recharger).not.toHaveBeenCalled();
    expect(dialogue()!.textContent).toContain('« Message à Jarvis »');
    expect(dialogue()!.textContent, 'la valeur saisie est affichée').not.toContain('Analyse ma dernière pub');
    await act(async () => { bouton('Garder ma saisie').click(); });
    expect(dialogue()).toBeNull();
    expect(t.value).toBe('Analyse ma dernière pub');
    expect(setActiveBrand).not.toHaveBeenCalled();
    expect(recharger).not.toHaveBeenCalled();
    expect(declencheur().getAttribute('aria-label')).toBe('Marque active : Neva · changer de marque');
    expect(document.activeElement, 'la main ne revient pas au sélecteur').toBe(declencheur());
  });

  it('« Changer de marque et effacer » bascule, cookie d’abord, puis rechargement', async () => {
    setActiveBrand.mockResolvedValue(undefined);
    const t = champ(); monter('neva'); taper(t, 'brouillon');
    ouvrir();
    await act(async () => { option('Orée Cosmétiques').click(); });
    await act(async () => { bouton('Changer de marque et effacer').click(); });
    expect(setActiveBrand).toHaveBeenCalledWith('oree');
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('un champ prérempli par la page ou vidé par l’utilisateur ne bloque rien', async () => {
    setActiveBrand.mockResolvedValue(undefined);
    champ('texte prérempli par la page');
    const vide = document.createElement('input'); vide.setAttribute('aria-label', 'Recherche'); main!.appendChild(vide);
    monter('neva'); taper(vide as unknown as HTMLTextAreaElement, 'x'); taper(vide as unknown as HTMLTextAreaElement, '');
    ouvrir();
    await act(async () => { option('Orée Cosmétiques').click(); });
    expect(dialogue(), 'une confirmation pour un champ vide ou prérempli').toBeNull();
    expect(recharger).toHaveBeenCalledTimes(1);
  });
});
