// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PORTEES_AIDE_PROJET, PORTEES_RACCOURCIS, RACCOURCIS, RAISON_GESTE_RIEN_A_CONCLURE, RAISON_GESTE_SANS_GAGNANTE_LOT,
  entreesRail, entreesRailEspace, lienIterationVariable, messageRaccourciFerme, touchesAffichees, type GesteClavierLot,
} from '@tiktrends/core';

/**
 * Lot 13 bis V5 · les restes du lot 13 et les raccourcis d'itération,
 * prouvés en RENDANT les vraies vues sous la vraie coquille (jsdom) · on
 * clique, on tape des touches, on lit le DOM (case, rail, cookie, fenêtre
 * d'aide, ancre, focus, toast) et les navigations demandées.
 *  · P14 · « Menu compact » de Mon profil ↔ le rail (cookie `tt_rail`) ;
 *  · D16 · « Raccourcis » du projet → l'aide filtrée (éditeur, canvas, fenêtres) ;
 *  · Résultats · C et T sur la fiche d'un lot · une navigation, fermée quand
 *    le geste l'est, ignorée dans un champ, coupée par `tt_raccourcis`.
 * La page réelle du lot (base pglite) est prouvée dans `lot13b-raccourcis-lot-db.test.tsx`.
 */

const h = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(),
  valider: vi.fn(async () => ({})),
}));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap/lots/l1', useRouter: () => ({ push: h.push, refresh: h.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn(async () => {}) }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(async () => ({ items: [], unread: 0 })), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn(async () => ({ ok: true, projets: [] })) }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn(async () => ({ thread: { turns: [], starters: [], measuredAds: 0, brandName: 'Neva', contexte: {}, conversationId: null, conversations: [] } })) }));
// Les gestes réels du lot (arbitrer, préparer, dupliquer) · JAMAIS appelés par une touche · comptés.
vi.mock('../app/actions/adsmap-verdict', () => ({ validateVerdictAction: h.valider }));
vi.mock('../app/actions/adsmap-batch', () => ({ duplicateBatchAction: h.valider, launchBatchAction: h.valider, prepareBatchAction: h.valider, setBatchAdAction: h.valider }));
vi.mock('../app/actions/studios/propositions', () => ({ listerPropositions: vi.fn(), demanderProposition: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(), proposerPatch: vi.fn() }));
vi.mock('../app/actions/studios/sources', () => ({ exporterBrief: vi.fn() }));
vi.mock('../app/actions/adsmap-hypotheses', () => ({ creerHypotheseAction: vi.fn(), completerHypotheseAction: vi.fn() }));

const { Coquille } = await import('../spatial/coquille/Coquille');
const { Profil } = await import('../spatial/vues/reglages/Profil');
const { OngletBrief } = await import('../spatial/vues/projet/OngletBrief');
const { Lot } = await import('../spatial/vues/resultats/Lot');
const { ActionsLot } = await import('../spatial/vues/resultats/ActionsLot');
const { RaccourcisLot } = await import('../spatial/vues/resultats/RaccourcisLot');
const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
type DonneesCoquille = import('../spatial/coquille/Coquille').DonneesCoquille;
type PropsBriefProjet = import('../spatial/vues/projet/types').PropsBriefProjet;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLDivElement;
const effacerCookies = () => { for (const n of ['tt_raccourcis', 'tt_rail']) document.cookie = `${n}=; path=/; max-age=0`; };
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); effacerCookies(); window.location.hash = ''; });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); document.body.className = ''; effacerCookies(); vi.restoreAllMocks(); });

const monter = async (n: React.ReactNode) => { await act(async () => { racine = createRoot(hote); racine.render(n); }); };
const touche = async (key: string, o: KeyboardEventInit = {}, cible: Element | null = document.activeElement) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o });
  await act(async () => { (cible ?? document.body).dispatchEvent(ev); });
  return ev;
};
const attendre = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const cliquer = async (el: Element | null) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); }); };
const aide = () => document.getElementById('raccourcis');
const toast = () => document.getElementById('toast')?.textContent ?? '';

