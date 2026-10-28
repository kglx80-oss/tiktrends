// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { PageInfo } from '../components/PageInfo';

/**
 * Recette #106 · l'aide repliable (PageInfo, 15 écrans) et les « Filtres » de
 * la Veille · Échap referme et rend le focus au titre ; au doigt l'aide fait
 * 44 px, à la souris elle garde sa taille. Monté en jsdom, on lit l'état.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const pointeur = (tactile: boolean) => { window.matchMedia = ((q: string) => ({ matches: tactile, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; };
const monter = (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); act(() => { root!.render(n); }); return el; };

describe('Aide repliable · Échap et cible', () => {
  it('ouverte, Échap la referme et rend le focus au chip', () => {
    pointeur(false);
    const h = monter(<PageInfo title="Aide"><a href="#x">un lien dans l’aide</a></PageInfo>);
    const d = h.querySelector('details')!; d.open = true;
    const lien = h.querySelector('a')!; lien.focus();
    act(() => { lien.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(d.open, 'Échap ne referme pas l’aide').toBe(false);
    expect(document.activeElement, 'le focus n’est pas rendu au chip').toBe(h.querySelector('summary'));
  });
  it('le focus clavier qui quitte l’aide la referme · sans voler le focus', () => {
    pointeur(false);
    const h = monter(<><PageInfo title="Aide">texte seul</PageInfo><button type="button">après</button></>);
    const d = h.querySelector('details')!; const titre = h.querySelector('summary')!; const apres = h.querySelector('button')!;
    titre.focus(); d.open = true;
    act(() => { apres.focus(); });
    expect(d.open, 'Tab hors de l’aide · la bulle reste ouverte sur la page').toBe(false);
    expect(document.activeElement, 'le focus est détourné').toBe(apres);
  });
  it('le focus qui reste DANS l’aide ne la referme pas', () => {
    pointeur(false);
    const h = monter(<PageInfo title="Aide"><a href="#x">lien</a></PageInfo>);
    const d = h.querySelector('details')!; h.querySelector('summary')!.focus(); d.open = true;
    act(() => { h.querySelector('a')!.focus(); });
    expect(d.open, 'aller au lien de l’aide la referme').toBe(true);
  });
  it('44 px au doigt, taille compacte à la souris', () => {
    pointeur(true);
    let h = monter(<PageInfo>texte</PageInfo>);
    expect(h.querySelector('summary')!.style.minHeight, 'chip trop petit au doigt').toBe(`${CIBLE_TACTILE_MIN}px`);
    act(() => { root!.unmount(); }); el!.remove();
    pointeur(false);
    h = monter(<PageInfo>texte</PageInfo>);
    expect(h.querySelector('summary')!.style.minHeight, 'densité souris perdue').toBe('');
  });
});

// Vague 4 · « Filtres se referme à Échap » est gardé sur la barre de la Veille Spatial
// (`spatial-veille-gestes`) · la page V5 `/veille` est retirée.
