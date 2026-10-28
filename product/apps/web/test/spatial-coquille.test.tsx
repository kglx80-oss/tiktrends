// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { entreesRail, entreesRailEspace, modulesMobiles, type GroupePalette } from '@tiktrends/core';
import { squelette, fragmentReference } from './spatial/parite';

/**
 * Spatial · les SURCOUCHES de la coquille (rubrique A) · parité de structure
 * avec la maquette, et comportement (ouverture, Échap, focus, aucun envoi
 * automatique, vraies actions appelées).
 *
 * Les fragments de référence `docs/spatial/reference/_notifications.html`,
 * `_profil.html`, `_palette*.html`, `_feuille-*.html`, `_jarvis*.html`,
 * `_onb-*.html` sont le DOM de la maquette CAPTURÉ dans un navigateur
 * (Playwright) après le geste qui l'ouvre (clic sur la cloche, ⌘K, `openOnb(i)`…)
 * · le `_coquille.html` de la fondation ne contient que les panneaux vides.
 *
 * Écarts ASSUMÉS, chacun nommé et vérifié (le retrait échoue s'il ne trouve
 * rien · un écart disparu doit sortir de la liste) :
 *  · retirés de la RÉFÉRENCE · ce que la maquette simule sans donnée ni action
 *    réelle (préférences et suppression de notification, aperçu de rôle, scan
 *    de boutique, secteur, Dropbox, sièges, facture annuelle, l'étape « Tes 3
 *    premières pubs ») ;
 *  · retirés du RENDU · ce que l'outil réel ajoute (coût Jarvis annoncé avant
 *    l'envoi, « Mon profil », filtre Support, champ « Nom de la marque »,
 *    cinquième profil du catalogue V5).
 */

const h = vi.hoisted(() => ({
  chemin: '/dashboard',
  push: vi.fn(), refresh: vi.fn(),
  setActiveBrand: vi.fn(async () => {}),
  fetchNotifications: vi.fn(async () => ({ items: [] as unknown[], unread: 0 })),
  markAll: vi.fn(async () => {}), markOne: vi.fn(async () => {}),
  thread: vi.fn(async () => ({ thread: { turns: [], starters: ['Propose trois angles', 'Résume ma fiche'], measuredAds: 0, brandName: 'Neva', contexte: {}, conversationId: null, conversations: [] } })),
  projets: vi.fn(async () => ({ ok: true, projets: [{ id: 'p1', title: 'Collection été' }] })),
  save: vi.fn(async () => ({ ok: true as const, brandId: 'b-new' })),
}));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => h.chemin, useRouter: () => ({ push: h.push, refresh: h.refresh }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: h.setActiveBrand }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: h.fetchNotifications, markAllNotificationsRead: h.markAll, markNotificationRead: h.markOne }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: h.projets }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: h.thread }));
vi.mock('../app/actions/onboarding', () => ({ saveOnboardingAction: h.save }));
vi.mock('../app/actions/connections', () => ({ getConnectionState: async () => null }));
vi.mock('../app/actions/drive', () => ({ getDriveState: async () => ({ available: false, connected: false, folderName: null }) }));
vi.mock('../app/actions/stripe', () => ({ createCheckoutAction: async () => {} }));

import { Coquille, type DonneesCoquille } from '../spatial/coquille/Coquille';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { VueNotifications } from '../spatial/coquille/Notifications';
import { FeuilleMarques, FeuilleModules, MenuProfil, Palette } from '../spatial/coquille/Surcouches';
import { VueTiroirJarvis, type VueTiroirJarvisProps } from '../spatial/coquille/TiroirJarvis';
import { Bienvenue } from '../spatial/vues/coquille/Bienvenue';
import { ParcoursAccueil, type ParcoursAccueilProps } from '../spatial/vues/coquille/ParcoursAccueil';
import type { NotifItem } from '../app/actions/notifications';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ───────────────────────── outils de comparaison ───────────────────────── */

type Retrait = string | ((r: Element) => Element[]);
/** Retire des éléments d'un HTML · chaque retrait DOIT trouver au moins un élément (un écart disparu se voit). */
function retirer(html: string, retraits: Retrait[]): string {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const racine = t.content as unknown as Element;
  for (const r of retraits) {
    const els = typeof r === 'string' ? [...racine.querySelectorAll(r)] : r(racine);
    if (!els.length) throw new Error(`retrait sans effet · ${typeof r === 'string' ? r : r.toString()}`);
    els.forEach((e) => e.remove());
  }
  return t.innerHTML;
}
const ref = (route: string, retraits: Retrait[] = []) => retirer(fragmentReference(route), retraits);
const egal = (rendu: string, reference: string, selecteur?: string) => expect(squelette(rendu, { selecteur })).toEqual(squelette(reference, { selecteur }));