const TOUS = ['/studio/projets', '/veille', '/adsmap', '/adsmap/import', '/assets', '/jarvis', '/brands', '/settings'];
function donnees(railOuvert = true): DonneesCoquille {
  const ouverts = new Set(TOUS);
  const marque = { id: 'b1', nom: 'Neva' };
  return {
    entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
    marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }],
    peutGererMarques: true, admin: false, passer: null, railOuvert,
    utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, espaceNom: 'GLX',
    credits: { solde: 10, dotation: 100, illimite: false }, nonLues: 0, deconnexion: async () => {},
    ouverts: [...ouverts], jarvis: true, demarrage: null,
  };
}
const coquille = (enfants: React.ReactNode, d = donnees()) => monter(<Coquille donnees={d}>{enfants}</Coquille>);

/* ───────────────────────────── P14 · « Menu compact » ───────────────────────────── */

const PROFIL = { identite: { nom: 'K', email: 'k@x.fr', avatar: '', masquer: false }, acces: { espace: 'GLX', role: 'Propriétaire', abonnement: 'Core' }, liens: [], enregistrer: null, changerMotDePasse: null, motDePasseMin: 8, retours: {} };
const caseCompact = () => document.querySelector<HTMLInputElement>('input[data-menu-compact]')!;

describe('Lot 13 bis · P14 · « Menu compact » de Mon profil ↔ le rail', () => {
  it('rendu serveur · la case suit le cookie lu par la page (coquille comprise) · aucun flash', () => {
    const coche = (html: string) => /<input[^>]*type="checkbox"[^>]*data-menu-compact=""[^>]*checked=""/.test(html);
    expect(coche(renderToStaticMarkup(<Profil {...PROFIL} menuCompact />)), 'replié · la case n’est pas cochée').toBe(true);
    expect(coche(renderToStaticMarkup(<Profil {...PROFIL} menuCompact={false} />))).toBe(false);
    expect(renderToStaticMarkup(<Profil {...PROFIL} />), 'sans préférence lue, pas de case').not.toContain('data-menu-compact');
    // Sous la coquille · l'état du rail (lu au rendu serveur) fait foi.
    expect(coche(renderToStaticMarkup(<Coquille donnees={donnees(false)}><Profil {...PROFIL} menuCompact /></Coquille>)), 'rail replié, case décochée').toBe(true);
    expect(coche(renderToStaticMarkup(<Coquille donnees={donnees(true)}><Profil {...PROFIL} menuCompact={false} /></Coquille>))).toBe(false);
  });

  it('cocher replie le VRAI rail et écrit le cookie · « [ » ailleurs, la case suit · décocher le redéploie', async () => {
    await coquille(<Profil {...PROFIL} menuCompact={false} raccourcis />);
    const railtg = document.getElementById('railtg')!;
    expect(caseCompact().checked).toBe(false);
    expect(document.body.classList.contains('rail-open')).toBe(true);
    // Le libellé de la case (accessible) est celui écrit à l'écran.
    expect(caseCompact().labels?.[0]?.textContent).toContain('Menu compact sur ordinateur');
    await cliquer(caseCompact());
    expect(caseCompact().checked, 'la case ne se coche pas').toBe(true);
    expect(document.body.classList.contains('rail-open'), 'la case ne replie pas le rail').toBe(false);
    expect(document.cookie, 'le cookie du rail n’est pas écrit').toContain('tt_rail=1');
    expect(railtg.getAttribute('aria-label')).toBe('Déployer le menu');
    expect(document.querySelector('[data-zone="menu-compact"] [role="status"]')?.textContent).toBe('Menu compact · seules les icônes restent');
    await touche('[', {}, document.body);
    expect(caseCompact().checked, '« [ » redéploie le rail, la case ne suit pas').toBe(false);
    expect(document.body.classList.contains('rail-open')).toBe(true);
    await cliquer(railtg);
    expect(caseCompact().checked, 'le bouton du rail replie, la case ne suit pas').toBe(true);
    await cliquer(caseCompact());
    expect(document.body.classList.contains('rail-open')).toBe(true);
    expect(document.cookie).toContain('tt_rail=0');
  });

  it('hors coquille · la case part du cookie lu par la page et n’écrit que le cookie', async () => {
    await monter(<Profil {...PROFIL} menuCompact />);
    expect(caseCompact().checked).toBe(true);
    await cliquer(caseCompact());
    expect(caseCompact().checked).toBe(false);
    expect(document.cookie).toContain('tt_rail=0');
  });
});

