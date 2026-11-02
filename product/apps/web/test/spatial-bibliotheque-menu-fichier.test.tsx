// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, RAISONS_ECART_VERSEMENT, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  ranger: vi.fn(async (x: { ids: string[]; folderId: string | null }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
  corbeille: vi.fn(async (x: { ids: string[] }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
  restaurer: vi.fn(async (x: { ids: string[] }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
  projets: vi.fn(async (): Promise<unknown> => ({ ok: true, projets: [], creation: { etat: 'sans-droit', message: 'x' } })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: (x: { ids: string[] }) => f.corbeille(x), restaurerAssetsAction: (x: { ids: string[] }) => f.restaurer(x),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: (x: { ids: string[]; folderId: string | null }) => f.ranger(x), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: () => f.projets(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · le menu « … » d'une carte de fichier (grille ET liste). On
 * MONTE l'écran (jsdom), on ouvre le menu à la souris puis au clavier, on lit
 * ce qu'il propose (ouvert, fermé avec sa raison) et l'appel RÉELLEMENT parti
 * (une fois, avec ce seul fichier), le focus (première entrée, flèches en
 * boucle, Échap rend le focus à « … »), la liste des dossiers de « Déplacer
 * vers… » et la fermeture (Échap, clic ailleurs, un seul menu à la fois).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333', U4 = '55555555-5555-4555-8555-555555555555';
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit')],
  medias: [
    media(U1, 'face.jpg', { rights: 'photo_marque' }), media(U2, 'dos.jpg'),
    media(U3, 'rush.mp4', { kind: 'video', mimeType: 'video/mp4' }), media(U4, 'jetee.jpg', { deletedAt: T0 }),
  ],
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async (lectureSeule: string | null = null) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} gestion={GESTION} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const touche = async (cible: Element | null, key: string) => {
  expect(cible, 'cible du clavier introuvable').toBeTruthy();
  await act(async () => { cible!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
};
const declencheur = (h: HTMLElement, nom: string) => h.querySelector(`button[data-menu-fichier][aria-label="Actions sur ${nom}"]`) as HTMLButtonElement | null;
const menu = (h: HTMLElement) => h.querySelector('[role="menu"].dmenu') as HTMLElement | null;
const entrees = (h: HTMLElement) => [...(menu(h)?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
const entree = (h: HTMLElement, cle: string) => menu(h)?.querySelector(`[data-menu="${cle}"]`) as HTMLElement | null;
const focusTexte = () => (document.activeElement as HTMLElement | null)?.textContent ?? '';
const ouvrir = async (h: HTMLElement, nom: string) => { await clic(declencheur(h, nom)); expect(menu(h), 'menu non ouvert').toBeTruthy(); };

describe('menu « … » d’une carte de fichier · grille', () => {
  it('fermé au départ · « … » ouvre le menu des gestes existants, le focus sur la première entrée', async () => {
    const h = await monter();
    const d = declencheur(h, 'face.jpg')!;
    expect(d.closest('.dcard')).toBeTruthy();
    expect([d.getAttribute('aria-haspopup'), d.getAttribute('aria-expanded'), menu(h)]).toEqual(['menu', 'false', null]);
    await ouvrir(h, 'face.jpg');
    expect(d.getAttribute('aria-expanded')).toBe('true');
    expect(entrees(h).map((x) => [x.textContent, x.getAttribute('aria-disabled')])).toEqual([
      ['Aperçu', null], ['Renommer', null], ['Déplacer vers…›', null], ['Utiliser dans un projet', null], ['Télécharger', null], ['Copier le lien', null], ['Mettre à la corbeille', null],
    ]);
    expect(focusTexte()).toBe('Aperçu');
    const t = entree(h, 'telecharger') as HTMLAnchorElement;
    expect([t.tagName, t.getAttribute('href'), t.hasAttribute('download')]).toEqual(['A', `/api/asset?id=${U1}`, true]);
  });

  it('clavier · Flèche bas sur « … » ouvre, flèches en boucle, Début et Fin, Échap ferme et rend le focus à « … »', async () => {
    const h = await monter();
    const d = declencheur(h, 'face.jpg')!;
    await act(async () => { d.focus(); });
    await touche(d, 'ArrowDown');
    expect([menu(h) !== null, focusTexte()]).toEqual([true, 'Aperçu']);
    await touche(document.activeElement, 'ArrowDown');
    expect(focusTexte()).toBe('Renommer');
    await touche(document.activeElement, 'ArrowDown');
    expect(focusTexte()).toBe('Déplacer vers…›');
    await touche(document.activeElement, 'ArrowUp');
    await touche(document.activeElement, 'ArrowUp');
    await touche(document.activeElement, 'ArrowUp');
    expect(focusTexte()).toBe('Mettre à la corbeille');
    await touche(document.activeElement, 'Home');
    expect(focusTexte()).toBe('Aperçu');
    await touche(document.activeElement, 'End');
    expect(focusTexte()).toBe('Mettre à la corbeille');
    await touche(document.activeElement, 'Escape');
    expect([menu(h), document.activeElement === d, d.getAttribute('aria-expanded')]).toEqual([null, true, 'false']);
  });

  it('« Déplacer vers… » · Flèche droite ouvre les dossiers (actuel marqué, fermé), Échap revient, un dossier déplace CE fichier, une fois', async () => {
    const h = await monter();
    await ouvrir(h, 'face.jpg');
    await act(async () => { entree(h, 'ranger')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(entrees(h).map((x) => [x.textContent, x.getAttribute('aria-checked'), x.getAttribute('aria-disabled')])).toEqual([
      ['Déplacer vers…', null, null], ['Assets de la marque · non classé', 'true', 'true'], ['Photos produit', 'false', null],
    ]);
    expect(focusTexte()).toBe('Déplacer vers…');
    // Le dossier actuel ne déplace rien.
    await clic(menu(h)!.querySelector('[data-destination=""]'));
    expect(f.ranger).not.toHaveBeenCalled();
    await touche(document.activeElement, 'Escape');
    expect([menu(h) !== null, focusTexte()]).toEqual([true, 'Déplacer vers…›']);
    await clic(entree(h, 'ranger'));
    await clic(menu(h)!.querySelector('[data-destination="d-photos"]'));
    expect(f.ranger).toHaveBeenCalledTimes(1);
    expect(f.ranger).toHaveBeenCalledWith({ ids: [U1], folderId: 'd-photos' });
    expect(toasts).toEqual(['1 fichier rangé dans « Photos produit »']);
    expect(menu(h)).toBeNull();
  });

  it('« Mettre à la corbeille » · l’action part UNE fois avec ce seul fichier, et le dit', async () => {
    const h = await monter();
    await ouvrir(h, 'dos.jpg');
    await clic(entree(h, 'corbeille'));
    expect(f.corbeille).toHaveBeenCalledTimes(1);
    expect(f.corbeille).toHaveBeenCalledWith({ ids: [U2] });
    expect(toasts).toEqual(['1 fichier placé dans la corbeille']);
  });

  it('« Aperçu » ouvre l’aperçu de CE fichier · « Utiliser dans un projet » ouvre la fenêtre pour lui seul', async () => {
    const h = await monter();
    await ouvrir(h, 'face.jpg');
    await clic(entree(h, 'apercu'));
    expect(h.querySelector('aside.dprev strong')!.textContent).toBe('face.jpg');
    await ouvrir(h, 'dos.jpg');
    await clic(entree(h, 'projet'));
    expect(f.projets).toHaveBeenCalledTimes(1);
    expect(h.querySelector('[role="dialog"] [data-versement="phrase"]')!.textContent).toBe('1 image deviendra une référence du projet.');
  });

  it('une vidéo · « Utiliser dans un projet » FERMÉ avec la raison d’écart · le clic ne fait rien', async () => {
    const h = await monter();
    await ouvrir(h, 'rush.mp4');
    const p = entree(h, 'projet')!;
    expect([p.getAttribute('aria-disabled'), p.title]).toEqual(['true', RAISONS_ECART_VERSEMENT.type]);
    await clic(p);
    expect(f.projets).not.toHaveBeenCalled();
    expect(h.querySelector('[role="dialog"]')).toBeNull();
    expect(menu(h)).toBeTruthy();
  });

  it('lecture seule · déplacer, projet et corbeille FERMÉS avec la raison · aucun appel', async () => {
    const h = await monter('Ton rôle est en lecture seule.');
    await ouvrir(h, 'face.jpg');
    for (const cle of ['renommer', 'ranger', 'projet', 'corbeille']) {
      expect([cle, entree(h, cle)!.getAttribute('aria-disabled'), entree(h, cle)!.title]).toEqual([cle, 'true', 'Ton rôle est en lecture seule.']);
    }
    await clic(entree(h, 'corbeille'));
    await clic(entree(h, 'ranger'));
    expect(entree(h, 'ranger')).toBeTruthy();
    expect(menu(h)!.querySelector('[data-destination]')).toBeNull();
    expect([f.corbeille.mock.calls.length, f.ranger.mock.calls.length]).toEqual([0, 0]);
    expect(entree(h, 'apercu')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('un seul menu à la fois · un clic ailleurs ferme', async () => {
    const h = await monter();
    await ouvrir(h, 'face.jpg');
    await act(async () => { declencheur(h, 'dos.jpg')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await clic(declencheur(h, 'dos.jpg'));
    expect(h.querySelectorAll('[role="menu"].dmenu')).toHaveLength(1);
    expect(declencheur(h, 'face.jpg')!.getAttribute('aria-expanded')).toBe('false');
    expect(menu(h)!.getAttribute('aria-label')).toBe('Actions sur dos.jpg');
    await act(async () => { h.querySelector('.dbar')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    expect(menu(h)).toBeNull();
  });
});

describe('menu « … » · liste et corbeille', () => {
  it('en liste · la ligne porte « … » à sa dernière colonne, mêmes entrées, même action', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Liste"]'));
    const d = declencheur(h, 'face.jpg')!;
    expect(d.closest('.dtr')).toBeTruthy();
    // La 7ᵉ colonne de la ligne (34 px dans la feuille de la maquette), à la place de la cellule vide.
    expect([...d.closest('.dtr')!.children].indexOf(d)).toBe(6);
    await ouvrir(h, 'face.jpg');
    expect(entrees(h).map((x) => x.dataset.menu)).toEqual(['apercu', 'renommer', 'ranger', 'projet', 'telecharger', 'copier-lien', 'corbeille']);
    await clic(entree(h, 'corbeille'));
    expect(f.corbeille).toHaveBeenCalledWith({ ids: [U1] });
  });

  it('section « Corbeille » · aperçu, télécharger, restaurer · « Restaurer » part avec ce seul fichier', async () => {
    const h = await monter();
    await clic([...h.querySelectorAll('nav.dsec button')].find((b) => b.textContent?.startsWith('Corbeille')));
    await ouvrir(h, 'jetee.jpg');
    expect(entrees(h).map((x) => x.textContent)).toEqual(['Aperçu', 'Télécharger', 'Restaurer']);
    await clic(entree(h, 'restaurer'));
    expect(f.restaurer).toHaveBeenCalledTimes(1);
    expect(f.restaurer).toHaveBeenCalledWith({ ids: [U4] });
    expect(toasts).toEqual(['1 fichier restauré']);
  });
});