/**
 * Une icône ou une teinte qui suit la DONNÉE (le type réel d'une notification,
 * l'option d'un catalogue) se compare comme un texte · on neutralise, des DEUX
 * côtés, la classe `t-…` et l'icône du sprite sous le sélecteur donné. La
 * structure (pastille, icône présente ou orbe « J ») reste comparée.
 */
function neutraliser(html: string, selecteur: string): string {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const els = [...t.content.querySelectorAll(selecteur)];
  if (!els.length) throw new Error(`neutralisation sans effet · ${selecteur}`);
  for (const e of els) {
    [...e.classList].filter((c) => c.startsWith('t-')).forEach((c) => e.classList.remove(c));
    e.querySelectorAll('use').forEach((u) => u.setAttribute('href', '#i-donnee'));
  }
  return t.innerHTML;
}

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const rien = () => {};

/* ───────────────────────── 1 · notifications ───────────────────────── */

const MAINTENANT = new Date(2026, 9, 27, 15, 0);
const il = (h_: number) => new Date(MAINTENANT.getTime() - h_ * 3_600_000).toISOString();
// Même forme que la maquette · 3 non lues et 1 lue aujourd'hui, 3 lues plus tôt.
const NOTIFS: NotifItem[] = [
  { id: '1', type: 'digest', title: 'Récap', body: 'Texte', href: '/dashboard', read: false, createdAt: il(0.1) },
  { id: '2', type: 'ticket_new', title: 'Ticket', body: 'Texte', href: '/support/1', read: false, createdAt: il(1) },
  { id: '3', type: 'ticket_reply', title: 'Réponse', body: 'Texte', href: '/support/1', read: false, createdAt: il(3) },
  { id: '4', type: 'tracker', title: '5 nouvelles pubs', body: 'Texte', href: '/saved', read: true, createdAt: il(4) },
  { id: '5', type: 'digest', title: 'Récap', body: 'Texte', href: '/dashboard', read: true, createdAt: il(24) },
  { id: '6', type: 'radar', title: 'Radar', body: 'Texte', href: '/adsmap/radar', read: true, createdAt: il(25) },
  { id: '7', type: 'ticket_status', title: 'Statut', body: 'Texte', href: '/support/1', read: true, createdAt: il(72) },
];
const vueNotifs = (items: NotifItem[], filtre: 'tout' | 'veille' = 'tout') => rendre(
  <section className="notif glass" id="notif" aria-label="Notifications">
    <VueNotifications items={items} nonLues={items.filter((n) => !n.read).length} filtre={filtre} maintenant={MAINTENANT} onFiltre={rien} onToutLire={rien} onOuvrir={rien} onMarquer={rien} />
  </section>,
);
// La maquette simule · préférences, suppression, étiquette « Nouveauté », et deux filtres sans émetteur réel.
const REF_NOTIFS: Retrait[] = ['#nprefs', 'button.nx', '.nmeta .pill', '[data-nf="result"]', '[data-nf="update"]'];

