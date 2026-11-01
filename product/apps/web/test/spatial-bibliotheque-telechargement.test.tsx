// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, PLAFOND_ARCHIVE_OCTETS, RAISONS_ARCHIVE, refusArchiveTailleInconnue, refusArchiveVolume, type DossierSource, type MediaSource } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(),
  basculerAssetsIaAction: vi.fn(), mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(async () => ({ ok: true, projets: [] })), verserSelectionDansProjet: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Télécharger » de la barre de sélection (jsdom). On MONTE
 * l'écran, on coche, on lit le bouton (ouvert, fermé et sa phrase) puis ce qui
 * PART réellement · la vérification JSON (identifiants seuls) et le formulaire
 * que le navigateur poste pour recevoir l'archive (action, méthode, champs).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 1024, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-ugc', 'UGC')],
  medias: [media('m1'), media('m2', { sizeBytes: 2048 }), media('m3', { sizeBytes: null }), media('m4', { sizeBytes: PLAFOND_ARCHIVE_OCTETS })],
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} gestion={GESTION} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const caseFichier = (h: HTMLElement, nom: string) => h.querySelector(`button.dchk[aria-label="Sélectionner ${nom}"]`);
const caseDossier = (h: HTMLElement, nom: string) => h.querySelector(`button.fsel[aria-label="Sélectionner ${nom}"]`);
const bouton = (h: HTMLElement) => h.querySelector('.dbulk button[data-geste="telecharger"]') as HTMLButtonElement | null;

/** Ce que le navigateur poste · capté sur `HTMLFormElement.submit` (jsdom ne navigue pas). */
function capterFormulaires() {
  const postes: Array<{ action: string; method: string; champs: Array<[string, string]>; dansLaPage: boolean; target: string }> = [];
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    postes.push({ action: new URL(this.action).pathname, method: this.method, champs: [...new FormData(this).entries()].map(([k, v]) => [k, String(v)]), dansLaPage: document.body.contains(this), target: this.target });
  });
  return postes;
}
function stubVerification(reponse: { status: number; corps: unknown }) {
  const appels: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    return new Response(JSON.stringify(reponse.corps), { status: reponse.status, headers: { 'content-type': 'application/json' } });
  }));
  return appels;
}

describe('« Télécharger » · ouvert pour les fichiers, fermé avec sa phrase sinon', () => {
  it('fichiers · ouvert, l’infobulle dit le contenu ; il remplace le geste fermé « pas de téléchargement groupé »', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm2.jpg'));
    const b = bouton(h)!;
    expect([b.textContent, b.disabled, b.title]).toEqual(['Télécharger', false, 'Archive ZIP de 2 fichiers · 3 Ko']);
    expect(h.querySelector('.dbulk [data-ferme="telecharger"]'), 'plus de bouton fermé en double').toBeNull();
    expect([...h.querySelectorAll('.dbulk button')].filter((x) => x.textContent === 'Télécharger').length).toBe(1);
  });
  it('dossier seul · fermé, avec sa raison', async () => {
    const h = await monter();
    await clic(caseDossier(h, 'UGC'));
    expect([bouton(h)!.disabled, bouton(h)!.title]).toEqual([true, RAISONS_ARCHIVE.dossiers]);
  });
  it('taille inconnue · volume au-delà du plafond · fermé AVANT le clic', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm3.jpg'));
    expect([bouton(h)!.disabled, bouton(h)!.title]).toEqual([true, refusArchiveTailleInconnue(1)]);
    await clic(caseFichier(h, 'm3.jpg'));
    await clic(caseFichier(h, 'm4.jpg'));
    expect([bouton(h)!.disabled, bouton(h)!.title]).toEqual([true, refusArchiveVolume(PLAFOND_ARCHIVE_OCTETS + 1024)]);
  });
});

describe('au clic · vérification, puis le navigateur reçoit l’archive', () => {
  it('mixte · la vérification part avec les seuls fichiers, puis UN formulaire POST vers la route, identifiants seuls', async () => {
    const postes = capterFormulaires();
    const appels = stubVerification({ status: 200, corps: { ok: true, fichiers: 2, octets: 3072, nom: 'bibliotheque-2026-11-01.zip' } });
    const h = await monter();
    await clic(caseDossier(h, 'UGC'));
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm2.jpg'));
    expect(bouton(h)!.title).toBe('Archive ZIP de 2 fichiers · 3 Ko · 1 dossier n’y entre pas');
    await clic(bouton(h));
    expect(appels.map((a) => [a.url, a.init.method, a.init.body])).toEqual([['/api/bibliotheque/archive?verifier=1', 'POST', JSON.stringify({ ids: ['m1', 'm2'] })]]);
    expect(postes).toEqual([{ action: '/api/bibliotheque/archive', method: 'post', champs: [['ids', 'm1'], ['ids', 'm2']], dansLaPage: true, target: '' }]);
    expect(document.querySelector('form[action$="/api/bibliotheque/archive"]'), 'le formulaire ne reste pas dans la page').toBeNull();
    expect(toasts).toEqual(['Téléchargement lancé · 2 fichiers, 3 Ko']);
  });
  it('la route refuse (fichier mis à la corbeille entre-temps) · sa phrase est dite, AUCUN formulaire posté', async () => {
    const postes = capterFormulaires();
    stubVerification({ status: 409, corps: { ok: false, raison: RAISONS_ARCHIVE.introuvable } });
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(bouton(h));
    expect(postes).toEqual([]);
    expect(toasts).toEqual([RAISONS_ARCHIVE.introuvable]);
    expect(bouton(h)!.disabled, 'le geste se rouvre').toBe(false);
  });
  it('réseau coupé · une phrase, aucun formulaire', async () => {
    const postes = capterFormulaires();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(bouton(h));
    expect(postes).toEqual([]);
    expect(toasts).toEqual(['Archive indisponible · réessaie dans un instant.']);
  });
});
