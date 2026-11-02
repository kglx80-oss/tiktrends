// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, REFUS_DEPOT, REFUS_DOSSIER, VEILLE_DEFILEMENT_MS, type DossierSource } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(), definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(),
  affecterAssetsDossierAction: vi.fn(async () => ({ ok: true, n: 1 })), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: vi.fn(), deplacerDossierAction: vi.fn(async () => ({ ok: true })), deplacerDossiersAction: vi.fn(async () => ({ ok: true, n: 2 })),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · glisser-déposer, écran MONTÉ (jsdom, faux temps · minuteries
 * et images d'animation) · le DÉFILEMENT AUTOMATIQUE près du bord et l'ANNONCE
 * de la raison d'un refus. On lit le RÉSULTAT :
 *  · la position de défilement de la page (ou d'un conteneur qui défile seul)
 *    · elle bouge vers le bord survolé, s'arrête net hors de la bande, à la fin
 *    du glisser, au dépôt, à la limite, et sans `dragover` après la veille ;
 *  · les nœuds INSÉRÉS dans la région polie (ce qu'un lecteur d'écran annonce) ·
 *    un par cible refusée, aucun sur une cible acceptée ni sur la source.
 * jsdom ne calcule aucune mise en page · les dimensions sont posées à la main
 * (fenêtre de 600 px, page de 3 000 px).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
let root: Root | null = null; let el: HTMLDivElement | null = null;

const T0 = '2026-10-20T10:00:00.000Z';
const PHOTOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', FACES = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const UGC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', HIVER = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const ARCHIVES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const DONNEES = donneesDrive({
  dossiers: [dossier(PHOTOS, 'Photos produit'), dossier(FACES, 'Faces', { parentId: PHOTOS }), dossier(UGC, 'UGC'), dossier(HIVER, 'Hiver', { parentId: UGC }), dossier(ARCHIVES, 'Archives')],
  medias: [],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

/** Les dimensions d'un élément qui défile · posées sur l'instance (jsdom n'en calcule aucune), retirées après le cas. */
const poses: Array<[Element, string[]]> = [];
const dimensionner = (e: Element, d: { hauteur: number; contenu: number; position: number; haut?: number }) => {
  let pos = d.position;
  Object.defineProperty(e, 'scrollTop', { configurable: true, get: () => pos, set: (v: number) => { pos = v; } });
  Object.defineProperty(e, 'clientHeight', { configurable: true, get: () => d.hauteur });
  Object.defineProperty(e, 'scrollHeight', { configurable: true, get: () => d.contenu });
  const r = { top: d.haut ?? 0, bottom: (d.haut ?? 0) + d.hauteur, left: 0, right: 800, width: 800, height: d.hauteur, x: 0, y: d.haut ?? 0 };
  Object.defineProperty(e, 'getBoundingClientRect', { configurable: true, value: () => ({ ...r, toJSON: () => r }) });
  poses.push([e, ['scrollTop', 'clientHeight', 'scrollHeight', 'getBoundingClientRect']]);
};
const PAGE = () => document.documentElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  dimensionner(PAGE(), { hauteur: 600, contenu: 3000, position: 1000 });
});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null;
  for (const [e, props] of poses.splice(0)) for (const p of props) delete (e as unknown as Record<string, unknown>)[p];
  vi.clearAllMocks(); vi.useRealTimers();
});

const monter = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };

const transfert = () => {
  const donnees: Record<string, string> = {};
  return { donnees, dropEffect: 'none', effectAllowed: 'all', types: [] as string[], files: [] as File[], setData: (t: string, v: string) => { donnees[t] = v; }, getData: (t: string) => donnees[t] ?? '' };
};
type Transfert = ReturnType<typeof transfert>;
const evenement = async (cible: Element | null | undefined, type: string, dt: Transfert, extra: { clientY?: number; relatedTarget?: EventTarget | null } = {}) => {
  expect(cible, `cible de ${type} introuvable`).toBeTruthy();
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  Object.defineProperty(e, 'clientY', { value: extra.clientY ?? 300 });
  if ('relatedTarget' in extra) Object.defineProperty(e, 'relatedTarget', { value: extra.relatedTarget });
  await act(async () => { cible!.dispatchEvent(e); });
  return e;
};
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

const carteDossier = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.fcard')].find((c) => c.querySelector('.ftx strong')?.textContent === nom) ?? null;
const noeud = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dtree .tnb')].find((b) => b.querySelector('.tnn')?.textContent === nom) ?? null;
const position = () => PAGE().scrollTop;

