// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  connexionDrive, donneesDrive, utilisationsBibliotheque, messageFichierRemplace, PHRASES_REMPLACEMENT, REFUS_REMPLACEMENT,
  type DossierSource, type MediaSource, type UtilisationsBibliotheque,
} from '@tiktrends/core';

const appels = vi.hoisted(() => ({
  presign: [] as unknown[], remplacer: [] as unknown[], put: [] as Array<{ url: string; type: string | null }>,
  reponse: { ok: true } as { ok?: true; error?: string },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(), renommerAssetAction: vi.fn(),
  presignAssetUploadAction: async (x: unknown) => { appels.presign.push(x); return { uploadUrl: 'https://s3.test/put/nv', jetonDepot: 'jeton-opaque', contentType: 'image/jpeg' }; },
  remplacerAssetAction: async (x: unknown) => { appels.remplacer.push(x); return appels.reponse; },
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: vi.fn(), deplacerDossierAction: vi.fn(), deplacerDossiersAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Remplacer » dans l'aperçu d'un fichier et dans son menu
 * « … ». On MONTE l'écran, on ouvre l'aperçu, on choisit un fichier et on lit
 * ce qui s'affiche · la confirmation AVANT tout envoi (« Utilisé dans N
 * projets », ce qui reste, l'ancienne version gardée), puis, confirmée, le
 * toast de succès ou le refus du serveur dans la fenêtre. Fermé avec sa
 * raison (stockage inactif, Drive), absent en lecture seule, en corbeille et
 * pour une sortie Studios.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;

/** Le PUT présigné · un faux XMLHttpRequest qui répond 200 et garde l'adresse et le type envoyés. */
class FauxXhr {
  url = ''; type: string | null = null; status = 0; onload: (() => void) | null = null; onerror: (() => void) | null = null;
  open(_m: string, url: string) { this.url = url; }
  setRequestHeader(k: string, v: string) { if (k.toLowerCase() === 'content-type') this.type = v; }
  send() { appels.put.push({ url: this.url, type: this.type }); this.status = 200; queueMicrotask(() => this.onload?.()); }
}
beforeEach(() => {
  appels.presign.length = 0; appels.remplacer.length = 0; appels.put.length = 0; appels.reponse = { ok: true }; toasts.length = 0;
  vi.stubGlobal('XMLHttpRequest', FauxXhr);
});
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.unstubAllGlobals(); });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333', U4 = '44444444-4444-4444-8444-444444444444';
const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}?v=2`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, contenu: 'stockage', ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit')],
  medias: [
    media(U1, 'face.jpg'), media(U2, 'drive.jpg', { source: 'drive' }),
    media(U4, 'jete.jpg', { deletedAt: T0 }),
    media(U3, 'sortie.png', { source: 'studios', studio: { projetId: PB, projetTitre: 'Rentrée', href: `/studio/projets/${PB}` } }),
  ],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });
const ref = (uuid: string, role: string) => ({ assetId: `bib_${uuid}`, role, scope: 'global' });
const UTILISATIONS = utilisationsBibliotheque([
  { id: PA, titre: 'Lunettes · rentrée', marque: 'Marque A1', statut: 'active', references: [ref(U1, 'style')] },
  { id: PB, titre: 'Ancien test', marque: 'Marque A2', statut: 'archived', references: [ref(U1, 'logo')] },
], { borne: false });

const monter = async (o: { stockage?: boolean; lectureSeule?: string | null; utilisations?: UtilisationsBibliotheque | null } = {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={o.lectureSeule ?? null} stockage={o.stockage ?? true} drive={DRIVE} maintenant={T0} utilisations={o.utilisations === undefined ? UTILISATIONS : o.utilisations} /></FournisseurSpatial>); });
  return el;
};
const apercu = async (h: HTMLElement, nom: string) => {
  const b = h.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`) as HTMLButtonElement | null;
  expect(b, `carte ${nom} introuvable`).toBeTruthy();
  await act(async () => { b!.click(); });
  return h.querySelector('aside.dprev') as HTMLElement;
};
const bouton = (a: HTMLElement) => a.querySelector('[data-geste="remplacer-fichier"]') as HTMLButtonElement | null;
/** Le sélecteur est créé au geste, hors de l'arbre de l'écran (la structure de la maquette ne change pas). */
const selecteur = () => document.querySelector('input[type="file"][data-remplacer-fichier]') as HTMLInputElement | null;
const choisir = async (_h: HTMLElement, nom: string, type: string) => {
  const input = selecteur()!;
  expect(input, 'aucun sélecteur de fichiers ouvert').toBeTruthy();
  const fichier = new File([new Uint8Array(2048)], nom, { type });
  Object.defineProperty(input, 'files', { configurable: true, value: [fichier] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
};
const fenetre = () => document.querySelector('form[data-remplacer]') as HTMLFormElement | null;
const lignes = () => [...(fenetre()?.querySelectorAll('[data-remplacer-ligne]') ?? [])].map((p) => p.textContent);

describe('« Remplacer » · l’aperçu d’un fichier', () => {
  it('ouvert · le sélecteur filtré sur la famille, puis la confirmation AVANT tout envoi · « Utilisé dans 2 projets Studios »', async () => {
    const h = await monter();
    const a = await apercu(h, 'face.jpg');
    const b = bouton(a)!;
    expect([b.textContent, b.disabled]).toEqual(['Remplacer', false]);
    await act(async () => { b.click(); });
    expect([selecteur()!.accept, selecteur()!.getAttribute('data-remplacer-fichier'), h.querySelector('input[data-remplacer-fichier]')]).toEqual(['image/*', U1, null]);
    await choisir(h, 'face-v2.jpg', 'image/jpeg');
    expect(selecteur(), 'le sélecteur reste dans la page après le choix').toBeNull();
    expect(fenetre()!.querySelector('strong')!.textContent).toBe('Remplacer « face.jpg » par « face-v2.jpg » ?');
    expect(lignes()).toEqual(['Utilisé dans 2 projets Studios · ils liront la nouvelle version.', PHRASES_REMPLACEMENT.association, PHRASES_REMPLACEMENT.garde, PHRASES_REMPLACEMENT.ancienne]);
    expect([appels.presign.length, appels.put.length, appels.remplacer.length], 'un envoi est parti avant la confirmation').toEqual([0, 0, 0]);
    expect(fenetre()!.textContent).not.toContain('—');
  });

  it('confirmé · dépôt présigné (type signé), action sur le MÊME id, succès dit, fenêtre fermée', async () => {
    const h = await monter();
    await act(async () => { bouton(await apercu(h, 'face.jpg'))!.click(); });
    await choisir(h, 'face-v2.jpg', 'image/jpeg');
    await act(async () => { fenetre()!.requestSubmit(); });
    expect(appels.put).toEqual([{ url: 'https://s3.test/put/nv', type: 'image/jpeg' }]);
    // Présigné pour un REMPLACEMENT, puis le jeton opaque · aucune adresse de l'objet ne repart du navigateur.
    expect(appels.presign).toEqual([{ filename: 'face-v2.jpg', contentType: 'image/jpeg', sizeBytes: 2048, usage: 'remplacement' }]);
    expect(appels.remplacer).toEqual([{ id: U1, jetonDepot: 'jeton-opaque', mimeType: 'image/jpeg' }]);
    expect([toasts, fenetre()]).toEqual([[messageFichierRemplace('face.jpg')], null]);
  });

  it('refusé par le serveur · la phrase reste dans la fenêtre, aucun succès dit', async () => {
    appels.reponse = { error: 'Remplacement refusé · une image se remplace par une image, ce fichier est une vidéo.' };
    const h = await monter();
    await act(async () => { bouton(await apercu(h, 'face.jpg'))!.click(); });
    await choisir(h, 'clip.jpg', 'image/jpeg');
    await act(async () => { fenetre()!.requestSubmit(); });
    expect(fenetre()!.querySelector('[role="alert"]')!.textContent).toBe(appels.reponse.error);
    expect(toasts).toEqual([]);
  });

  it('lecture Studios fermée · la phrase prudente, sans compte de projets', async () => {
    const h = await monter({ utilisations: null });
    await act(async () => { bouton(await apercu(h, 'face.jpg'))!.click(); });
    await choisir(h, 'face-v2.jpg', 'image/jpeg');
    expect(lignes()[0]).toBe(PHRASES_REMPLACEMENT.sansLecture);
  });

  it('fermé avec sa raison · stockage inactif, fichier Drive ; aucun sélecteur ouvert', async () => {
    const sans = bouton(await apercu(await monter({ stockage: false }), 'face.jpg'))!;
    expect([sans.disabled, sans.title]).toEqual([true, REFUS_REMPLACEMENT.stockage]);
    act(() => { root?.unmount(); }); el?.remove();
    const drive = bouton(await apercu(await monter(), 'drive.jpg'))!;
    expect([drive.disabled, drive.title]).toEqual([true, REFUS_REMPLACEMENT.drive]);
    await act(async () => { drive.click(); });
    expect(selecteur(), 'un geste fermé a ouvert le sélecteur').toBeNull();
  });

  it('absent · lecture seule, sortie Studios', async () => {
    expect(bouton(await apercu(await monter({ lectureSeule: 'Offre Core requise.' }), 'face.jpg'))).toBeNull();
    act(() => { root?.unmount(); }); el?.remove();
    const h = await monter();
    await act(async () => { ([...h.querySelectorAll('.btabs button')].find((b) => b.textContent?.includes('Créations')) as HTMLButtonElement).click(); });
    await act(async () => { (h.querySelector('button.fopen') as HTMLButtonElement).click(); });
    expect(bouton(await apercu(h, 'sortie.png'))).toBeNull();
  });

  it('absent · un fichier en corbeille', async () => {
    const h = await monter();
    await act(async () => { ([...h.querySelectorAll('.dsec button')].find((b) => b.textContent?.includes('Corbeille')) as HTMLButtonElement).click(); });
    expect(bouton(await apercu(h, 'jete.jpg'))).toBeNull();
  });
});

describe('« Remplacer » · le menu « … » d’un fichier', () => {
  it('l’entrée ouvre le même geste · la même confirmation', async () => {
    const h = await monter();
    const d = h.querySelector('button[data-menu-fichier][aria-label="Actions sur face.jpg"]') as HTMLButtonElement;
    await act(async () => { d.click(); });
    const e = h.querySelector('[role="menu"].dmenu [data-menu="remplacer"]') as HTMLButtonElement;
    expect(e.textContent).toBe('Remplacer');
    await act(async () => { e.click(); });
    await choisir(h, 'face-v3.jpg', 'image/jpeg');
    expect(lignes()[0]).toBe('Utilisé dans 2 projets Studios · ils liront la nouvelle version.');
  });
});
