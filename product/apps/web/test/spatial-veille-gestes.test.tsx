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
const vuesActions = vi.hoisted(() => ({
  garderVueVeille: vi.fn(async (_i: { nom: unknown; params: unknown }): Promise<unknown> => ({ ok: true, vues: [], id: 'x' })),
  renommerVueVeilleAction: vi.fn(async (_i: { id: unknown; nom: unknown }): Promise<unknown> => ({ ok: true, vues: [] })),
  supprimerVueVeille: vi.fn(async (_i: { id: unknown }): Promise<unknown> => ({ ok: true, vues: [] })),
}));
vi.mock('../app/actions/veille-vues', () => vuesActions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { BarreVeille, BoutonSuivi, CarteVeille, DefileAncre, IconeSauvegarde } = await import('../spatial/vues/veille/client');
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
  it('vague 4 (ex InspoButtons V5) · double clic pendant l’action · une seule requête, le bouton se désactive', async () => {
    let finir: (v: unknown) => void = () => {};
    actions.saveAd.mockImplementationOnce(() => new Promise((r) => { finir = r; }) as never);
    await monter(<IconeSauvegarde ad={AD} initial={false} />);
    const b = racine.querySelector('button.xi') as HTMLButtonElement;
    await act(async () => { b.click(); b.click(); });
    expect(b.disabled, 'le bouton reste actif pendant l’action').toBe(true);
    await act(async () => { finir({ ok: true }); });
    expect(actions.saveAd).toHaveBeenCalledTimes(1);
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });
  it('vague 4 (ex lot 19C, ★ V5) · panne réseau · le marque-page revient vide, l’échec est dit · retirer, idem', async () => {
    actions.saveAd.mockRejectedValueOnce(new Error('réseau') as never);
    await monter(<IconeSauvegarde ad={AD} initial={false} />);
    const b = racine.querySelector('button.xi')!;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(toasts.at(-1)).toMatch(/^Échec/);
    actions.unsaveAd.mockResolvedValueOnce({ ok: false, error: 'Ton rôle ne permet pas de retirer.' } as never);
    await monter(<IconeSauvegarde key="a2" ad={{ ...AD, id: 'a2' }} initial />);
    const plein = racine.querySelector('button.xi')!;
    await cliquer(plein);
    expect(plein.getAttribute('aria-pressed'), 'un refus de retrait vide le marque-page').toBe('true');
    expect(toasts.at(-1)).toBe('Ton rôle ne permet pas de retirer.');
  });
});