describe('défilement automatique · la page défile quand le pointeur est près du bord', () => {
  it('près du bord HAUT · la page remonte, d’autant plus vite qu’on s’approche du bord', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    // 30 px d'enfoncement dans la bande de 35 · 30 × 18 = 540 px/s.
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 5 });
    await avancer(500);
    const lent = 1000 - position();
    expect(lent, `remonté de ${lent} px en 500 ms`).toBeGreaterThan(230);
    expect(lent).toBeLessThan(280);
    // Au bord exact · 630 px/s, plus vite.
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 0 });
    const avant = position();
    await avancer(500);
    expect(avant - position()).toBeGreaterThan(lent);
  });

  it('près du bord BAS, même hors d’une cible (une carte de fichier, la barre flottante) · la page descend', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    // Le bas de l'écran · un élément qui n'est pas une cible (la barre d'en-tête de la grille).
    await evenement(h.querySelector('#dmain .dbar'), 'dragover', dt, { clientY: 595 });
    await avancer(500);
    expect(position()).toBeGreaterThan(1230);
  });

  it('pointeur immobile dans la bande · chaque `dragover` du navigateur (≤ 550 ms d’écart) relance la veille, le défilement continue', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    const pas: number[] = [];
    for (let t = 0; t < 2100; t += 300) {
      const avant = position();
      await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 600 });
      await avancer(300);
      pas.push(Math.round(position() - avant));
    }
    // 630 px/s · ~189 px par tranche de 300 ms, sans trou, y compris de part et d'autre de la première veille (1 s).
    expect(pas.filter((x) => x < 150), `pas de 300 ms · ${pas.join(', ')}`).toEqual([]);
  });

  it('un conteneur qui défile SEUL (l’arbre) · c’est lui qui défile, pas la page', async () => {
    const h = await monter();
    const arbre = h.querySelector<HTMLElement>('.dtree')!;
    arbre.style.overflowY = 'auto';
    dimensionner(arbre, { hauteur: 200, contenu: 800, position: 300, haut: 100 });
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(noeud(h, 'UGC'), 'dragover', dt, { clientY: 105 });
    await avancer(500);
    expect([arbre.scrollTop < 300 - 200, position()]).toEqual([true, 1000]);
  });

  it('sans glisser interne (des fichiers de l’ordinateur, ou rien) · rien ne défile', async () => {
    const h = await monter();
    const dt = transfert();
    dt.types = ['Files'];
    await evenement(h.querySelector('#dmain .dbar'), 'dragover', dt, { clientY: 0 });
    await avancer(1000);
    expect(position()).toBe(1000);
  });
});

