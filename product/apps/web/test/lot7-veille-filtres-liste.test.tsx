// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';
import type { CarteVeilleDonnees } from '../spatial/vues/veille/types';

/**
 * Lot 7 V5 · Veille · filtres LOCAUX, vue liste, précédente / suivante dans le
 * détail · prouvés en RENDANT les vraies vues (jsdom) · « Pubs du moment »
 * entière, « Ce qui scale », les exemples d'un style et le suivi libre du
 * Radar. On choisit, on clique, on tape des touches, on lit le DOM · jamais
 * « une fonction est appelée quelque part ».
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveAd: vi.fn(async () => ({ ok: true })), unsaveAd: vi.fn(async () => ({ ok: true })),
  followBrand: vi.fn(async (_i: unknown) => ({ ok: true }) as { ok: boolean; error?: string }), unfollowBrand: vi.fn(async () => ({ ok: true })),
  setSavedAdFolder: vi.fn(async () => ({ ok: true })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => nav, useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/inspo', () => actions);
vi.mock('../app/actions/adsmap-hypotheses', () => ({ creerHypotheseAction: vi.fn(async () => ({ ok: true, adId: 'x' })), completerHypotheseAction: vi.fn() }));
vi.mock('../app/actions/veille-vues', () => ({ garderVueVeille: vi.fn(), renommerVueVeilleAction: vi.fn(), supprimerVueVeille: vi.fn() }));
vi.mock('../app/actions/brief-marque', () => ({ briefMarqueAction: vi.fn() }));
vi.mock('../app/actions/tracker', () => ({ markTrackerSeenAction: vi.fn(), scanTrackerAction: vi.fn() }));
vi.mock('../app/actions/decouverte', () => ({ decouverteMarcheAction: vi.fn() }));
vi.mock('../app/actions/layout-marche', () => ({ grammaireCategorieAction: vi.fn() }));
vi.mock('../app/actions/video-marche', () => ({ grammaireVideoAction: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { PubsDuMoment } = await import('../spatial/vues/veille/PubsDuMoment');
const { ScaleInteractif } = await import('../spatial/vues/veille/scale-client');
const { ExemplesFormat } = await import('../spatial/vues/formats/exemples-client');
const { SuivreMarqueLibre } = await import('../spatial/vues/veille/radar-client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts: string[] = [];
const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); },
};
let racine: HTMLDivElement; let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/veille?q=piscine');
  document.cookie = 'tt_veille_affichage=; max-age=0; path=/';
  racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); toasts.length = 0; vi.clearAllMocks();
});
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
const choisir = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('menu absent');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const taper = async (el: Element | null | undefined, v: string) => {
  if (!el) throw new Error('champ absent');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const touche = async (key: string, cible: EventTarget = document.body) => { await act(async () => { cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
const apresFocus = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };
const menu = (libelle: string) => racine.querySelector(`[data-filtre-local="${libelle}"] select`) as HTMLSelectElement | null;
const compte = () => racine.querySelector('[data-compte-local]')?.textContent ?? '';

/* ───────────────────────── données simulées ───────────────────────── */