describe('Spatial · Veille · barre de vue', () => {
  const barre = (c = {}) => <BarreVeille criteres={c} plateforme="meta" vue="tout" tri="newest" cpm={9} stat={{ pubs: 2, annonceurs: 1, suite: '' }} vues={[]} />;

  it('« Tendance » pousse la vue tendance · un filtre pousse son critère', async () => {
    await monter(barre({ q: 'café' }));
    await cliquer(bouton('Tendance'));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?q=caf%C3%A9&vue=tendance');
    await cliquer(bouton('Filtres'));
    await cliquer(bouton('Pays'));
    await cliquer(bouton('Suisse', racine.querySelector('.fpanel')!));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?q=caf%C3%A9&country=CH');
  });

  it('le CPM change l’estimation · « Nouvelle vue » est ouvert (plus de « pas encore disponible »)', async () => {
    await monter(barre());
    await cliquer(bouton('Dépense estimée'));
    await cliquer(bouton('CPM 12 €', racine.querySelector('.fpanel')!));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?cpm=12');
    const nv = bouton('Nouvelle vue')!;
    expect(nv.disabled, '« Nouvelle vue » est encore fermé').toBe(false);
    expect(racine.innerHTML).not.toMatch(/pas encore disponible/);
  });

  it('une puce active se retire seule', async () => {
    await monter(barre({ p: 'tiktok', media: 'video' }));
    await cliquer([...racine.querySelectorAll('.fsum .chip')].find((b) => b.textContent?.startsWith('Vidéo')));
    expect(nav.push).toHaveBeenLastCalledWith('/veille?p=tiktok');
  });
  it('vague 4 · Échap referme la liste ouverte, puis le panneau des filtres (comme l’ancien « Filtres »)', async () => {
    await monter(barre());
    const echap = () => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await cliquer(bouton('Filtres'));
    await cliquer(bouton('Pays'));
    expect(racine.querySelector('.fpanel')).not.toBeNull();
    await echap();
    expect(racine.querySelector('.fpanel'), 'Échap n’a pas refermé la liste').toBeNull();
    expect(racine.querySelector('.xfilters'), 'la liste fermée, le panneau doit rester').not.toBeNull();
    await echap();
    expect(racine.querySelector('.xfilters'), 'Échap n’a pas refermé le panneau des filtres').toBeNull();
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
  it('vague 4 · une pub vidéo se lit dans le détail (lecteur réel, aperçu en affiche) · une image reste une image', async () => {
    const base = {
      cle: 'meta:v1', ancre: null, marque: { nom: 'Annonceur', initiale: 'A', fond: '#ffb3c7' }, active: true, jours: '3 j', signaux: [],
      pays: null, portee: null, depense: null, croissance: null, texte: null, image: 'https://cdn.test/v.jpg', ratio: '' as const, tendance: false, style: 'Vidéo',
      domaine: null, titre: 'Annonceur', cta: null, iterer: '/studio', sauvee: false, suivie: false,
      detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'Lecture', annonceur: null, jarvis: [], texte: null },
    };
    await monter(<CarteVeille c={{ ...base, ad: { ...AD, mediaType: 'video', mediaUrl: 'https://cdn.test/v.mp4' } }} coutJarvis="" />);
    await cliquer(racine.querySelector('button.xv'));
    const v = document.querySelector('.xmod .xmv video');
    expect(v?.getAttribute('src')).toBe('https://cdn.test/v.mp4');
    expect(v?.getAttribute('poster')).toBe('https://cdn.test/v.jpg');
    expect(v?.hasAttribute('controls')).toBe(true);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await monter(<CarteVeille c={{ ...base, ad: { ...AD, mediaType: 'image', mediaUrl: 'https://cdn.test/i.jpg' } }} coutJarvis="" />);
    await cliquer(racine.querySelector('button.xv'));
    expect(document.querySelector('.xmod .xmv video')).toBeNull();
    expect(document.querySelector('.xmod .xmv img')?.getAttribute('src')).toBe('https://cdn.test/v.jpg');
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
  it('vague 4 (ex sélecteur de board V5) · aria-expanded suit l’ouverture · Échap referme et rend le focus au bouton', async () => {
    await monter(<CollectionsSauvegardes items={[item('x', 'A'), item('y', null)]} creerProjet="/p" />);
    const b = [...racine.querySelectorAll('article.vitem button[aria-haspopup="menu"]')][0] as HTMLButtonElement;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    b.focus();
    await cliquer(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    (racine.querySelector('[role="menu"] button') as HTMLButtonElement).focus();
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(racine.querySelector('[role="menu"]'), 'Échap ne referme pas le menu').toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu au bouton').toBe(b);
  });
});

describe('Spatial · suivre · vague 4 · un refus se voit (ex « + Suivre » et ✕ V5)', () => {
  it('« Suivre » refusé · le bouton revient à « Suivre » et le refus se dit · accepté · « Suivi »', async () => {
    actions.followBrand.mockResolvedValueOnce({ ok: false, error: 'La Veille est incluse dès l’offre Core.' } as never);
    await monter(<BoutonSuivi plateforme="meta" nom="Rival" ad={{ ...AD, landingDomain: 'rival.fr' }} initial={false} />);
    const b = racine.querySelector('button[aria-pressed]') as HTMLButtonElement;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed'), '« Suivi » affiché malgré le refus').toBe('false');
    expect(b.textContent).toBe('Suivre');
    expect(toasts.at(-1)).toBe('La Veille est incluse dès l’offre Core.');
    await cliquer(b);
    expect(actions.followBrand).toHaveBeenLastCalledWith({ platform: 'meta', name: 'Rival', externalId: undefined, logoUrl: undefined, domain: 'rival.fr' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toBe('Suivi');
  });
  it('ne plus suivre refusé · la marque reste suivie et le refus se dit', async () => {
    actions.unfollowBrand.mockResolvedValueOnce({ ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille.' } as never);
    await monter(<BoutonSuivi plateforme="meta" nom="Rival" initial />);
    const b = racine.querySelector('button[aria-pressed]') as HTMLButtonElement;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(toasts.at(-1)).toBe('Ton rôle ne permet pas d’utiliser la Veille.');
  });
});

describe('Spatial · Pubs du moment · vague 4 · retour sur la carte d’origine (ex lot 18B)', () => {
  const ouvrir = async (hash: string) => {
    window.history.replaceState(null, '', `/veille?q=routine${hash}`);
    racine.innerHTML = '';
    const page = document.createElement('main');
    page.innerHTML = '<a href="/">haut</a><article id="ad-meta-mock-044"><a href="/studio">Itérer</a></article><div id="autre"></div>';
    document.body.prepend(page);
    const vues: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { vues.push(this.id); };
    await monter(<DefileAncre />);
    return vues;
  };
  it('l’ancre d’une carte · la carte est recentrée et reçoit le focus', async () => {
    const vues = await ouvrir('#ad-meta-mock-044');
    expect(vues, 'le retour laisse la carte hors de l’écran').toEqual(['ad-meta-mock-044']);
    expect(document.activeElement?.id, 'au clavier, la tabulation repart du haut de page').toBe('ad-meta-mock-044');
  });
  it('Pubs du moment monte le retour · arrivée sur l’ancre, la carte rendue reçoit le focus', async () => {
    const { PubsDuMoment } = await import('../spatial/vues/veille/PubsDuMoment');
    window.history.replaceState(null, '', '/veille?q=routine#ad-meta-mock-044');
    Element.prototype.scrollIntoView = function () {};
    const carte = {
      cle: 'meta:mock-044', ancre: 'ad-meta-mock-044', ad: { ...AD, id: 'mock-044' }, marque: { nom: 'B', initiale: 'B', fond: '#ffb3c7' }, active: true, jours: '3 j', signaux: [],
      pays: null, portee: null, depense: null, croissance: null, texte: null, image: null, ratio: '' as const, tendance: false, style: 'Image',
      domaine: null, titre: 'B', cta: null, iterer: '/studio', sauvee: false, suivie: false,
      detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'L', annonceur: null, jarvis: [], texte: null },
    };
    await monter(<PubsDuMoment sous="s" pastilleRadar={null} recherche={{ phrase: '', compris: null, suggestions: [] }} cartes={[carte]} vide={null} pages={null} coutJarvis=""
      barre={{ criteres: {}, plateforme: 'meta', vue: 'tout', tri: 'newest', cpm: 9, stat: { pubs: 1, annonceurs: 1, suite: '' }, vues: [] }} />);
    expect(document.activeElement?.id, 'Pubs du moment ne ramène pas sur la carte d’origine').toBe('ad-meta-mock-044');
  });
  it('une ancre qui n’est pas une carte · rien ne bouge', async () => {
    const vues = await ouvrir('#autre');
    expect(vues).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Spatial · Pubs du moment · vague 4 · annonceur et ancre de la carte (ex lot 18B, carte V5)', () => {
  it('la carte porte son ancre · le détail mène aux pubs du même annonceur dans la Veille', async () => {
    const c = {
      cle: 'meta:mock-044', ancre: 'ad-meta-mock-044', ad: { ...AD, id: 'mock-044', advertiserName: 'Brume & Sel' }, marque: { nom: 'Brume & Sel', initiale: 'B', fond: '#ffb3c7' }, active: true, jours: '34 j', signaux: [],
      pays: null, portee: null, depense: null, croissance: null, texte: null, image: null, ratio: '' as const, tendance: false, style: 'Image',
      domaine: null, titre: 'Brume & Sel', cta: null, iterer: '/studio/projets/nouveau', sauvee: false, suivie: false,
      detail: { statut: 'Active', liens: [], kpis: [] as Array<[string, string]>, lecture: 'L', annonceur: '/veille?q=Brume+%26+Sel&searchIn=brand&rv=q%3Droutine', jarvis: [], texte: null },
    };
    await monter(<CarteVeille c={c} coutJarvis="" />);
    expect(racine.querySelector('article.xa')?.id).toBe('ad-meta-mock-044');
    await cliquer(racine.querySelector('button.xv'));
    const lien = [...document.querySelectorAll('.xmod a')].find((a) => a.textContent === 'Toutes les pubs Brume & Sel');
    expect(lien?.getAttribute('href')).toBe('/veille?q=Brume+%26+Sel&searchIn=brand&rv=q%3Droutine');
  });
});

describe('Spatial · Veille · vues enregistrées (« Nouvelle vue »)', () => {
  type Vue = { id: string; nom: string; params: Record<string, string>; creeLe: string };
  const V = (id: string, nom: string, params: Record<string, string>): Vue => ({ id, nom, params, creeLe: '2026-10-29T10:00:00.000Z' });
  const barreV = (criteres: Record<string, unknown>, vues: Vue[]) => <BarreVeille criteres={criteres} plateforme="meta" vue={(criteres.vue as 'tendance' | undefined) ?? 'tout'} tri="newest" cpm={9} stat={{ pubs: 2, annonceurs: 1, suite: '' }} vues={vues} />;
  const panneau = () => racine.querySelector('[role=dialog][aria-label="Vues enregistrées"]');
  const saisir = async (champ: HTMLInputElement, valeur: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const soumettre = async (f: HTMLFormElement) => { await act(async () => { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
  const onglet = (nom: string) => [...racine.querySelectorAll('.xtabs button')].find((b) => b.textContent === nom) as HTMLButtonElement | undefined;
  // Une réponse préparée et non consommée (test qui tombe) ne doit pas fuir dans le suivant.
  beforeEach(() => { for (const f of Object.values(vuesActions)) f.mockReset(); });

  it('état vide honnête · sans filtre, rien à garder (la raison est dite, le bouton fermé)', async () => {
    await monter(barreV({}, []));
    await cliquer(bouton('Nouvelle vue'));
    const p = panneau()!;
    expect(p, 'le panneau des vues ne s’ouvre pas').not.toBeNull();
    expect(p.textContent).toContain('Aucune vue gardée pour l’instant');
    expect(p.textContent).toContain('Aucun filtre à garder · sans critère, c’est déjà « Toutes les pubs ».');
    expect(bouton('Garder cette vue', p)!.disabled).toBe(true);
  });

  it('garder · le nom et les paramètres CANONIQUES partent (jamais la page) · l’onglet apparaît, signalé actif', async () => {
    const criteres = { country: 'BE', media: 'video', page: 3 };
    vuesActions.garderVueVeille.mockResolvedValueOnce({ ok: true, id: 'v1', vues: [V('v1', 'Belgique vidéo', { media: 'video', country: 'BE' })] });
    await monter(barreV(criteres, []));
    await cliquer(bouton('Nouvelle vue'));
    const p = panneau()!;
    expect([...p.querySelectorAll('.chip')].map((c) => c.textContent), 'le panneau ne dit pas ce qui sera gardé').toEqual(['Belgique', 'Vidéo']);
    await saisir(p.querySelector('input')!, ' Belgique vidéo ');
    await soumettre(p.querySelector('form')!);
    expect(vuesActions.garderVueVeille).toHaveBeenCalledWith({ nom: ' Belgique vidéo ', params: { media: 'video', country: 'BE' } });
    expect(toasts.at(-1)).toBe('Vue « Belgique vidéo » gardée');
    const o = onglet('Belgique vidéo');
    expect(o, 'la vue gardée n’apparaît pas dans la barre').toBeDefined();
    expect(o!.getAttribute('aria-pressed'), 'la vue de l’écran n’est pas signalée').toBe('true');
    expect(onglet('Toutes les pubs')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('un refus du serveur · la liste ne change pas, la raison est dite', async () => {
    vuesActions.garderVueVeille.mockResolvedValueOnce({ ok: false, error: 'Une vue s’appelle déjà « Belgique ».' });
    await monter(barreV({ country: 'CH' }, [V('v1', 'Belgique', { country: 'BE' })]));
    await cliquer(bouton('Nouvelle vue'));
    await saisir(panneau()!.querySelector('input')!, 'Belgique');
    await soumettre(panneau()!.querySelector('form')!);
    expect(toasts.at(-1)).toBe('Une vue s’appelle déjà « Belgique ».');
    expect([...racine.querySelectorAll('.xtabs button')].map((b) => b.textContent)).toEqual(['Toutes les pubs', 'Tendance', 'Suivies', 'Belgique', 'Nouvelle vue']);
  });

  it('ouvrir une vue applique ses paramètres (navigation vers son adresse) · hors de son adresse, elle n’est pas signalée', async () => {
    await monter(barreV({ q: 'café' }, [V('v1', 'Tendance Belgique', { vue: 'tendance', country: 'BE' })]));
    const o = onglet('Tendance Belgique')!;
    expect(o.getAttribute('aria-pressed')).toBe('false');
    await cliquer(o);
    expect(nav.push).toHaveBeenLastCalledWith('/veille?country=BE&vue=tendance');
  });

  it('supprimer demande confirmation · non → rien ne part · oui → l’identifiant part, l’onglet disparaît', async () => {
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await monter(barreV({}, [V('v1', 'Belgique', { country: 'BE' }), V('v2', 'Vidéo', { media: 'video' })]));
    await cliquer(bouton('Nouvelle vue'));
    vuesActions.supprimerVueVeille.mockResolvedValueOnce({ ok: true, vues: [V('v2', 'Vidéo', { media: 'video' })] });
    await cliquer(panneau()!.querySelector('[aria-label="Supprimer la vue Belgique"]'));
    expect(vuesActions.supprimerVueVeille).not.toHaveBeenCalled();
    expect(confirmer).toHaveBeenLastCalledWith('Supprimer la vue « Belgique » ? Les annonces ne changent pas · seul ce raccourci disparaît.');
    await cliquer(panneau()!.querySelector('[aria-label="Supprimer la vue Belgique"]'));
    expect(vuesActions.supprimerVueVeille).toHaveBeenCalledWith({ id: 'v1' });
    expect(onglet('Belgique'), 'l’onglet supprimé reste affiché').toBeUndefined();
    expect(onglet('Vidéo')).toBeDefined();
    expect(toasts.at(-1)).toBe('Vue « Belgique » supprimée');
    confirmer.mockRestore();
  });

  it('renommer · le nouveau nom part avec l’identifiant, l’onglet suit la liste du serveur', async () => {
    await monter(barreV({}, [V('v1', 'Belgique', { country: 'BE' })]));
    await cliquer(bouton('Nouvelle vue'));
    await cliquer(panneau()!.querySelector('[aria-label="Renommer la vue Belgique"]'));
    vuesActions.renommerVueVeilleAction.mockResolvedValueOnce({ ok: true, vues: [V('v1', 'Belgique FR', { country: 'BE' })] });
    const champ = panneau()!.querySelector('input[aria-label="Nouveau nom de la vue Belgique"]') as HTMLInputElement;
    await saisir(champ, 'Belgique FR');
    await soumettre(champ.form!);
    expect(vuesActions.renommerVueVeilleAction).toHaveBeenCalledWith({ id: 'v1', nom: 'Belgique FR' });
    expect(onglet('Belgique FR')).toBeDefined();
  });
});
