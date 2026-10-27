// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';

/**
 * Spatial · Veille · les GESTES, prouvés au rendu (jsdom) · on clique, on lit le
 * DOM, les adresses poussées et les actions serveur appelées. Le toast ne dit
 * « gardée » qu'après le oui du serveur · un refus remet l'état d'avant.
 */
const nav = vi.hoisted(() => ({ push: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveAd: vi.fn(async () => ({ ok: true })), unsaveAd: vi.fn(async () => ({ ok: true })),
  followBrand: vi.fn(async () => ({ ok: true })), unfollowBrand: vi.fn(async () => ({ ok: true })),
  setSavedAdFolder: vi.fn(async () => ({ ok: true })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: nav.push, refresh: () => {} }) }));
vi.mock('../app/actions/inspo', () => actions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { BarreVeille, CarteVeille, IconeSauvegarde } = await import('../spatial/vues/veille/client');
const { CollectionsSauvegardes } = await import('../spatial/vues/veille/sauvegardes-client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts: string[] = [];
const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); },
};
let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); toasts.length = 0; vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));

const AD: InspoAd = { id: 'a1', platform: 'meta', status: 'active', daysRunning: 34, body: 'Le texte réel de la pub', advertiserName: 'Annonceur' };

describe('Spatial · Veille · sauvegarder', () => {
  it('le marque-page appelle saveAd avec l’instantané, puis le dit', async () => {
    await monter(<IconeSauvegarde ad={AD} initial={false} />);
    const b = racine.querySelector('button.xi')!;
    await cliquer(b);
    expect(actions.saveAd).toHaveBeenCalledWith({ platform: 'meta', externalId: 'a1', snapshot: AD });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(toasts).toEqual(['Pub gardée dans tes sauvegardes']);
  });

  it('un refus du serveur remet le marque-page vide et dit pourquoi · jamais « gardée »', async () => {
    actions.saveAd.mockResolvedValueOnce({ ok: false, error: 'Annonce déjà sauvegardée pour une autre marque' } as never);
    await monter(<IconeSauvegarde ad={AD} initial={false} />);
    const b = racine.querySelector('button.xi')!;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(toasts).toEqual(['Annonce déjà sauvegardée pour une autre marque']);
  });
});

describe('Spatial · Veille · barre de vue', () => {
  const barre = (c = {}) => <BarreVeille criteres={c} plateforme="meta" vue="tout" tri="newest" cpm={9} stat={{ pubs: 2, annonceurs: 1, suite: '' }} />;

  it('« Tendance » pousse la vue tendance · un filtre pousse son critère', async () => {
    await monter(barre({ q: 'café' }));
    await cliquer(bouton('Tendance'));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?q=caf%C3%A9&vue=tendance');
    await cliquer(bouton('Filtres'));
    await cliquer(bouton('Pays'));
    await cliquer(bouton('Suisse', racine.querySelector('.fpanel')!));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?q=caf%C3%A9&country=CH');
  });

  it('le CPM change l’estimation · « Nouvelle vue » est désactivé avec sa raison', async () => {
    await monter(barre());
    await cliquer(bouton('Dépense estimée'));
    await cliquer(bouton('CPM 12 €', racine.querySelector('.fpanel')!));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?cpm=12');
    const nv = bouton('Nouvelle vue')!;
    expect(nv.disabled).toBe(true);
    expect(nv.title).toMatch(/pas encore disponibles/);
  });

  it('une puce active se retire seule', async () => {
    await monter(barre({ p: 'tiktok', media: 'video' }));
    await cliquer([...racine.querySelectorAll('.fsum .chip')].find((b) => b.textContent?.startsWith('Vidéo')));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?p=tiktok');
  });
});