describe('défilement automatique · arrêt net', () => {
  const lancer = async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 0 });
    await avancer(300);
    expect(position(), 'le défilement a démarré').toBeLessThan(1000);
    return { h, dt };
  };

  it('le pointeur sort de la bande · la page s’arrête au prochain `dragover`', async () => {
    const { h, dt } = await lancer();
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 36 });
    const fige = position();
    await avancer(2000);
    expect(position()).toBe(fige);
  });

  it('fin du glisser (`dragend`) · arrêt', async () => {
    const { h, dt } = await lancer();
    await evenement(carteDossier(h, 'Archives'), 'dragend', dt);
    const fige = position();
    await avancer(2000);
    expect(position()).toBe(fige);
  });

  it('dépôt · arrêt', async () => {
    const { h, dt } = await lancer();
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    const fige = position();
    await avancer(2000);
    expect(position()).toBe(fige);
  });

  it('le pointeur quitte la fenêtre (`dragleave` sans élément d’arrivée) · arrêt', async () => {
    const { h, dt } = await lancer();
    await evenement(carteDossier(h, 'UGC'), 'dragleave', dt, { clientY: 0, relatedTarget: null });
    const fige = position();
    await avancer(2000);
    expect(position()).toBe(fige);
  });

  it(`plus aucun \`dragover\` · arrêt après la veille (${VEILLE_DEFILEMENT_MS} ms), pas avant`, async () => {
    await lancer();
    // 300 ms déjà écoulées depuis le dernier `dragover` · il bouge encore juste avant l'échéance.
    const a = position();
    await avancer(VEILLE_DEFILEMENT_MS - 300 - 20);
    expect(position()).toBeLessThan(a);
    await avancer(20);
    const fige = position();
    await avancer(2000);
    expect(position()).toBe(fige);
  });

  it('à la limite (en haut de la page) · s’arrête à 0, jamais au-delà, sans boucle restée ouverte', async () => {
    PAGE().scrollTop = 40;
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 0 });
    await avancer(500);
    expect(position()).toBe(0);
    // Plus d'image demandée ni de veille · la boucle est fermée, pas seulement bloquée à 0. Seule reste la garde de
    // la charge (`GARDE_CHARGE_MS` · une minuterie, relancée à chaque `dragover`), levée à la fin du glisser.
    expect(vi.getTimerCount()).toBe(1);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt, { clientY: 0 });
    expect(vi.getTimerCount()).toBe(1);
    await evenement(carteDossier(h, 'Archives'), 'dragend', dt);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('annonce · la raison d’un refus, dite pendant le survol', () => {
  /** La région polie de l'écran et ce qu'elle a reçu · les nœuds insérés, ce qu'un lecteur d'écran annonce. */
  const region = () => {
    const r = [...document.querySelectorAll('[aria-live="polite"][data-annonce-depot]')];
    expect(r, 'une seule région polie pour l’écran').toHaveLength(1);
    return r[0] as HTMLElement;
  };
  const ecouter = (r: HTMLElement) => {
    const dites: string[] = [];
    const o = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) dites.push(n.textContent ?? ''); });
    o.observe(r, { childList: true, subtree: true, characterData: true });
    return { dites, lire: async () => { await act(async () => { await Promise.resolve(); }); return [...dites, ...o.takeRecords().flatMap((m) => [...m.addedNodes].map((n) => n.textContent ?? ''))]; } };
  };

  it('la région existe avant tout glisser, vide, hors de l’écran rendu (posée sur body)', async () => {
    const h = await monter();
    const r = region();
    expect([r.textContent, r.getAttribute('role'), r.className, h.contains(r)]).toEqual(['', 'status', 'sr', false]);
  });

  it('une cible qui refuse, survolée longuement · la phrase du serveur, dite UNE fois', async () => {
    const h = await monter();
    const ecoute = ecouter(region());
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    // Le navigateur tire `dragover` en continu sur la même cible.
    for (let i = 0; i < 6; i++) await evenement(noeud(h, 'Assets de la marque'), 'dragover', dt);
    expect(region().textContent).toBe(REFUS_DEPOT.dossierIci);
    expect(await ecoute.lire()).toEqual([REFUS_DEPOT.dossierIci]);
  });

  it('une cible qui accepte, ou la source elle-même · rien n’est dit, et l’annonce précédente est retirée', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    const ecoute = ecouter(region());
    for (let i = 0; i < 3; i++) await evenement(carteDossier(h, 'Archives'), 'dragover', dt);
    expect([region().textContent, await ecoute.lire()]).toEqual(['', []]);
    await evenement(noeud(h, 'Assets de la marque'), 'dragover', dt);
    expect(region().textContent).toBe(REFUS_DEPOT.dossierIci);
    await evenement(carteDossier(h, 'Archives'), 'dragover', dt);
    expect(region().textContent).toBe('');
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
    expect([region().textContent, await ecoute.lire()]).toEqual(['', [REFUS_DEPOT.dossierIci]]);
  });

  it('une autre cible qui refuse · redite, même phrase comprise ; revenir sur la première · redite', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Déplier UGC"]'));
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    const ecoute = ecouter(region());
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    // Une autre cible, la MÊME phrase · le nœud est réinséré, le lecteur d'écran la redit.
    await evenement(noeud(h, 'Anciens studios'), 'dragover', dt);
    // Le dossier sous la source · l'anti-cycle, la phrase du serveur.
    await evenement(noeud(h, 'Hiver'), 'dragover', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    expect(await ecoute.lire()).toEqual([REFUS_DEPOT.cible, REFUS_DEPOT.cible, REFUS_DOSSIER.descendant, REFUS_DEPOT.cible]);
  });

  it('la cible quittée (`dragleave` vers un autre élément) · l’annonce est retirée, le glisser continue', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    expect(region().textContent).toBe(REFUS_DEPOT.cible);
    await evenement(noeud(h, 'Créations'), 'dragleave', dt, { relatedTarget: document.body });
    expect(region().textContent).toBe('');
  });

  it('fin du glisser · l’annonce est retirée', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    expect(region().textContent).toBe(REFUS_DEPOT.cible);
    await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    expect(region().textContent).toBe('');
  });
});
