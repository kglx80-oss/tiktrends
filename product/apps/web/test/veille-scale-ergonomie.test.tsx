// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SwipeFile, type SwipeItem, type SwipeStats } from '../app/(app)/veille/scale/SwipeFile';

/**
 * Lot ergonomie Veille · on PROUVE deux comportements que la source seule ne
 * dirait pas, en montant le composant dans un DOM (jsdom) et en lisant le
 * résultat après chaque geste · pas la présence d'un appel.
 *
 *  1. Retirer une puce de critère relâche CE critère et rien d'autre · les
 *     autres restent actifs (une puce ≠ le « Réinitialiser » global).
 *  2. Le raccourci « / » met le focus sur la recherche · mais NE capture PAS la
 *     touche quand un champ a déjà le focus (sinon on volerait la frappe).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function monter(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(node));
}

const STATS: SwipeStats = { total: 3, videos: 2, advertisers: 2, spendCumul: '0 €', medianDuration: 0, medianGrowth: 0 };

// Alpha a une statique ET une vidéo · Gamma une vidéo. Croiser type=vidéo et
// annonceur=Alpha ne laisse qu'une créa · c'est le cas qui distingue « retirer
// une puce » de « tout réinitialiser ».
const ITEMS: SwipeItem[] = [
  { ad: { id: 'a', platform: 'meta', status: 'active', daysRunning: 10, mediaType: 'image', advertiserName: 'Alpha' }, angle: 'other', saved: false, following: false },
  { ad: { id: 'b', platform: 'meta', status: 'active', daysRunning: 10, mediaType: 'video', advertiserName: 'Alpha' }, angle: 'other', saved: false, following: false },
  { ad: { id: 'c', platform: 'meta', status: 'active', daysRunning: 10, mediaType: 'video', advertiserName: 'Gamma' }, angle: 'other', saved: false, following: false },
];

const compteur = () => container.textContent?.match(/\d+(?: sur \d+)? créa\(s\)/)?.[0] ?? '';
const parLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`);

describe('Scale · une puce retirée relâche SON critère, pas les autres', () => {
  it('type=vidéo + annonceur=Alpha → retirer « Vidéos » garde Alpha', () => {
    monter(<SwipeFile items={ITEMS} stats={STATS} advertisers={['Alpha', 'Gamma']} niche="café" country="FR" />);

    // Aucun filtre · les 3 créas.
    expect(compteur(), 'sans filtre, le total seul').toBe('3 créa(s)');

    // Filtre type = Vidéos (bouton du segment).
    const btnVideos = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Vidéos')!;
    act(() => btnVideos.click());
    expect(compteur(), 'vidéo seule : b + c').toBe('2 sur 3 créa(s)');

    // Filtre annonceur = Alpha (select contrôlé).
    const selAdv = parLabel('Annonceur') as HTMLSelectElement;
    act(() => { selAdv.value = 'Alpha'; selAdv.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(compteur(), 'vidéo ET Alpha : b seule').toBe('1 sur 3 créa(s)');

    // Retirer la SEULE puce « Vidéos » · le critère annonceur=Alpha doit rester.
    const puceVideos = parLabel('Retirer le critère · Vidéos')!;
    expect(puceVideos, 'la puce du critère type est absente').toBeTruthy();
    act(() => (puceVideos as HTMLButtonElement).click());

    // Alpha seul : a + b · si le clic avait tout réinitialisé, on lirait « 3 créa(s) ».
    expect(compteur(), 'retirer « Vidéos » a aussi relâché Alpha (mauvais)').toBe('2 sur 3 créa(s)');
    expect(parLabel('Retirer le critère · Vidéos'), 'la puce type n’a pas disparu').toBeNull();
    expect(parLabel('Retirer le critère · Alpha'), 'la puce annonceur a disparu à tort').toBeTruthy();
  });
});

describe('Scale · le raccourci « / » ne vole pas la frappe dans un champ', () => {
  it('« / » hors champ met le focus sur la recherche', () => {
    monter(<SwipeFile items={ITEMS} stats={STATS} advertisers={['Alpha', 'Gamma']} niche="café" country="FR" />);
    const recherche = parLabel('Chercher dans le copy') as HTMLInputElement;
    (document.body as HTMLElement).focus();
    expect(document.activeElement, 'départ hors du champ').not.toBe(recherche);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); });
    expect(document.activeElement, '« / » aurait dû focaliser la recherche').toBe(recherche);
  });

  it('« / » avec un select déjà focalisé ne détourne PAS le focus', () => {
    monter(<SwipeFile items={ITEMS} stats={STATS} advertisers={['Alpha', 'Gamma']} niche="café" country="FR" />);
    const recherche = parLabel('Chercher dans le copy') as HTMLInputElement;
    const selTri = parLabel('Trier les créas') as HTMLSelectElement;
    selTri.focus();
    expect(document.activeElement, 'le select doit tenir le focus au départ').toBe(selTri);
    // La touche part DEPUIS le select · le garde doit ignorer et laisser la frappe.
    act(() => { selTri.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); });
    expect(document.activeElement, '« / » dans un champ a volé le focus').toBe(selTri);
    expect(document.activeElement, 'le focus a sauté sur la recherche').not.toBe(recherche);
  });
});

describe('Scale · réinitialiser depuis l’état « zéro résultat » rend le focus au champ', () => {
  it('un reset qui vide les critères ramène le focus sur la recherche', () => {
    monter(<SwipeFile items={ITEMS} stats={STATS} advertisers={['Alpha', 'Gamma']} niche="café" country="FR" />);
    const recherche = parLabel('Chercher dans le copy') as HTMLInputElement;

    // type = Statiques (a) ET annonceur = Gamma (n'a qu'une vidéo) → 0 résultat récupérable.
    const btnStatiques = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Statiques')!;
    act(() => btnStatiques.click());
    const selAdv = parLabel('Annonceur') as HTMLSelectElement;
    act(() => { selAdv.value = 'Gamma'; selAdv.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.textContent, 'l’état zéro résultat doit s’afficher').toContain('Aucune créa pour ces filtres');

    // Le bouton de l’état vide réinitialise · le focus doit revenir au champ.
    const btnReset = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Réinitialiser les filtres')!;
    expect(btnReset, 'le bouton de reset de l’état vide est absent').toBeTruthy();
    act(() => btnReset.click());

    expect(compteur(), 'la liste doit être restaurée').toBe('3 créa(s)');
    expect(document.activeElement, 'après reset le focus n’est pas revenu au champ').toBe(recherche);
  });
});