describe('Spatial · Veille · détail d’une pub', () => {
  it('ouvre le détail · relais Jarvis en BROUILLON, export TXT, transcription dite indisponible · Échap ferme', async () => {
    const c = {
      cle: 'meta:a1', ancre: null, ad: AD, marque: { nom: 'Annonceur', initiale: 'A', fond: '#ffb3c7' }, active: true, jours: '34 j', signaux: [],
      pays: null, portee: null, depense: null, croissance: null, texte: AD.body!, image: null, ratio: '' as const, tendance: false, style: 'Image',
      domaine: null, titre: 'Annonceur', cta: null, iterer: '/studio/projets/nouveau', sauvee: false, suivie: false,
      detail: { statut: 'Active', liens: [], kpis: [['Jours actifs', '34 j']] as Array<[string, string]>, lecture: 'Lecture', annonceur: null,
        jarvis: [{ href: '/jarvis/veille?action=cloner&annonce=x', titre: 'Cloner pour ma marque', sous: 'Structure gardée' }], texte: AD.body! },
    };
    await monter(<CarteVeille c={c} coutJarvis="Aucun crédit débité pour la conversation." />);
    expect(document.querySelector('.xmod')).toBeNull();
    await cliquer(racine.querySelector('button.xv'));
    const m = document.querySelector('.xmod')!;
    expect(m).not.toBeNull();
    expect([...m.querySelectorAll('a.xml')].map((a) => a.getAttribute('href'))).toEqual(['/jarvis/veille?action=cloner&annonce=x', `data:text/plain;charset=utf-8,${encodeURIComponent(AD.body!)}`]);
    expect(m.querySelector('[aria-disabled="true"]')?.textContent).toMatch(/Transcription audio indisponible/);
    expect(m.textContent).toMatch(/Aucun crédit débité/);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('.xmod')).toBeNull();
  });
});

describe('Spatial · Sauvegardes · collections', () => {
  const item = (id: string, folder: string | null) => ({
    id, platform: 'meta', externalId: id, ad: { ...AD, id }, folder, marque: { nom: 'A', initiale: 'A', fond: '#ffb3c7' }, source: 'Meta',
    image: null, longue: null, video: false, meta: ['Active · 3 j', 'Image · Meta'] as [string, string], pastilles: [], cloner: '/studio/projets/nouveau',
  });

  it('une collection filtre · ranger appelle setSavedAdFolder puis met les compteurs à jour', async () => {
    await monter(<CollectionsSauvegardes items={[item('x', 'A'), item('y', null)]} creerProjet="/studio/projets/nouveau" />);
    const compte = () => [...racine.querySelectorAll('nav button')].map((b) => b.textContent);
    expect(compte()).toEqual(['Toutes les sauvegardes2', 'A1', 'Non classées1', ' Nouvelle collection']);
    await cliquer(bouton('Non classées'));
    expect(racine.querySelectorAll('article.vitem')).toHaveLength(1);
    await cliquer(bouton('Gardée'));
    await cliquer(bouton('Ranger dans « A »'));
    expect(actions.setSavedAdFolder).toHaveBeenCalledWith({ platform: 'meta', externalId: 'y', folder: 'A' });
    expect(compte()).toEqual(['Toutes les sauvegardes2', 'A2', 'Non classées0', ' Nouvelle collection']);
    expect(toasts).toEqual(['Rangée dans « A »']);
  });

  it('retirer passe par unsaveAd · la carte ne part qu’après le oui', async () => {
    actions.unsaveAd.mockResolvedValueOnce({ ok: false, error: 'Refusé' } as never);
    await monter(<CollectionsSauvegardes items={[item('x', null)]} creerProjet="/p" />);
    await cliquer(bouton('Gardée'));
    await cliquer(bouton('Retirer des sauvegardes'));
    expect(racine.querySelectorAll('article.vitem')).toHaveLength(1);
    expect(toasts).toEqual(['Refusé']);
    await cliquer(bouton('Gardée'));
    await cliquer(bouton('Retirer des sauvegardes'));
    expect(racine.querySelectorAll('article.vitem')).toHaveLength(0);
  });
});