type O = { cta: string | null; sauvee?: boolean; video?: boolean; hypothese?: boolean };
function carte(i: number, o: O): CarteVeilleDonnees {
  const ad: InspoAd = { id: `a${i}`, platform: i % 2 ? 'tiktok' : 'meta', status: 'active', daysRunning: 10 + i, body: `Texte ${i}`, advertiserName: `Marque ${i}`, mediaType: o.video ? 'video' : 'image', callToAction: o.cta ?? undefined };
  return {
    cle: `${ad.platform}:${ad.id}`, ancre: null, ad, marque: { nom: `Marque ${i}`, initiale: 'M', fond: 'var(--acc)' }, active: true, jours: `${10 + i} j`, signaux: [],
    pays: 'FR', plateforme: i % 2 ? 'TikTok' : 'Meta', portee: null, depense: null, croissance: null, texte: `Texte ${i}`, image: null, ratio: '', tendance: false, style: 'Image',
    domaine: null, titre: `Marque ${i}`, cta: o.cta, iterer: '/studio/projets/nouveau', sauvee: !!o.sauvee, suivie: false,
    detail: { statut: 'Active', liens: [], kpis: [], lecture: 'Lecture', annonceur: null, jarvis: [], texte: null, ...(o.hypothese ? { hypothese: { ouvert: true as const, raison: null } } : {}) },
  };
}
// Ordre de la source · 0..5. « Acheter » · 0, 2, 3, 5 · sauvegardées · 2, 4.
const CARTES = [
  carte(0, { cta: 'Acheter', hypothese: true }), carte(1, { cta: 'En savoir plus' }), carte(2, { cta: 'Acheter', sauvee: true }),
  carte(3, { cta: 'Acheter', video: true }), carte(4, { cta: null, sauvee: true }), carte(5, { cta: 'Acheter' }),
];
const page = (o: { cartes?: CarteVeilleDonnees[]; affichage?: 'grille' | 'liste' } = {}) => (
  <PubsDuMoment sous="Recherche" pastilleRadar={null} recherche={{ phrase: '', compris: null, suggestions: [] }}
    barre={{ criteres: { q: 'piscine' }, plateforme: 'meta', vue: 'tout', tri: 'newest', cpm: 9, stat: { pubs: 6, annonceurs: 6, suite: '' }, vues: [] }}
    cartes={o.cartes ?? CARTES} vide={null} pages={null} coutJarvis="Aucun crédit"
    local={{ initial: { cta: null, masquerSauvees: false, plateforme: null, pays: null, diffusionMin: null, suiviesSeulement: false }, affichage: o.affichage ?? 'grille', cle: '/veille?q=piscine' }} />
);
const grille = () => [...racine.querySelectorAll('.xgrid article.xa')].map((a) => a.querySelector('.xn strong')!.textContent);
const liste = () => [...racine.querySelectorAll('[data-ligne-liste]')].map((l) => l.querySelector('b')!.textContent);
const dialogue = () => document.querySelector('.xmod[role="dialog"]');
const navigation = () => document.querySelector('[data-barre-nav-detail] [role="status"]')?.textContent ?? '';

/* ───────────────────────── filtres locaux ───────────────────────── */

describe('Pubs du moment · filtres locaux (VB V19, V21)', () => {
  it('appel à l’action puis « Masquer déjà sauvegardées » · seules les pubs attendues, compteur juste, adresse tenue · Réinitialiser rend tout', async () => {
    await monter(page());
    expect(grille()).toEqual(['Marque 0', 'Marque 1', 'Marque 2', 'Marque 3', 'Marque 4', 'Marque 5']);
    expect(compte()).toBe('6 pubs chargées · filtre sur cette page, la recherche n’est pas relancée');

    await choisir(menu('Appel à l’action'), 'Acheter');
    expect(grille(), 'le filtre d’appel à l’action ne garde pas les bonnes pubs').toEqual(['Marque 0', 'Marque 2', 'Marque 3', 'Marque 5']);
    expect(compte()).toBe('4 sur 6 pubs chargées · filtre sur cette page, la recherche n’est pas relancée');
    expect(new URLSearchParams(window.location.search).get('cta'), 'le filtre n’est pas gardé dans l’adresse').toBe('Acheter');
    expect(new URLSearchParams(window.location.search).get('q'), 'la recherche de la source est perdue').toBe('piscine');

    await cliquer(bouton('Masquer déjà sauvegardées', racine));
    expect(grille(), 'les pubs déjà sauvegardées restent').toEqual(['Marque 0', 'Marque 3', 'Marque 5']);
    expect(compte()).toMatch(/^3 sur 6 pubs chargées/);
    // L'état visible · une puce par filtre posé.
    expect([...racine.querySelectorAll('[data-filtres-locaux] .chip.on[aria-label]')].map((b) => b.textContent)).toEqual(['Appel à l’action · Acheter', 'Sans les pubs déjà sauvegardées']);
    expect(window.location.search).toContain('masquer=sauvees');
    expect(nav.push, 'un filtre local a relancé la page (nouvelle requête à la source)').not.toHaveBeenCalled();

    await cliquer(racine.querySelector('[data-reinitialiser-local]'));
    expect(grille(), 'la réinitialisation ne rend pas toutes les pubs').toHaveLength(6);
    expect(compte()).toMatch(/^6 pubs chargées/);
    expect(window.location.search).toBe('?q=piscine');
  });

  it('un filtre qui ne séparerait rien reste fermé, raison écrite à côté', async () => {
    await monter(page({ cartes: [carte(0, { cta: 'Acheter' }), carte(1, { cta: 'Acheter' })] }));
    const m = menu('Appel à l’action')!;
    expect(m.disabled, 'un filtre qui ne sépare rien n’est pas fermé').toBe(true);
    expect(document.getElementById(m.getAttribute('aria-describedby')!)!.textContent).toBe('Toutes ces pubs ont le même appel à l’action · « Acheter »');
    const masquer = bouton('Masquer déjà sauvegardées', racine)!;
    expect(masquer.getAttribute('aria-disabled')).toBe('true');
    await cliquer(masquer);
    expect(grille()).toHaveLength(2);
    expect(document.getElementById(masquer.getAttribute('aria-describedby')!)!.textContent).toBe('Aucune de ces pubs n’est dans tes sauvegardes');
  });

  it('tous filtrés · l’état vide le dit et réinitialise', async () => {
    await monter(page({ cartes: [carte(0, { cta: 'Acheter', sauvee: true }), carte(1, { cta: 'Contact', sauvee: true })] }));
    await cliquer(bouton('Masquer déjà sauvegardées', racine));
    expect(racine.querySelector('[data-vide-local] h3')!.textContent).toBe('Aucune pub chargée ne passe ces filtres');
    await cliquer(bouton('Réinitialiser les filtres', racine));
    expect(grille()).toHaveLength(2);
  });
});

