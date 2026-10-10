// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 18B · Veille · ce qu'on VOIT (mesures au navigateur · MATRICE-lot18B) ·
 * le lien vers les annonces du même annonceur, le retour à SA recherche depuis
 * la Veille et le Studio, les filtres de « Ce qui scale » dans l'URL.
 */
vi.mock('../components/InspoButtons', () => ({ SaveButton: () => <button type="button">★</button>, FollowButton: () => <button type="button">+ Suivre</button> }));
const { AdCard } = await import('../components/AdCard');
const { RetourVeille } = await import('../components/RetourVeille');
const { DefileAncreVeille } = await import('../components/DefileAncreVeille');

const AD = { id: 'mock-044', platform: 'meta', status: 'active', daysRunning: 34, advertiserName: 'Brume & Sel', body: 'Routine du soir', landingDomain: 'annonceur3.exemple.test' } as never;
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('Carte de Veille · annonceur et retour (lot 18B)', () => {
  it('en Veille · ancre, recherche interne de l’annonceur, et UN geste de création (« Préparer une création »)', () => {
    const d = dom(renderToStaticMarkup(<AdCard ad={AD} contexteRetour="q=routine&page=2" />));
    expect(d.firstElementChild?.id, 'la carte n’a pas d’ancre · le retour ne retrouve pas la position').toBe('ad-meta-mock-044');
    const ann = [...d.querySelectorAll('a')].find((a) => /Ses annonces dans la Veille/.test(a.textContent ?? ''));
    expect(ann?.getAttribute('href'), 'pas de lien interne vers l’annonceur').toBe('/veille?q=Brume+%26+Sel&p=meta&searchIn=brand&rv=q%3Droutine%26page%3D2%23ad-meta-mock-044');
    expect(ann?.getAttribute('target'), 'lien interne ouvert ailleurs').toBeNull();
    expect(ann?.getAttribute('aria-label'), 'toutes les cartes portent le même nom accessible').toBe('Ses annonces dans la Veille · Brume & Sel');
    expect(d.textContent, 'une recherche présentée comme un suivi').not.toMatch(/concurrent suivi/i);
    // Le panneau « Préparer une création » porte la source ET le retour Veille · pas de second lien.
    expect([...d.querySelectorAll('button')].some((b) => b.textContent?.includes('Préparer une création')), 'le geste de création manque').toBe(true);
    expect(d.querySelector('a[href^="/studio"]'), 'un second geste de création dédouble le bouton').toBeNull();
  });

  it('hors Veille (Nouveautés, découverte…) · aucune ancre, la préparation d’un projet sans contexte de retour', () => {
    const d = dom(renderToStaticMarkup(<AdCard ad={AD} />));
    expect(d.firstElementChild?.id).toBe('');
    expect(d.textContent).not.toMatch(/Ses annonces dans la Veille/);
    const studio = [...d.querySelectorAll('a')].find((a) => (a.getAttribute('href') ?? '').startsWith('/studio/projets/nouveau'))!;
    expect(studio, 'le lien vers la préparation d’un projet manque').toBeTruthy();
    expect(studio.getAttribute('href')).not.toMatch(/depuis=|rv=/);
  });
});

describe('Retour à la recherche (lot 18B)', () => {
  it('dit le terme et vise la carte d’origine', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="q=routine&page=2#ad-meta-mock-044" />));
    const a = d.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/veille?q=routine&page=2#ad-meta-mock-044');
    expect(a.textContent).toContain('« routine »');
  });
  it('une valeur forgée ne sort jamais de la Veille · sans contexte, rien', () => {
    const d = dom(renderToStaticMarkup(<RetourVeille rv="//evil.example/x" />));
    expect(d.querySelector('a')?.getAttribute('href')).toBe('/veille');
    expect(renderToStaticMarkup(<RetourVeille rv={undefined} />)).toBe('');
  });
});

describe('Retour sur la carte d’origine (lot 18B)', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const monter = (hash: string) => {
    window.history.replaceState(null, '', `/veille?q=routine${hash}`);
    document.body.innerHTML = '<main><a href="/">haut</a><div id="ad-meta-mock-044"><a href="/studio/ads">Décline</a></div><div id="autre"></div></main><div id="r"></div>';
    const vues: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { vues.push(this.id); };
    const root = createRoot(document.getElementById('r')!);
    act(() => { root.render(<DefileAncreVeille />); });
    return { vues, root };
  };
  it('l’ancre d’une carte · la carte est recentrée et reçoit le focus', () => {
    const { vues, root } = monter('#ad-meta-mock-044');
    expect(vues, 'le retour laisse la carte hors de l’écran').toEqual(['ad-meta-mock-044']);
    expect(document.activeElement?.id, 'au clavier, la tabulation repart du haut de page').toBe('ad-meta-mock-044');
    act(() => root.unmount());
  });
  it('une ancre qui n’est pas une carte · rien ne bouge', () => {
    const { vues, root } = monter('#autre');
    expect(vues).toEqual([]);
    expect(document.activeElement).toBe(document.body);
    act(() => root.unmount());
  });
});