describe('Spatial · surcouches · parité avec la maquette', () => {
  it('Notifications · liste, groupes, non lues, filtres réels', () => {
    egal(neutraliser(retirer(vueNotifs(NOTIFS), ['[data-nf="support"]']), '.nic'), neutraliser(ref('_notifications', REF_NOTIFS), '.nic'));
  });

  it('Notifications · un filtre vide dit « Tu es à jour »', () => {
    const rendu = vueNotifs(NOTIFS.filter((n) => n.type !== 'tracker' && n.type !== 'radar'), 'veille');
    expect(squelette(rendu, { selecteur: '.nlist' })).toEqual(squelette(fragmentReference('_notifications-vide'), { selecteur: '.nlist' }));
  });

  it('Profil · vrai utilisateur, vrais liens · sans aperçu de rôle', () => {
    const rendu = rendre(<section className="notif glass memenu" id="memenu" aria-label="Profil"><MenuProfil utilisateur={CTX.utilisateur} equipe="/team" forfaits="/billing" demarrage="/onboarding?redo=1" deconnexion={async () => {}} /></section>);
    // Le choix du thème (au DOM de l'aperçu du rôle) est garé à part · `spatial-theme-clair.test.tsx`.
    egal(retirer(rendu, ['a[href="/profile"]', 'a[href="/support"]', '#ngrp-theme', '[data-zone="choix-theme"]', '[role="status"]']), ref('_profil', ['.ngrp', '.nprefs']));
    expect(rendu, 'le support de l’espace n’est plus atteignable depuis la coquille').toContain('href="/support"');
  });

  it('Palette ⌘K · trois groupes, première entrée sélectionnée', () => {
    const e = (cle: string, icone: string) => ({ cle, href: `/${cle}`, icone, titre: cle });
    const groupes: GroupePalette[] = [
      { titre: 'Pages', entrees: [['a', 'home'], ['b', 'brush'], ['c', 'eye'], ['d', 'chart'], ['e', 'loop'], ['f', 'flask'], ['g', 'q'], ['h', 'bulb'], ['i', 'folder'], ['j', 'chat'], ['k', 'tag'], ['l', 'gear']].map(([c, i]) => e(c!, i!)) },
      { titre: 'Projets', entrees: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((c) => e(c, 'brush')) },
      { titre: 'Actions', entrees: [['x1', 'loop'], ['x2', 'plus'], ['x3', 'down'], ['x4', 'check']].map(([c, i]) => e(c!, i!)) },
    ];
    egal(rendre(<Palette groupes={groupes} onNaviguer={rien} onFermer={rien} />), ref('_palette'));
    egal(rendre(<Palette groupes={groupes} onNaviguer={rien} onFermer={rien} requeteInitiale="zzzz" />), ref('_palette-vide'));
  });

  it('Feuilles · « Changer de marque » et « Tous les modules »', () => {
    egal(rendre(<div className="sheet glass" id="sheet"><FeuilleMarques marques={[{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }]} active="a" ajouter="/brands/new" onChoisir={rien} /></div>), ref('_feuille-marques'));
    const tout = new Set(['/veille', '/assets', '/brands', '/settings']);
    egal(rendre(<div className="sheet glass" id="sheet"><FeuilleModules modules={modulesMobiles({ ouverts: tout, marque: { id: 'b1' } })} /></div>), ref('_feuille-modules'));
  });

  const tiroir = (p: Partial<VueTiroirJarvisProps>) => rendre(
    <aside id="jdraw" className="jdraw glass" aria-label="Jarvis">
      <VueTiroirJarvis sousTitre="Conversation · Neva" creer="/studio/projets/nouveau" tours={[]} partiel={null} statut={null} erreur={null}
        suggestions={['A', 'B', 'C']} saisie="" enCours={false} onSaisie={rien} onEnvoyer={rien} onSuggestion={rien} onCopier={rien} onCreer={rien} onFermer={rien} {...p} />
    </aside>,
  );
  // Ajout réel · le coût de la conversation, annoncé sous le champ AVANT l'envoi.
  const SANS_COUT = ['form.jdf > small'];

  it('Jarvis · tiroir à l’ouverture (création repliée, suggestions, champ)', () => {
    egal(retirer(tiroir({}), SANS_COUT), ref('_jarvis'));
  });

  it('Jarvis · une question, une réponse (copier)', () => {
    egal(retirer(tiroir({ tours: [{ id: '1', moi: true, texte: 'q' }, { id: '2', moi: false, texte: 'r' }] }), SANS_COUT), ref('_jarvis-fil'));
  });

  it('Jarvis · pendant la réponse (points d’attente)', () => {
    egal(retirer(tiroir({ tours: [{ id: '1', moi: true, texte: 'q' }, { id: '2', moi: false, texte: 'r' }, { id: '3', moi: true, texte: 'x' }], partiel: '' }), SANS_COUT), ref('_jarvis-attente'));
  });

  it('Bienvenue · l’écran sous le parcours (scan et pub d’exemple retirés)', () => {
    const rendu = rendre(<Bienvenue site="neva.fr" marque={{ nom: 'Neva', logoUrl: 'https://x/l.png', resume: 'Lunettes', aEmployer: ['a', 'b'], aEviter: ['c'] }} premierTest="/studio/projets/nouveau" fiche={null} />);
    // Ajout · tuile 3, une phrase honnête à la place de la pub d'exemple.
    const sansAjout = retirer(rendu, [(r) => [...r.querySelectorAll('.onb > section:nth-child(3) > p.faint')]]);
    // Retraits · la barre de scan simulée (« 72 % ») et la pub fictive de départ.
    // React hisse un `<link rel=preload>` pour l'image · on compare la vue.
    egal(sansAjout, ref('bienvenue', ['.prog', '.onb .ad']), 'div.view');
  });
});

