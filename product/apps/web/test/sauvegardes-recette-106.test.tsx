// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CIBLE_TACTILE_MIN, messageServiceInactif } from '@tiktrends/core';

/**
 * Recette #106, point 6 · Sauvegardes (Créations, Concurrents suivis,
 * Nouveautés). Mesuré au navigateur avant correctif (390 et 1280, données
 * synthétiques locales) · board et recherche perdus au Retour, boards sans état
 * annoncé, sélecteur de board sans `aria-expanded` et sourd à Échap, onglets
 * sans flèches, nom de concurrent sur 6 lignes, « analyser »/« voir » à 17 px,
 * « Scanner maintenant » actif sans veille (« aucune marque suivie » à tort).
 * On monte les composants (jsdom) et on lit le DOM, l'URL et le focus.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../app/actions/inspo', () => ({ setSavedAdFolder: async () => ({}) }));
vi.mock('../app/actions/tracker', () => ({ scanTrackerAction: async () => ({}), markTrackerSeenAction: async () => {} }));
vi.mock('../app/actions/brief-marque', () => ({ briefMarqueAction: async () => ({}) }));
vi.mock('../components/InspoButtons', () => ({ BrandRemoveButton: () => <button type="button">✕</button> }));
vi.mock('../components/AdCard', () => ({ AdCard: ({ cibles44 }: { cibles44?: boolean }) => <div data-adcard data-cibles44={String(!!cibles44)} /> }));

import { BarreOnglets } from '../components/SavedTabs';
import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import { MarquesSuivies } from '../components/MarquesSuivies';
import { TrackerFeed } from '../components/TrackerFeed';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; window.history.replaceState(null, '', '/saved'); });
const pointeur = (tactile: boolean) => { window.matchMedia = ((q: string) => ({ matches: tactile, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; };
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el; };
const bouton = (h: HTMLElement, t: string) => [...h.querySelectorAll('button')].find((b) => (b.textContent || '').includes(t)) as HTMLButtonElement;

const LONG = 'Hooks UGC qui tiennent plus de soixante jours · à décliner T4';
const item = (n: number, folder: string | null, body = 'texte'): SavedItem => ({ id: `s${n}`, externalId: `e${n}`, platform: 'facebook', folder, ad: { id: `e${n}`, platform: 'facebook', status: 'active', daysRunning: 3, advertiserName: `Marque ${n}`, body } as unknown as SavedItem['ad'] });
const items = [item(1, LONG), item(2, 'Offres', 'Livraison offerte'), item(3, null)];

describe('Onglets · motif ARIA tabs', () => {
  it('un seul arrêt Tab, et → passe au voisin (focus et sélection)', async () => {
    pointeur(false);
    let actif: 'creations' | 'marques' | 'nouveautes' = 'creations';
    const h = await monter(<BarreOnglets actif={actif} onChange={(c) => { actif = c; }} compteurs={{}} />);
    const tabs = [...h.querySelectorAll('[role=tab]')] as HTMLElement[];
    expect(tabs.map((t) => t.tabIndex), 'chaque onglet est un arrêt Tab').toEqual([0, -1, -1]);
    tabs[0]!.focus();
    await act(async () => { tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(actif, '→ ne change pas d’onglet').toBe('marques');
    expect(document.activeElement, '→ ne déplace pas le focus').toBe(tabs[1]);
  });
});

describe('Créations · board et recherche dans l’URL, état annoncé', () => {
  it('l’URL au montage rétablit le board et la recherche', async () => {
    pointeur(false);
    window.history.replaceState(null, '', '/saved?onglet=creations&board=Offres&q=livraison');
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    expect(bouton(h, 'Offres').getAttribute('aria-pressed'), 'le board de l’URL n’est pas rétabli').toBe('true');
    expect((h.querySelector('input[aria-label^="Rechercher"]') as HTMLInputElement).value).toBe('livraison');
  });
  it('choisir un board le REMPLACE dans l’URL, sans empiler · l’état est annoncé', async () => {
    pointeur(false);
    window.history.replaceState(null, '', '/saved?onglet=creations');
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const avant = window.history.length;
    await act(async () => { bouton(h, 'Sans dossier').click(); });
    expect(window.location.search, 'le board choisi n’est pas dans l’URL').toBe('?onglet=creations&board=sans');
    expect(window.history.length, 'choisir un board empile une entrée').toBe(avant);
    expect(bouton(h, 'Sans dossier').getAttribute('aria-pressed')).toBe('true');
    expect(bouton(h, 'Toutes').getAttribute('aria-pressed')).toBe('false');
  });
  it('un board au nom long reste dans la largeur, nom complet au survol', async () => {
    pointeur(true);
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const b = [...h.querySelectorAll('button')].find((x) => x.getAttribute('title') === LONG) as HTMLButtonElement;
    expect(b, 'le board long n’a pas son nom complet au survol').toBeTruthy();
    expect(b.style.maxWidth, 'le board long peut sortir de l’écran').toBe('100%');
    expect(b.style.minHeight, 'board sous 44 px au doigt').toBe(`${CIBLE_TACTILE_MIN}px`);
  });
});

describe('Créations · le routeur Next connaît le board et la recherche', () => {
  it('choisir un board synchronise le routeur (un changement d’onglet ne le perd plus)', async () => {
    const { installerModeleRouteurNext } = await import('./modele-routeur-next');
    pointeur(false);
    window.history.replaceState({ __NA: true }, '', '/saved?onglet=creations');
    const routeur = installerModeleRouteurNext();
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    await act(async () => { bouton(h, 'Offres').click(); });
    routeur.desinstaller();
    expect(routeur.canonique(), 'le routeur ignore le board · sa prochaine écriture l’efface').toBe('/saved?onglet=creations&board=Offres');
  });
});

describe('Sélecteur de board · état et Échap', () => {
  it('aria-expanded suit l’ouverture · Échap referme et rend le focus au bouton', async () => {
    pointeur(false);
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const b = [...h.querySelectorAll('button[aria-expanded]')][0] as HTMLButtonElement;
    expect(b, 'le sélecteur de board n’annonce pas son état').toBeTruthy();
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.focus();
    await act(async () => { b.click(); });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const champ = h.querySelector('input[placeholder="Nouveau board…"]') as HTMLInputElement;
    champ.focus();
    await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(h.querySelector('input[placeholder="Nouveau board…"]'), 'Échap ne referme pas le sélecteur').toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu au bouton').toBe(b);
  });
  it('rangée ailleurs, la créa quitte la vue · le focus revient au board courant, pas en haut de page', async () => {
    pointeur(false);
    window.history.replaceState(null, '', '/saved?board=sans');
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const sel = [...h.querySelectorAll('button[aria-expanded]')][0] as HTMLButtonElement;
    sel.focus();
    await act(async () => { sel.click(); });
    const panneau = document.getElementById(sel.getAttribute('aria-controls')!)!;
    const offres = [...panneau.querySelectorAll('button')].find((x) => x.textContent?.includes('Offres')) as HTMLButtonElement;
    offres.focus();
    await act(async () => { offres.click(); await new Promise((r) => setTimeout(r, 5)); });
    // La seule créa « Sans dossier » est partie · le board s'est vidé, on revient sur « Toutes ».
    expect(bouton(h, 'Toutes').getAttribute('aria-pressed'), '« Sans dossier » vidé · la vue reste bloquée dessus').toBe('true');
    expect(window.location.search).toBe('');
    expect(document.activeElement, 'le focus est perdu (corps de page)').toBe(bouton(h, 'Toutes'));
  });
  it('rangée ailleurs sans vider le board · le focus revient à ce board', async () => {
    pointeur(false);
    window.history.replaceState(null, '', '/saved?board=Offres');
    const h = await monter(<SavedBoards items={[...items, item(4, 'Offres')]} followKeys={[]} />);
    const sel = [...h.querySelectorAll('button[aria-expanded]')][0] as HTMLButtonElement;
    sel.focus();
    await act(async () => { sel.click(); });
    const retirer = [...document.getElementById(sel.getAttribute('aria-controls')!)!.querySelectorAll('button')].find((x) => x.textContent?.includes('Retirer')) as HTMLButtonElement;
    await act(async () => { retirer.click(); await new Promise((r) => setTimeout(r, 5)); });
    expect(document.activeElement, 'le focus est perdu (corps de page)').toBe(bouton(h, 'Offres'));
  });
  it('au doigt, sélecteur et cartes passent à 44 px · à la souris, densité gardée', async () => {
    pointeur(true);
    let h = await monter(<SavedBoards items={items} followKeys={[]} />);
    expect(([...h.querySelectorAll('button[aria-expanded]')][0] as HTMLElement).style.minHeight).toBe(`${CIBLE_TACTILE_MIN}px`);
    expect(h.querySelector('[data-adcard]')!.getAttribute('data-cibles44'), 'la carte garde ses liens à 27 px au doigt').toBe('true');
    act(() => { root!.unmount(); }); el!.remove();
    pointeur(false);
    h = await monter(<SavedBoards items={items} followKeys={[]} />);
    expect(([...h.querySelectorAll('button[aria-expanded]')][0] as HTMLElement).style.minHeight).toBe('24px');
    expect(h.querySelector('[data-adcard]')!.getAttribute('data-cibles44')).toBe('false');
  });
});

describe('Concurrents suivis · nom long et cibles', () => {
  const NOM = 'Maison Laboratoire Dermatologique Végétale de Provence et des Alpes du Sud';
  it('le nom tient sur 2 lignes (complet au survol), la ligne passe à la ligne', async () => {
    pointeur(true);
    const h = await monter(<MarquesSuivies brands={[{ id: 'b1', platform: 'facebook', name: NOM }]} />);
    const nom = [...h.querySelectorAll('span')].find((s) => s.textContent === NOM) as HTMLElement;
    expect(nom.getAttribute('title'), 'nom long sans version complète').toBe(NOM);
    expect(nom.style.webkitLineClamp || nom.style.getPropertyValue('-webkit-line-clamp'), 'nom long sur 6 lignes').toBe('2');
    expect((nom.parentElement as HTMLElement).style.flexWrap, 'les actions sortent de l’écran').toBe('wrap');
  });
  it('« analyser » et « voir » à 44 px au doigt, 24 à la souris', async () => {
    pointeur(true);
    let h = await monter(<MarquesSuivies brands={[{ id: 'b1', platform: 'facebook', name: 'Klôrea' }]} />);
    expect(bouton(h, 'analyser').style.minHeight, '« analyser » sous 44 px au doigt').toBe(`${CIBLE_TACTILE_MIN}px`);
    expect(([...h.querySelectorAll('a')].find((a) => a.textContent === 'voir') as HTMLElement).style.minHeight).toBe(`${CIBLE_TACTILE_MIN}px`);
    act(() => { root!.unmount(); }); el!.remove();
    pointeur(false);
    h = await monter(<MarquesSuivies brands={[{ id: 'b1', platform: 'facebook', name: 'Klôrea' }]} />);
    expect(bouton(h, 'analyser').style.minHeight).toBe('24px');
  });
});

describe('Nouveautés · le scan sans veille active', () => {
  it('bouton inactif, la raison dite · jamais « aucune marque suivie » quand on en suit', async () => {
    pointeur(false);
    const h = await monter(<TrackerFeed events={[]} followedCount={3} trackingEnabled={false} />);
    const b = bouton(h, 'Scanner');
    expect(b.disabled, '« Scanner maintenant » reste actif sans veille').toBe(true);
    expect(h.textContent, 'la raison n’est pas dite').toContain(messageServiceInactif('veille'));
    expect(b.getAttribute('aria-describedby')).toBe('scan-raison');
  });
  it('veille active et marques suivies · le scan reste possible', async () => {
    pointeur(false);
    const h = await monter(<TrackerFeed events={[]} followedCount={3} trackingEnabled />);
    expect(bouton(h, 'Scanner').disabled).toBe(false);
  });
});

describe('Radar créatif · « Retravailler au Studio » (18 px mesurés)', () => {
  it('le lien d’action passe à 44 px au doigt, 24 à la souris, et la page l’utilise', async () => {
    const { LienCible } = await import('../components/LienCible');
    pointeur(true);
    let h = await monter(<LienCible href="/studio/ads">Itérer au Studio ›</LienCible>);
    expect((h.querySelector('a') as HTMLElement).style.minHeight).toBe(`${CIBLE_TACTILE_MIN}px`);
    act(() => { root!.unmount(); }); el!.remove();
    pointeur(false);
    h = await monter(<LienCible href="/studio/ads">Itérer au Studio ›</LienCible>);
    expect((h.querySelector('a') as HTMLElement).style.minHeight).toBe('24px');
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(`${process.cwd()}/app/(app)/radar/page.tsx`, 'utf8');
    expect(src, 'le Radar n’utilise pas le lien à cible').toMatch(/<LienCible href=\{studioHref\}/);
  });
});