/* ───────────────────────────── D16 · « Raccourcis » du projet ───────────────────────────── */

const BRIEF: PropsBriefProjet = {
  projectId: 'p1', versionId: 'v3', versionN: 3, ancienne: false, titreBrief: 'Brief · version 3', etatBrief: 'ok',
  champs: [{ libelle: 'Objectif', valeurs: ['Clics'], options: true }],
  references: [], produit: null, veilleHref: '/veille', fiche: null,
  manques: [], versions: [{ id: 'v3', n: 3, date: '27/10/2026', raison: null, courante: true, vue: true, href: '/studio/projets/p1' }],
  atelier: [{ segment: 'textes', libelle: 'Textes', href: '/studio/projets/p1/textes', mention: null }],
  exportBrief: { autorise: true, possible: true }, propositions: { initial: null, versionCourante: { id: 'v3', n: 3 } },
};
const portees = () => [...(aide()?.querySelectorAll('section[data-portee]') ?? [])].map((s) => s.getAttribute('data-portee'));
const lignes = () => [...(aide()?.querySelectorAll('[data-raccourci]') ?? [])].map((l) => l.getAttribute('data-raccourci'));

describe('Lot 13 bis · D16 · « Raccourcis » dans les Options du projet → la même aide, filtrée', () => {
  it('ouvre l’aide filtrée par la règle du noyau · « Tous les raccourcis » rend la table entière, le focus reste dans la fenêtre · Échap le rend au bouton', async () => {
    await coquille(<OngletBrief {...BRIEF} />);
    const b = document.querySelector<HTMLButtonElement>('[data-options-raccourcis] [data-ouvrir-raccourcis]')!;
    expect(b.textContent).toBe('Raccourcis');
    expect(b.closest('section')?.textContent, 'l’entrée n’est pas dans les ateliers du projet').toContain('Ateliers du projet');
    b.focus();
    await cliquer(b);
    await attendre();
    expect(aide()?.getAttribute('aria-modal')).toBe('true');
    expect(portees(), 'l’aide n’est pas filtrée sur éditeur, canvas, fenêtres').toEqual(['fenetres', 'editeur', 'canvas', 'mentions']);
    expect(lignes(), 'l’aide filtrée ne dit pas la table').toEqual(PORTEES_RACCOURCIS.filter((p) => PORTEES_AIDE_PROJET.includes(p.cle)).flatMap((p) => RACCOURCIS.filter((r) => r.portee === p.cle).map((r) => r.id)));
    expect(aide()!.querySelector('[data-aide-filtree]')?.textContent).toContain('Raccourcis du projet');
    for (const r of RACCOURCIS.filter((x) => PORTEES_AIDE_PROJET.includes(x.portee))) {
      expect([...aide()!.querySelectorAll(`[data-raccourci="${r.id}"] kbd`)].map((k) => k.textContent), r.id).toEqual(r.touches.flatMap((s) => s.flatMap((a) => touchesAffichees(a))));
    }
    await cliquer(aide()!.querySelector('[data-aide-tout]'));
    expect(portees(), '« Tous les raccourcis » ne rend pas la table entière').toEqual(PORTEES_RACCOURCIS.map((p) => p.cle));
    expect(aide()!.querySelector('[data-aide-filtree]')).toBeNull();
    expect(aide()!.contains(document.activeElement), 'le focus sort de la fenêtre').toBe(true);
    await touche('Escape');
    await attendre();
    expect(aide()).toBeNull();
    expect(document.activeElement, 'le focus n’est pas rendu au bouton').toBe(b);
  });

  it('le filtre tombe à la fermeture · « ? » rouvre l’aide entière', async () => {
    await coquille(<OngletBrief {...BRIEF} />);
    await cliquer(document.querySelector('[data-options-raccourcis] [data-ouvrir-raccourcis]'));
    expect(portees()).toEqual(['fenetres', 'editeur', 'canvas', 'mentions']);
    await touche('Escape');
    await attendre();
    await touche('?', { shiftKey: true }, document.body);
    expect(portees(), '« ? » garde le filtre du projet').toEqual(PORTEES_RACCOURCIS.map((p) => p.cle));
    expect(lignes().length).toBe(RACCOURCIS.length);
  });
});