/* ───────────────────────── 2 · parcours d'accueil (#onb) ───────────────────────── */

const REPONSES = { profile: 'brand', goals: ['ads', 'analyze'], brandName: '', siteUrl: '', adLevel: 'teste', teamSize: '' };
const FORMULES = ['core', 'plus', 'business'].map((cle, i) => ({ cle, nom: cle, prix: 99, populaire: i === 1, lignes: ['1', '2', '3', '4'] }));
const PARCOURS: ParcoursAccueilProps = {
  prenom: 'Kevin', etapes: ['bienvenue', 'profil', 'objectifs', 'marque', 'outils', 'offre'], reponses: REPONSES,
  marqueExiste: true, marqueNom: 'Neva',
  connecteurs: [
    { cle: 'meta', nom: 'Meta Ads', sous: 'Résultats publicitaires', connecte: false, href: '/api/oauth/meta' },
    { cle: 'shopify', nom: 'Shopify', sous: 'neva.fr', connecte: true, href: '/connections' },
    { cle: 'gdrive', nom: 'Google Drive', sous: 'Assets', connecte: false, href: '/api/oauth/google' },
  ],
  offre: { formules: FORMULES, essai: 'Sans engagement.', soldeGratuit: 300 },
};
const parcours = (depart: number) => rendre(<ParcoursAccueil {...PARCOURS} depart={depart} />);
// « Tes 3 premières pubs » (6e des 7 étapes de la maquette) est omise · son trait de progression aussi.
const SANS_ETAPE_PUBS: Retrait = (r) => [r.querySelectorAll('.obprog i')[5]!].filter(Boolean);

describe('Spatial · parcours d’accueil · parité avec la maquette', () => {
  it('Bienvenue', () => egal(parcours(0), ref('_onb-0', [SANS_ETAPE_PUBS])));
  it('Ton profil · 4 profils comparés (le catalogue V5 en a 5, ses icônes suivent ses options)', () => egal(
    neutraliser(retirer(parcours(1), ['[data-obp="other"]']), '.obopt .ico'),
    neutraliser(ref('_onb-1', [SANS_ETAPE_PUBS]), '.obopt .ico'),
  ));
  it('Tes objectifs', () => egal(parcours(2), ref('_onb-2', [SANS_ETAPE_PUBS])));
  it('Ta marque · nom ajouté, scan et secteur retirés', () => egal(
    retirer(parcours(3), ['#obnomf']),
    ref('_onb-3', [SANS_ETAPE_PUBS, '[data-obscango]', '#obscanbox', (r) => [...r.querySelectorAll('[data-obs]')].slice(0, 1).map((b) => b.closest('.obfield')!)]),
  ));
  it('Tes outils · trois connecteurs réels (Dropbox retiré)', () => egal(parcours(4), ref('_onb-4', [SANS_ETAPE_PUBS, (r) => [r.querySelector('[data-cconn="dropbox"]')!.closest('.obapp')!]])));
  it('Ton offre · sans facture annuelle ni sièges', () => egal(parcours(5), ref('_onb-6', [
    SANS_ETAPE_PUBS, '.obpay > .seg', (r) => [...r.querySelectorAll('.obpl > span[style]')],
  ])));

  it('la garde voit un écart · retirer une classe de la maquette la fait tomber', () => {
    expect(squelette(parcours(2))).not.toEqual(squelette(ref('_onb-2', [SANS_ETAPE_PUBS]).replace('class="obchips"', 'class="x"')));
    expect(squelette(vueNotifs(NOTIFS))).not.toEqual(squelette(ref('_notifications', REF_NOTIFS)));
  });
});

/* ───────────────────────── 3 · comportement ───────────────────────── */

let racine: Root | null = null;
let hote: HTMLDivElement;
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote);
  vi.clearAllMocks();
});
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); document.body.className = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { racine = createRoot(hote); racine.render(n); }); };
const touche = async (key: string, o: KeyboardEventInit = {}) => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...o })); }); };
const clic = async (el: Element | null) => { if (!el) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); };
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });

