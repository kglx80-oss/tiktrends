// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * Sauvegardes Spatial · la collection active suit l'adresse (jsdom) · on
 * clique une collection et on lit `location.search` : la collection y est
 * écrite (entrée REMPLACÉE, les autres paramètres gardés), « Toutes » rend une
 * adresse nue. Au montage (retour arrière restauré par le routeur), l'adresse
 * est relue et validée contre les collections réelles.
 */
const actions = vi.hoisted(() => ({ setSavedAdFolder: vi.fn(async () => ({ ok: true })), unsaveAd: vi.fn(async () => ({ ok: true })), classerFormatSauvegarde: vi.fn(async () => ({ ok: true })) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/saved', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/inspo', () => actions);
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { CollectionsSauvegardes } = await import('../spatial/vues/veille/sauvegardes-client');
type Donnee = import('../spatial/vues/veille/sauvegardes-client').SauvegardeDonnees;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const item = (id: string, folder: string | null): Donnee => {
  const ad: InspoAd = { id, platform: 'meta', status: 'active', daysRunning: 3, advertiserName: `Annonceur ${id}` };
  return {
    id, platform: 'meta', externalId: id, ad, folder, marque: { nom: `Annonceur ${id}`, initiale: 'A', fond: 'var(--c1)' }, source: 'Meta',
    image: null, longue: null, video: false, meta: ['Active · 3 j', 'Image · Meta'], pastilles: [], cloner: '/studio/nouveau',
  };
};
const ITEMS = [item('h1', 'Hiver'), item('h2', 'Hiver'), item('e1', 'Été'), item('l1', null)];

let racine: HTMLDivElement; let root: Root;
beforeEach(() => { window.history.replaceState(null, '', '/saved?format=non_classe&tri=ancien'); racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); });
afterEach(() => { act(() => root.unmount()); racine.remove(); });
const monter = async (initiale?: string) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}><CollectionsSauvegardes items={ITEMS} creerProjet="/studio/nouveau" initiale={initiale} /></FournisseurSpatial>); }); };
const collection = (libelle: string) => [...racine.querySelectorAll('nav[aria-label="Collections"] button')].find((b) => b.querySelector('span')?.textContent === libelle) as HTMLButtonElement;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton absent').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const pressee = () => racine.querySelector('nav[aria-label="Collections"] button[aria-pressed="true"] span')?.textContent;

describe('Sauvegardes Spatial · la collection active dans l’adresse', () => {
  it('choisir une collection l’écrit dans l’adresse (format et tri gardés) · « Toutes » la retire · aucune entrée empilée', async () => {
    await monter();
    const longueur = window.history.length;
    await cliquer(collection('Hiver'));
    expect(new URLSearchParams(window.location.search).get('collection'), 'la collection active n’est pas dans l’adresse').toBe('f:Hiver');
    expect(window.location.search).toContain('format=non_classe');
    expect(window.location.search).toContain('tri=ancien');
    await cliquer(collection('Non classées'));
    expect(new URLSearchParams(window.location.search).get('collection')).toBe('none');
    await cliquer(collection('Toutes les sauvegardes'));
    expect(window.location.search).toBe('?format=non_classe&tri=ancien');
    expect(window.history.length).toBe(longueur);
  });

  it('au montage (retour arrière) · l’adresse est relue · une collection inconnue est ignorée et retirée de l’adresse', async () => {
    window.history.replaceState(null, '', '/saved?collection=f%3AHiver');
    await monter();
    expect(pressee(), 'la collection de l’adresse n’est pas relue au montage').toBe('Hiver');
    expect(racine.querySelectorAll('article.vitem')).toHaveLength(2);
    act(() => root.unmount()); root = createRoot(racine);
    window.history.replaceState(null, '', '/saved?collection=f%3AAilleurs&tri=ancien');
    await monter();
    expect(pressee()).toBe('Toutes les sauvegardes');
    expect(window.location.search).toBe('?tri=ancien');
  });
});