/* ───────────────────────────── Résultats · C et T sur la fiche d'un lot ───────────────────────────── */

const AD = '11111111-1111-4111-8111-111111111111';
const OUVERT = { conclure: { href: '#conclure', raison: null }, iterer: { href: lienIterationVariable({ adId: AD }), raison: null } };
const FERME = { conclure: { href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE }, iterer: { href: null, raison: RAISON_GESTE_SANS_GAGNANTE_LOT } };
const ficheLot = (g: { conclure: GesteClavierLot; iterer: GesteClavierLot }) => (
  <Lot
    sous="Lot #5 · 14 jours" titre="Preuve ou promesse ?"
    verdict={{ gagnant: true, titre: 'V1 · gagnante', phrase: 'CPA sous la cible.', niveau: 3 }}
    variantes={[{ id: AD, texte: 'Accroche', image: null, tag: 'V1 · gagnante', gagnante: true, barre: { libelle: '10 €', part: 50 } }]}
    controles={[]} coach={{ avant: 'Le lot', fort: 'tranche', apres: '.' }}
    actions={<>
      <RaccourcisLot {...g} />
      <ActionsLot mode="arbitrage" lotId="22222222-2222-4222-8222-222222222222" aArbitrer={[{ id: AD, variante: 'V1', verdict: 'Gagnante', raison: null, calcule: 'winner' }]} />
    </>}
  />
);
const lotC = () => RACCOURCIS.find((r) => r.id === 'lot-conclure')!;
const lotT = () => RACCOURCIS.find((r) => r.id === 'lot-iterer')!;