/* ───────────────────────── vue liste ───────────────────────── */

describe('Pubs du moment · bascule grille / liste (VB V26, V28)', () => {
  it('la liste montre les mêmes pubs dans le même ordre, filtres compris · le choix est gardé sur l’appareil', async () => {
    await monter(page());
    await choisir(menu('Appel à l’action'), 'Acheter');
    const enGrille = grille();
    await cliquer(bouton('Liste', racine));
    expect(racine.querySelector('.xgrid')).toBeNull();
    expect(liste(), 'la liste ne reprend pas les pubs de la grille dans son ordre').toEqual(enGrille);
    expect(document.cookie).toContain('tt_veille_affichage=liste');
    // Les colonnes lues sur l'annonce · plateforme, format, diffusion, appel à l'action.
    const l3 = [...racine.querySelectorAll('[data-ligne-liste="tiktok:a3"] [role="cell"]')].map((c) => c.textContent);
    expect(l3.slice(1, 5)).toEqual(['TikTok', 'Vidéo', '13 j · active', 'Acheter']);
    // Le tableau défile dans son cadre (pas la page).
    expect((racine.querySelector('[data-table="veille-liste"]') as HTMLElement).style.overflowX).toBe('auto');
    await cliquer(bouton('Grille', racine));
    expect(grille()).toEqual(enGrille);
  });

  it('la préférence lue au rendu ouvre la liste directement', async () => {
    await monter(page({ affichage: 'liste' }));
    expect(liste()).toEqual(['Marque 0', 'Marque 1', 'Marque 2', 'Marque 3', 'Marque 4', 'Marque 5']);
    expect(bouton('Liste', racine)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('la plateforme se lit sur la carte, à côté du pays (VB C02)', async () => {
    await monter(page());
    expect([...racine.querySelectorAll('.xgrid .xc')].slice(0, 2).map((x) => x.textContent)).toEqual(['FR · Meta', 'FR · TikTok']);
  });
});

/* ───────────────────────── précédente / suivante ───────────────────────── */

describe('Pubs du moment · précédente / suivante dans la liste filtrée (VB F16)', () => {
  it('parcourt la liste FILTRÉE, s’arrête aux bornes avec la raison, et rend le focus à la pub d’origine', async () => {
    await monter(page());
    await choisir(menu('Appel à l’action'), 'Acheter'); // 0, 2, 3, 5
    await cliquer(bouton('Masquer déjà sauvegardées', racine)); // 0, 3, 5
    const origine = racine.querySelector('[data-ouvrir-detail="meta:a0"]') as HTMLElement;
    await cliquer(origine);
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 0');
    expect(navigation(), 'la position ne compte pas la liste filtrée').toBe('Pub 1 sur 3 · Première pub de la liste');
    const prec = document.querySelector('[data-nav-detail="precedente"]') as HTMLButtonElement;
    expect(prec.getAttribute('aria-disabled'), 'la borne n’est pas fermée').toBe('true');
    await cliquer(prec);
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 0');

    await cliquer(document.querySelector('[data-nav-detail="suivante"]'));
    expect(dialogue()!.getAttribute('aria-label'), 'la suivante ne respecte pas la liste filtrée (Marque 1 et 2 sont filtrées)').toBe('Pub Marque 3');
    expect(navigation()).toBe('Pub 2 sur 3');

    await touche('ArrowRight');
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 5');
    expect(navigation()).toBe('Pub 3 sur 3 · Dernière pub de la liste');
    await touche('ArrowRight');
    expect(dialogue()!.getAttribute('aria-label'), 'la navigation boucle au lieu de s’arrêter').toBe('Pub Marque 5');
    await touche('ArrowLeft');
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 3');

    await touche('Escape');
    await apresFocus();
    expect(dialogue()).toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu à la pub d’origine').toBe(origine);
  });

  it('les flèches sont ignorées dans un champ de saisie (formulaire d’hypothèse du détail)', async () => {
    await monter(page());
    await cliquer(racine.querySelector('[data-ouvrir-detail="meta:a0"]'));
    await cliquer(bouton('Ajouter aux hypothèses'));
    const champ = document.querySelector('.xmod textarea') as HTMLTextAreaElement;
    champ.focus();
    await touche('ArrowRight', champ);
    expect(dialogue()!.getAttribute('aria-label'), 'une flèche tapée dans un champ a changé de pub').toBe('Pub Marque 0');
    await touche('ArrowRight');
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 1');
  });

  it('depuis la vue liste · « Voir » ouvre le détail, la navigation suit l’ordre de la liste, le focus revient au bouton de la ligne', async () => {
    await monter(page({ affichage: 'liste' }));
    const voir = racine.querySelector('[data-ligne-liste="tiktok:a1"] [data-ouvrir-detail]') as HTMLElement;
    await cliquer(voir);
    expect(navigation()).toBe('Pub 2 sur 6');
    await cliquer(document.querySelector('[data-nav-detail="suivante"]'));
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 2');
    await cliquer(document.querySelector('.xmod .xmx'));
    await apresFocus();
    expect(document.activeElement).toBe(voir);
  });

  it('les boutons de navigation sont des cibles de 44 px', async () => {
    await monter(page());
    await cliquer(racine.querySelector('[data-ouvrir-detail="meta:a0"]'));
    for (const b of document.querySelectorAll<HTMLElement>('[data-nav-detail]')) expect(b.style.minHeight).toBe('44px');
  });
});

/* ───────────────────────── Ce qui scale ───────────────────────── */

describe('Ce qui scale · clic sur une ligne → le détail, parcouru dans la liste filtrée (VB SC05)', () => {
  it('« Vidéos » filtre · la suivante saute les images', async () => {
    const lignes = CARTES.map((c, i) => ({
      cle: c.cle, rang: i + 1, image: null, accroche: `Accroche ${i}`, detail: `Marque ${i}`, part: 50, jours: c.jours, cloner: '/studio/projets/nouveau',
      o: { video: c.ad.mediaType === 'video' || i === 5, annonceur: `Marque ${i}`, angle: 'other' as const, texte: c.texte!, jours: 10 + i, croissance: 0, reach: 0, depense: 0 },
      ad: c.ad, sauvee: false, suivie: false, site: null, biblio: null, carte: c,
    }));
    await monter(<ScaleInteractif lignes={lignes} initial={{ type: 'all', annonceur: 'all', angle: 'all', texte: '', tri: 'duration' }} annonceurs={[]} angles={[]} coutJarvis="Aucun crédit" />);
    await cliquer(bouton('Vidéos', racine)); // 5 et 3, rangées par durée (15 j, 13 j)
    expect([...racine.querySelectorAll('.srow')].map((r) => r.getAttribute('data-ligne'))).toEqual(['tiktok:a5', 'tiktok:a3']);
    const origine = racine.querySelector('[data-ouvrir-detail="tiktok:a5"]') as HTMLElement;
    await cliquer(origine);
    expect(dialogue()!.getAttribute('aria-label')).toBe('Pub Marque 5');
    expect(navigation(), 'la position ne compte pas les lignes filtrées de Ce qui scale').toBe('Pub 1 sur 2 · Première pub de la liste');
    await touche('ArrowRight');
    expect(dialogue()!.getAttribute('aria-label'), 'la suivante ne suit pas la liste filtrée et triée').toBe('Pub Marque 3');
    await touche('Escape');
    await apresFocus();
    expect(document.activeElement).toBe(origine);
  });
});

/* ───────────────────────── page d'un style ───────────────────────── */

describe('Page d’un style · filtres des exemples (VB FO07)', () => {
  const ex = (i: number, f: { plateforme: string; pays: string | null; jours: number; suivie: boolean }) => ({
    id: `s${i}`, annonceur: { nom: `Annonceur ${i}`, initiale: 'A', couleur: 'var(--acc)' }, pays: f.pays, vignette: null, longue: f.jours >= 30,
    diffusion: `Active · ${f.jours} j`, iterer: '/studio/projets/nouveau', filtre: f,
  });
  const EX = [ex(0, { plateforme: 'meta', pays: 'FR', jours: 45, suivie: true }), ex(1, { plateforme: 'tiktok', pays: 'FR', jours: 8, suivie: false }), ex(2, { plateforme: 'meta', pays: 'BE', jours: 20, suivie: false })];
  const vus = () => [...racine.querySelectorAll('.vfeed .vitem .who')].map((w) => w.childNodes[1]!.textContent);

  it('plateforme, diffusion, marques suivies · seules les attendues, compteur juste, réinitialisation', async () => {
    window.history.replaceState(null, '', '/veille/formats/avap');
    await monter(<ExemplesFormat exemples={EX} />);
    await choisir(menu('Plateforme'), 'meta');
    expect(vus()).toEqual(['Annonceur 0', 'Annonceur 2']);
    await choisir(menu('Diffusion'), '30');
    expect(vus()).toEqual(['Annonceur 0']);
    expect(compte()).toBe('1 sur 3 pubs chargées · sur les exemples affichés');
    expect(window.location.search).toBe('?plateforme=meta&diffusion=30');
    await cliquer(racine.querySelector('[data-reinitialiser-local]'));
    expect(vus()).toEqual(['Annonceur 0', 'Annonceur 1', 'Annonceur 2']);
    await cliquer(bouton('Marques suivies seulement', racine));
    expect(vus()).toEqual(['Annonceur 0']);
  });

  it('sans donnée de filtre · les contrôles restent fermés, raison écrite', async () => {
    await monter(<ExemplesFormat exemples={EX.map(({ filtre: _f, ...e }) => e)} />);
    expect(menu('Plateforme')!.disabled).toBe(true);
    expect(racine.querySelector('[data-filtre-local="Plateforme"] small')!.textContent).toBe('La plateforme de ces pubs n’est pas connue');
  });
});

/* ───────────────────────── Radar ───────────────────────── */

describe('Radar · « Suivre une marque » en saisie libre (VB RD01)', () => {
  it('un domaine et une plateforme · le même suivi qu’un « Suivre » de pub, dit au oui du serveur', async () => {
    await monter(<SuivreMarqueLibre />);
    await taper(racine.querySelector('[data-suivre-libre] input'), 'https://www.Typology.com/fr');
    await choisir(racine.querySelector('[data-suivre-libre] select'), 'tiktok');
    await cliquer(bouton('Suivre', racine));
    expect(actions.followBrand).toHaveBeenCalledWith({ platform: 'tiktok', name: 'typology.com', domain: 'typology.com' });
    expect(toasts).toEqual(['typology.com ajouté au Radar']);
    expect(nav.refresh).toHaveBeenCalled();
    expect((racine.querySelector('[data-suivre-libre] input') as HTMLInputElement).value).toBe('');
  });

  it('une saisie vide ou un refus du serveur · rien n’est dit réussi, la raison s’affiche', async () => {
    await monter(<SuivreMarqueLibre />);
    await cliquer(bouton('Suivre', racine));
    expect(actions.followBrand).not.toHaveBeenCalled();
    expect(racine.querySelector('[role="alert"]')!.textContent).toBe('Écris le nom de la marque ou son domaine (2 caractères au moins).');
    actions.followBrand.mockResolvedValueOnce({ ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille.' });
    await taper(racine.querySelector('[data-suivre-libre] input'), 'Typology');
    await cliquer(bouton('Suivre', racine));
    expect(racine.querySelector('[role="alert"]')!.textContent).toBe('Ton rôle ne permet pas d’utiliser la Veille.');
    expect(toasts).toEqual([]);
  });
});
