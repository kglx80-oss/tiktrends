// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, MESSAGE_PAGE, type DossierSource, type LigneCompteBibliotheque, type MediaSource, type PageBibliotheque } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  page: vi.fn(async (_d: unknown): Promise<PageBibliotheque | { error: string }> => ({ medias: [], suivant: null })),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: f.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(),
  basculerAssetsIaAction: vi.fn(), mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(), renommerAssetAction: vi.fn(),
  pageBibliothequeAction: (d: unknown) => f.page(d),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: vi.fn(), deplacerDossierAction: vi.fn(), deplacerDossiersAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Charger plus » et la recherche sur tout l'espace, écran
 * MONTÉ (jsdom). La page n'a chargé que 3 des 5 fichiers du dossier · l'écran
 * le dit, « Charger plus » demande la page suivante (le bon dossier, le
 * curseur de la fenêtre), les fichiers reçus apparaissent et se sélectionnent,
 * la phrase et le bouton disparaissent quand tout est là. Une recherche part
 * sur le serveur et montre un fichier jamais chargé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); vi.useRealTimers(); });

const T0 = '2026-10-20T10:00:00.000Z';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DP = U(900);
const C = { t: '2026-10-20T09:00:00.123456Z', id: U(3) };
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (n: number, extra: Partial<MediaSource> = {}): MediaSource => ({
  id: U(n), name: `photo-${n}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${U(n)}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: DP, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const ligne = (dossierId: string | null, n: number): LigneCompteBibliotheque => ({ dossierId, kind: 'image', mimeType: 'image/jpeg', supprime: false, n, octets: n * 1000, sansTaille: 0 });
/** « Photos » compte 5 fichiers · la fenêtre de la page en a chargé 3. La racine en compte 1, chargé. */
const DONNEES = donneesDrive({ dossiers: [dossier(DP, 'Photos')], medias: [media(1), media(2), media(3), media(50, { folderId: null, name: 'racine.jpg' })], comptes: [ligne(DP, 5), ligne(null, 1)] });
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async (o: Partial<Parameters<typeof Bibliotheque>[0]> = {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const props = { donnees: DONNEES, lectureSeule: null, stockage: true, drive: DRIVE, maintenant: T0, gestion: GESTION, pagination: { vivants: C, corbeille: null }, ouverture: { fichier: null, chemin: ['r:assets', DP] }, ...o };
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque {...props} /></FournisseurSpatial>); });
  return el;
};
const cartes = (h: HTMLElement) => [...h.querySelectorAll('.dcard .nm')].map((x) => x.textContent);
const suite = (h: HTMLElement) => h.querySelector('[data-suite]')?.querySelector('[role="status"]')?.textContent ?? null;
const bouton = (h: HTMLElement) => h.querySelector('button[data-geste="charger-plus"]') as HTMLButtonElement | null;

describe('« Charger plus » · la liste partielle le dit, et se complète', () => {
  it('3 fichiers affichés sur 5 · le clic demande la page suivante de CE dossier, depuis la fenêtre', async () => {
    f.page.mockResolvedValueOnce({ medias: [media(4), media(5)], suivant: null });
    const h = await monter();
    expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg']);
    expect(suite(h)).toBe('3 fichiers affichés sur 5 · les plus récents sont chargés d’abord, la sélection porte sur les fichiers affichés.');
    expect(bouton(h)!.textContent).toBe(MESSAGE_PAGE.bouton);
    await act(async () => { bouton(h)!.click(); });
    expect(f.page).toHaveBeenCalledTimes(1);
    expect(f.page.mock.calls[0]![0]).toEqual({ portee: { type: 'dossier', dossier: DP }, filtre: 'tous', curseur: C });
    expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
    expect([suite(h), bouton(h)]).toEqual([null, null]);
  });

  it('les fichiers reçus se sélectionnent · la sélection dit qu’elle ne porte que sur les affichés tant qu’il en reste', async () => {
    f.page.mockResolvedValueOnce({ medias: [media(4)], suivant: { t: '2026-10-19T09:00:00.000001Z', id: U(4) } });
    const h = await monter();
    await act(async () => { bouton(h)!.click(); });
    expect(suite(h)).toMatch(/^4 fichiers affichés sur 5/);
    await act(async () => { (h.querySelector('button.dchk[aria-label="Sélectionner photo-4.jpg"]') as HTMLElement).click(); });
    expect(h.querySelector('[data-geste="note-selection-partielle"]')?.textContent).toBe('La sélection porte sur les fichiers affichés · 1 autre fichier n’est pas chargé.');
    // La page suivante repart du curseur reçu, jamais de la fenêtre.
    await act(async () => { bouton(h)!.click(); });
    expect((f.page.mock.calls[1]![0] as { curseur: unknown }).curseur).toEqual({ t: '2026-10-19T09:00:00.000001Z', id: U(4) });
  });

  it('un dossier dont rien n’est chargé n’est pas « vide » · un refus du serveur est dit, sans rien ajouter', async () => {
    f.page.mockResolvedValueOnce({ error: MESSAGE_PAGE.echec });
    const vide = donneesDrive({ dossiers: [dossier(DP, 'Photos')], medias: [], comptes: [ligne(DP, 2)] });
    const h = await monter({ donnees: vide });
    expect(h.textContent).not.toContain('Ce dossier est vide');
    expect(suite(h)).toMatch(/^0 fichier affiché sur 2/);
    await act(async () => { bouton(h)!.click(); });
    expect([suite(h), cartes(h)]).toEqual([MESSAGE_PAGE.echec, []]);
  });

  it('sans pagination (données complètes) · ni phrase, ni bouton, ni appel', async () => {
    const h = await monter({ pagination: undefined, donnees: donneesDrive({ dossiers: [dossier(DP, 'Photos')], medias: [media(1)] }) });
    expect([suite(h), bouton(h)]).toEqual([null, null]);
    expect(f.page).not.toHaveBeenCalled();
  });
});

describe('la recherche · sur tout l’espace, par le serveur', () => {
  it('saisie · la première page part après la pause, un fichier jamais chargé apparaît, le total est dit', async () => {
    vi.useFakeTimers();
    f.page.mockResolvedValueOnce({ medias: [media(77, { name: 'Étiquette 2019.jpg' }), media(1)], suivant: { t: C.t, id: U(1) }, total: 450 });
    const h = await monter();
    const champ = h.querySelector('#libq') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(champ, 'etiquette');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(suite(h)).toBe(MESSAGE_PAGE.enCours);
    expect(h.textContent).not.toContain('Aucun fichier trouvé');
    expect(f.page).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(350); });
    await act(async () => { await Promise.resolve(); });
    expect(f.page).toHaveBeenCalledTimes(1);
    expect(f.page.mock.calls[0]![0]).toEqual({ portee: { type: 'recherche', q: 'etiquette' }, filtre: 'tous', curseur: null });
    expect(cartes(h)).toContain('Étiquette 2019.jpg');
    expect(suite(h)).toMatch(/^1 fichier affiché sur 450/);
    expect(bouton(h)).not.toBeNull();
  });
});