function donnees(): DonneesCoquille {
  const ouverts = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings', '/team', '/billing']);
  const marque = { id: 'b1', nom: 'Neva' };
  return {
    entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
    marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }, { id: 'b2', nom: 'Autre' }],
    peutGererMarques: true, admin: false, passer: null, railOuvert: true,
    utilisateur: CTX.utilisateur, espaceNom: 'GLX', credits: CTX.credits, nonLues: 0, deconnexion: async () => {},
    ouverts: [...ouverts], jarvis: true, demarrage: '/onboarding?redo=1',
  };
}
const EnTeteFactice = () => null;

describe('Spatial · coquille · comportement des surcouches', () => {
  it('sur un écran Admin, le Tour de contrôle est allumé (radmin on, comme la maquette) · ailleurs non', async () => {
    h.chemin = '/admin/churn';
    try {
      await monter(<Coquille donnees={{ ...donnees(), admin: true }}><EnTeteFactice /></Coquille>);
      const r = document.getElementById('radmin')!;
      expect([r.className, r.getAttribute('aria-current')]).toEqual(['radmin on', 'page']);
    } finally { h.chemin = '/dashboard'; }
  });
  it('hors Admin, le Tour de contrôle reste éteint', async () => {
    await monter(<Coquille donnees={{ ...donnees(), admin: true }}><EnTeteFactice /></Coquille>);
    expect(document.getElementById('radmin')!.className).toBe('radmin');
  });

  it('⌘K ouvre la palette (focus dans le champ), les flèches déplacent la sélection, Échap ferme et rend le focus', async () => {
    await monter(<Coquille donnees={donnees()}><button id="avant">x</button></Coquille>);
    (document.getElementById('avant') as HTMLElement).focus();
    await touche('k', { metaKey: true });
    await attendre();
    expect(document.getElementById('pal')).not.toBeNull();
    expect(document.activeElement?.id).toBe('palin');
    expect(h.projets).toHaveBeenCalledWith({ brandId: 'b1', limite: 6 });
    expect(document.querySelector('#palres a.on')?.textContent).toContain('Accueil');
    expect(document.body.textContent).toContain('Collection été');
    await act(async () => { document.getElementById('palin')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.querySelector('#palres a.on')?.textContent).toContain('Studios');
    await touche('Escape');
    await attendre();
    expect(document.getElementById('pal')).toBeNull();
    expect(document.activeElement?.id).toBe('avant');
  });

  it('la cloche ouvre les VRAIES notifications · « Tout lire » appelle l’action, Échap ferme et rend le focus à la cloche', async () => {
    h.fetchNotifications.mockResolvedValue({ items: [NOTIFS[0]!, NOTIFS[3]!], unread: 1 });
    const { EnTete } = await import('../spatial/communs');
    await monter(<Coquille donnees={donnees()}><EnTete titre="T" /></Coquille>);
    await attendre();
    const bell = document.getElementById('bell')!;
    bell.focus();
    await clic(bell);
    await attendre();
    const panneau = document.getElementById('notif')!;
    expect(panneau.hidden).toBe(false);
    expect(document.activeElement).toBe(panneau);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    expect(panneau.querySelectorAll('article.nit')).toHaveLength(2);
    await clic(document.getElementById('nall'));
    expect(h.markAll).toHaveBeenCalledTimes(1);
    await touche('Escape');
    await attendre();
    expect(panneau.hidden).toBe(true);
    expect(document.activeElement).toBe(bell);
  });

  it('le profil s’ouvre sur l’avatar et se ferme d’un clic à côté', async () => {
    const { EnTete } = await import('../spatial/communs');
    await monter(<Coquille donnees={donnees()}><EnTete titre="T" /><p id="ailleurs">x</p></Coquille>);
    await clic(document.getElementById('me'));
    const menu = document.getElementById('memenu')!;
    expect(menu.hidden).toBe(false);
    expect(menu.textContent).toContain('k@x.fr · Propriétaire');
    expect(menu.querySelector('[data-role]')).toBeNull(); // pas d'aperçu de rôle simulé
    await act(async () => { document.getElementById('ailleurs')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(menu.hidden).toBe(true);
  });

  it('le choix de marque appelle la vraie action `setActiveBrand`', async () => {
    await monter(<Coquille donnees={donnees()}><EnTeteFactice /></Coquille>);
    await clic(document.getElementById('brandsw'));
    const autre = [...document.querySelectorAll('#sheet a')].find((a) => a.textContent === 'Autre')!;
    await clic(autre);
    expect(h.setActiveBrand).toHaveBeenCalledWith('b2');
  });

  it('la bulle Jarvis ouvre le tiroir · lecture du fil SANS appel IA, une suggestion remplit sans envoyer, l’envoi est un clic', async () => {
    const appels: Array<{ url: string; corps: unknown }> = [];
    const fetchFactice = vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url, corps: JSON.parse(String(init?.body ?? 'null')) });
      return new Response('Réponse', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchFactice);
    try {
      await monter(<Coquille donnees={donnees()}><EnTeteFactice /></Coquille>);
      await attendre();
      expect(h.thread).not.toHaveBeenCalled(); // rien n'est lu tant que le tiroir est fermé
      const jv = document.getElementById('jv')!;
      jv.focus();
      await clic(jv);
      await attendre();
      const tiroir = document.getElementById('jdraw')!;
      expect(tiroir.hidden).toBe(false);
      expect(document.body.classList.contains('jd-open')).toBe(true);
      expect(h.thread).toHaveBeenCalledTimes(1);
      expect(fetchFactice).not.toHaveBeenCalled(); // aucune IA à l'ouverture
      expect(document.activeElement?.id).toBe('jdin');
      expect(tiroir.textContent).toContain('Aucun crédit débité pour la conversation'); // coût annoncé AVANT
      await clic(tiroir.querySelector('[data-jdq]'));
      expect((document.getElementById('jdin') as HTMLInputElement).value).toBe('Propose trois angles');
      expect(fetchFactice).not.toHaveBeenCalled(); // une suggestion n'envoie rien
      await act(async () => { (document.getElementById('jdform') as HTMLFormElement).requestSubmit(); });
      await attendre();
      expect(appels).toHaveLength(1);
      expect(appels[0]!.url).toBe('/api/jarvis/chat');
      expect(appels[0]!.corps).toMatchObject({ message: 'Propose trois angles', brandId: 'b1' });
      await touche('Escape');
      await attendre();
      expect(tiroir.hidden).toBe(true);
      expect(document.activeElement).toBe(jv);
    } finally { vi.unstubAllGlobals(); }
  });

  it('sans droit Jarvis, ni bulle ni tiroir', async () => {
    await monter(<Coquille donnees={{ ...donnees(), jarvis: false }}><EnTeteFactice /></Coquille>);
    expect(document.getElementById('jv')).toBeNull();
    expect(document.getElementById('jdraw')).toBeNull();
  });
});

describe('Spatial · parcours d’accueil · comportement', () => {
  it('« Ta marque » · sans nom, aucune création · avec un nom, la VRAIE action, niveau publicitaire repris', async () => {
    await monter(<FournisseurSpatial value={CTX}><ParcoursAccueil {...PARCOURS} marqueExiste={false} connecteurs={null} depart={3} /></FournisseurSpatial>);
    expect(document.activeElement?.id).toBe('obtt');
    await clic(document.querySelector('[data-obnav="1"]'));
    expect(h.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Donne un nom');
    const champ = document.getElementById('obnom') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(champ, 'Neva'); champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clic(document.querySelector('[data-obnav="1"]'));
    await attendre();
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ brandName: 'Neva', adLevel: 'teste', goals: ['ads', 'analyze'], profile: 'brand' }));
    expect(document.querySelector('#obtt')?.textContent).toBe('Branche tes outils');
  });

  it('Échap ne ferme pas le parcours · « Passer tout » enregistre puis mène à l’accueil', async () => {
    await monter(<FournisseurSpatial value={CTX}><ParcoursAccueil {...PARCOURS} /></FournisseurSpatial>);
    await touche('Escape');
    await attendre();
    expect(document.getElementById('onb')).not.toBeNull();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    await clic(document.querySelector('[data-obclose]'));
    await attendre();
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.push).toHaveBeenCalledWith('/dashboard');
  });

  it('sans marque, « Tes outils » est sauté', async () => {
    await monter(<FournisseurSpatial value={CTX}><ParcoursAccueil {...PARCOURS} etapes={['bienvenue', 'profil', 'objectifs', 'outils']} marqueExiste={false} offre={null} depart={2} /></FournisseurSpatial>);
    expect(document.querySelector('.obtop .faint')?.textContent).toBe('Étape 3 sur 3 · Tes objectifs');
    expect(document.querySelector('[data-obnav="done"]')?.textContent).toContain('Aller à l’accueil');
  });
});
