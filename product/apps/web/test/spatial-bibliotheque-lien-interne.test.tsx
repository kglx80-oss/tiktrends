// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, ouvertureLienInterne, lireLienInterne, LOT_ANALYSE_IMAGES, MESSAGE_LIEN_COPIE, type DossierSource, type MediaSource } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Copier le lien » · on MONTE l'écran (jsdom), on ouvre le
 * menu « … » d'un fichier puis d'un dossier, on clique · on lit ce que le
 * presse-papiers a RÉELLEMENT reçu (l'adresse complète, une fois) et le toast
 * qui le dit ; un presse-papiers refusé le dit aussi, sans prétendre avoir
 * copié. Ouvert par ce lien (`ouverture`), l'écran montre l'aperçu ; l'aperçu
 * fermé, l'adresse perd son paramètre.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Membre' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
const ecrire = vi.fn(async (_t: string) => {});
afterEach(() => {
  act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; toasts = []; ecrire.mockReset(); ecrire.mockImplementation(async () => {});
  window.history.replaceState(null, '', '/');
});
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => ecrire(t) } });

const T0 = '2026-10-20T10:00:00.000Z';
const PHOTOS = '44444444-4444-4444-8444-444444444444';
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const DONNEES = donneesDrive({ dossiers: [dossier(PHOTOS, 'Photos produit')], medias: [media(U1, 'face.jpg'), media(U2, 'dos.jpg', { folderId: PHOTOS })] });
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async (extra: { lectureSeule?: string | null; ouverture?: ReturnType<typeof ouvertureLienInterne> } = {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => {
    root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={extra.lectureSeule ?? null} stockage drive={DRIVE} maintenant={T0} gestion={GESTION} ouverture={extra.ouverture ?? null} /></FournisseurSpatial>);
  });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const menu = (h: HTMLElement) => h.querySelector('[role="menu"].dmenu') as HTMLElement | null;
const entree = (h: HTMLElement, cle: string) => menu(h)?.querySelector(`[data-menu="${cle}"]`) as HTMLElement | null;
const titreApercu = (h: HTMLElement) => h.querySelector('aside.dprev[aria-label="Aperçu"] strong')?.textContent ?? null;

describe('« Copier le lien » · le presse-papiers reçoit l’adresse interne, le toast le dit', () => {
  it('un fichier · `<origine>/assets?fichier=<id>`, une fois · toast du fichier · le menu se ferme', async () => {
    const h = await monter();
    await clic(h.querySelector('button[data-menu-fichier][aria-label="Actions sur face.jpg"]'));
    const e = entree(h, 'copier-lien')!;
    expect([e.textContent, e.getAttribute('aria-disabled'), e.getAttribute('title')]).toEqual(['Copier le lien', null, 'Lien interne · s’ouvre pour un membre de l’espace connecté, jamais en public.']);
    await clic(e);
    expect(ecrire).toHaveBeenCalledTimes(1);
    expect(ecrire).toHaveBeenCalledWith(`${window.location.origin}/assets?fichier=${U1}`);
    expect(toasts).toEqual([MESSAGE_LIEN_COPIE.fichier]);
    expect(menu(h)).toBeNull();
  });

  it('un dossier · `<origine>/assets?dossier=<id>` · toast du dossier', async () => {
    const h = await monter();
    await clic(h.querySelector('button[data-menu-dossier][aria-label="Actions sur Photos produit"]'));
    await clic(entree(h, 'copier-lien'));
    expect(ecrire).toHaveBeenCalledTimes(1);
    expect(ecrire).toHaveBeenCalledWith(`${window.location.origin}/assets?dossier=${PHOTOS}`);
    expect(toasts).toEqual([MESSAGE_LIEN_COPIE.dossier]);
  });

  it('lecture seule · le geste reste ouvert (c’est une lecture) et copie', async () => {
    const h = await monter({ lectureSeule: 'Ton rôle est en lecture seule.' });
    await clic(h.querySelector('button[data-menu-fichier][aria-label="Actions sur face.jpg"]'));
    await clic(entree(h, 'copier-lien'));
    expect(ecrire).toHaveBeenCalledWith(`${window.location.origin}/assets?fichier=${U1}`);
    expect(toasts).toEqual([MESSAGE_LIEN_COPIE.fichier]);
  });

  it('presse-papiers refusé · le toast dit l’échec, jamais « copié »', async () => {
    ecrire.mockImplementation(async () => { throw new Error('NotAllowedError'); });
    const h = await monter();
    await clic(h.querySelector('button[data-menu-fichier][aria-label="Actions sur face.jpg"]'));
    await clic(entree(h, 'copier-lien'));
    expect(toasts).toEqual([MESSAGE_LIEN_COPIE.echec]);
  });
});

describe('ouvert par le lien · l’aperçu s’ouvre, l’adresse se nettoie en le quittant', () => {
  it('`?fichier=` · l’aperçu du fichier ouvert, dans son dossier · fermé, l’adresse perd `fichier` et garde le reste', async () => {
    window.history.replaceState(null, '', `/assets?fichier=${U2}&tag=vert`);
    const ouverture = ouvertureLienInterne(DONNEES, lireLienInterne({ fichier: U2 }));
    const h = await monter({ ouverture });
    expect(titreApercu(h)).toBe('dos.jpg');
    expect(h.querySelector('nav.crumb')?.textContent).toContain('Photos produit');
    expect(window.location.search, 'l’adresse a été nettoyée dès l’ouverture').toBe(`?fichier=${U2}&tag=vert`);
    await clic(h.querySelector('button[aria-label="Fermer l’aperçu"]'));
    expect(titreApercu(h)).toBeNull();
    expect(window.location.search).toBe('?tag=vert');
  });
});
