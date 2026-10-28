// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * Vignettes Spatial · repli « Aperçu indisponible ». La V5 l'affichait quand
 * l'aperçu d'une pub manquait ou ne chargeait pas ; les vignettes Spatial
 * (Veille, Sauvegardes, Ce qui scale, Radar, fiche concurrent, détail d'une
 * pub) laissaient une case vide. On lit le RÉSULTAT : le HTML rendu sans URL,
 * puis, en jsdom, l'image remplacée par le repli quand son `error` part, et le
 * repli posé quand l'image avait déjà échoué AVANT l'hydratation.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({ saveAd: vi.fn(), unsaveAd: vi.fn(), followBrand: vi.fn(), unfollowBrand: vi.fn(), setSavedAdFolder: vi.fn(), classerFormatSauvegarde: vi.fn() }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Vignette } = await import('../spatial/vues/veille/base');
const { CarteVeille } = await import('../spatial/vues/veille/client');
const { CollectionsSauvegardes } = await import('../spatial/vues/veille/sauvegardes-client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPLI = 'Aperçu indisponible';
const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const AD: InspoAd = { id: 'a1', platform: 'meta', status: 'active', daysRunning: 34, body: 'Texte', advertiserName: 'Annonceur', mediaType: 'image' };
const carte = (image: string | null) => ({
  cle: 'meta:a1', ancre: null, ad: AD, marque: { nom: 'Annonceur', initiale: 'A', fond: 'var(--c1)' }, active: true, jours: '34 j', signaux: [],
  pays: null, portee: null, depense: null, croissance: null, texte: 'Texte', image, ratio: '' as const, tendance: false, style: 'Image',
  domaine: null, titre: 'Annonceur', cta: null, iterer: '/studio', sauvee: false, suivie: false,
  detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'Lecture', annonceur: null, jarvis: [], texte: null },
});

let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); });
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const echouer = async (img: Element | null | undefined) => { expect(img, 'image absente').toBeTruthy(); await act(async () => { img!.dispatchEvent(new Event('error')); }); };

describe('Vignettes Spatial · rendu sans URL', () => {
  it('Vignette sans image · le repli est là, aucune image vide', () => {
    const h = renderToStaticMarkup(<Vignette image={null} />);
    expect(h, 'la vignette sans aperçu reste une case vide').toContain(REPLI);
    expect(h).not.toContain('<img');
  });
  it('Vignette avec image · l’image, sans repli · décorative (le nom de l’annonceur est à côté)', () => {
    const h = renderToStaticMarkup(<Vignette image="https://cdn.test/a.jpg" />);
    expect(h).toMatch(/<img[^>]*src="https:\/\/cdn\.test\/a\.jpg"/);
    expect(h).toMatch(/<img[^>]*alt=""/);
    expect(h).not.toContain(REPLI);
  });
  it('carte de Sauvegardes sans aperçu · le repli est dans la carte', () => {
    const i = { id: 's1', platform: 'meta', externalId: 's1', ad: AD, folder: null, marque: { nom: 'Annonceur', initiale: 'A', fond: 'var(--c1)' }, source: 'Meta', image: null, longue: null, video: false, meta: ['Active · 3 j', 'Image · Meta'] as [string, string], pastilles: [], cloner: '/studio' };
    const h = renderToStaticMarkup(<FournisseurSpatial value={CTX}><CollectionsSauvegardes items={[i]} creerProjet="/studio" /></FournisseurSpatial>);
    expect(h.match(/<article class="vitem">[\s\S]*?<\/article>/)?.[0]).toContain(REPLI);
  });
  it('carte de la Veille sans aperçu · le repli est dans la carte', () => {
    const h = renderToStaticMarkup(<FournisseurSpatial value={CTX}><CarteVeille c={carte(null)} coutJarvis="" /></FournisseurSpatial>);
    expect(h).toContain(REPLI);
  });
});

describe('Vignettes Spatial · l’image ne charge pas', () => {
  it('Vignette · `error` ⇒ le repli remplace l’image', async () => {
    await monter(<Vignette image="https://cdn.test/cassee.jpg" />);
    expect(racine.textContent).not.toContain(REPLI);
    await echouer(racine.querySelector('img'));
    expect(racine.querySelector('img'), 'l’image cassée est restée').toBeNull();
    expect(racine.textContent, 'aucun repli après l’échec de l’image').toContain(REPLI);
  });
  it('une nouvelle URL efface le repli et retente l’image', async () => {
    await monter(<Vignette image="https://cdn.test/cassee.jpg" />);
    await echouer(racine.querySelector('img'));
    await monter(<Vignette image="https://cdn.test/neuve.jpg" />);
    expect(racine.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/neuve.jpg');
    expect(racine.textContent).not.toContain(REPLI);
  });
  it('l’image avait échoué avant l’hydratation (aucun `error` reçu) · le repli est posé au montage', async () => {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete')!;
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    try {
      await monter(<Vignette image="https://cdn.test/deja-cassee.jpg" />);
      expect(racine.querySelector('img')).toBeNull();
      expect(racine.textContent).toContain(REPLI);
    } finally { Object.defineProperty(HTMLImageElement.prototype, 'complete', complete); }
  });
  it('carte de la Veille et son détail · `error` ⇒ le repli remplace l’image, dans la carte puis dans le détail', async () => {
    await monter(<CarteVeille c={carte('https://cdn.test/cassee.jpg')} coutJarvis="" />);
    await echouer(racine.querySelector('.xv .comp img'));
    expect(racine.querySelector('.xv .comp')?.textContent).toContain(REPLI);
    await act(async () => { (racine.querySelector('button.xv') as HTMLElement).click(); });
    await echouer(document.querySelector('.xmod .xmv img'));
    expect(document.querySelector('.xmod .xmv img')).toBeNull();
    expect(document.querySelector('.xmod .xmv')?.textContent).toContain(REPLI);
  });
});