describe('Lot 13 bis · Résultats · C et T sur la fiche d’un lot · une navigation, rien d’autre', () => {
  it('C mène à « Conclure le lot » (ancre et focus) · T à l’écran Itérer pré-rempli · aucune action serveur', async () => {
    await coquille(ficheLot(OUVERT));
    const ev = await touche('c', {}, document.body);
    expect(window.location.hash, 'C ne mène pas à l’ancre').toBe('#conclure');
    expect(document.activeElement?.id, 'le focus n’est pas sur « Conclure le lot »').toBe('conclure');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Conclure le lot');
    expect(ev.defaultPrevented).toBe(true);
    await touche('t', {}, document.body);
    expect(h.push.mock.calls, 'T n’ouvre pas Itérer pré-rempli').toEqual([[`/studio/iterer?iter=${AD}`]]);
    expect(h.valider, 'une touche a appelé une action serveur').not.toHaveBeenCalled();
    expect(toast()).toBe('');
  });

  it('fermés quand le geste l’est · rien ne s’ouvre, le toast dit pourquoi', async () => {
    await coquille(ficheLot(FERME));
    await touche('c', {}, document.body);
    expect(window.location.hash, 'C ouvre une conclusion fermée').toBe('');
    expect(toast()).toBe(messageRaccourciFerme(lotC(), RAISON_GESTE_RIEN_A_CONCLURE));
    await touche('t', {}, document.body);
    expect(h.push, 'T ouvre Itérer sans gagnante').not.toHaveBeenCalled();
    expect(toast()).toBe(messageRaccourciFerme(lotT(), RAISON_GESTE_SANS_GAGNANTE_LOT));
    expect(h.valider).not.toHaveBeenCalled();
  });

  it('ignorés dans un champ (l’apprentissage du verdict), sous l’aide, avec Ctrl ou ⌘ · I reste « Importer »', async () => {
    await coquille(ficheLot(OUVERT));
    const champ = document.querySelector(`[data-apprentissage="${AD}"]`)!;
    for (const k of ['c', 't', 'C', 'T']) await touche(k, {}, champ);
    expect(window.location.hash, 'C dans le champ').toBe('');
    expect(h.push, 'T dans le champ').not.toHaveBeenCalled();
    for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }] as KeyboardEventInit[]) {
      const ev = await touche('c', o, document.body);
      expect(ev.defaultPrevented, `Ctrl C est pris · ${JSON.stringify(o)}`).toBe(false);
      await touche('t', o, document.body);
    }
    expect(window.location.hash).toBe('');
    expect(h.push).not.toHaveBeenCalled();
    await touche('?', { shiftKey: true }, document.body);
    expect(aide()).not.toBeNull();
    expect(aide()!.querySelector('section[data-portee="fiche-lot"]')?.textContent, 'l’aide ne dit pas C et T').toContain('Aller à « Conclure le lot »');
    await touche('c'); await touche('t');
    expect(window.location.hash, 'C sous la fenêtre modale').toBe('');
    expect(h.push).not.toHaveBeenCalled();
    await touche('Escape');
    await attendre();
    await touche('i', {}, document.body);
    expect(h.push.mock.calls, 'I n’est plus « Importer des résultats »').toEqual([['/adsmap/import']]);
  });

  it('coupés par la préférence « Raccourcis à une touche » (cookie tt_raccourcis) · rallumés, ils reviennent', async () => {
    document.cookie = 'tt_raccourcis=0; path=/';
    await coquille(ficheLot(OUVERT));
    await touche('c', {}, document.body); await touche('t', {}, document.body);
    expect(window.location.hash, 'C part malgré la coupure').toBe('');
    expect(h.push, 'T part malgré la coupure').not.toHaveBeenCalled();
    document.cookie = 'tt_raccourcis=1; path=/';
    await touche('t', {}, document.body);
    expect(h.push.mock.calls).toEqual([[`/studio/iterer?iter=${AD}`]]);
  });

  // Lot 13 ter · ils se VOIENT désormais · une seule section ajoutée (`[data-raccourcis-lot]`, les deux gestes et leurs touches) ·
  // retirée, la fiche est la même qu'avant · le reste est prouvé par `lot13t-raccourcis-visibles-rendu.test.tsx`.
  it('ne dessine qu’une section · retirée, la fiche du lot rendue au serveur est la même qu’avant le lot 13 ter', () => {
    const ctx = { utilisateur: donnees().utilisateur, credits: donnees().credits, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
    const avec = renderToStaticMarkup(<FournisseurSpatial value={ctx}>{ficheLot(OUVERT)}</FournisseurSpatial>);
    const sans = renderToStaticMarkup(<FournisseurSpatial value={ctx}><Lot {...(ficheLot(OUVERT).props as Parameters<typeof Lot>[0])} actions={<ActionsLot mode="arbitrage" lotId="22222222-2222-4222-8222-222222222222" aArbitrer={[{ id: AD, variante: 'V1', verdict: 'Gagnante', raison: null, calcule: 'winner' }]} />} /></FournisseurSpatial>);
    const t = document.createElement('template');
    t.innerHTML = avec;
    const s = [...t.content.querySelectorAll('section[data-raccourcis-lot]')];
    expect(s, 'la section des gestes au clavier n’est pas rendue une fois').toHaveLength(1);
    s[0]!.remove();
    const t2 = document.createElement('template');
    t2.innerHTML = sans;
    expect(t.innerHTML).toBe(t2.innerHTML);
    expect(avec).toContain('id="conclure"');
  });
});
