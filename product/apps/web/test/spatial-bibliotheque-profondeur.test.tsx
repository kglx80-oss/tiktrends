// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, MESSAGE_PAGE, type DossierSource, type LigneCompteBibliotheque, type MediaSource, type PageBibliotheque } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  page: vi.fn(async (_d: unknown): Promise<PageBibliotheque | { error: string }> => ({ medias: [], suivant: null })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
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
import { Bibliotheque, type GestionBibliotheque, type PropsBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Charger plus » PUIS un geste · écran MONTÉ (jsdom). La page
 * relue après le geste (nouvelles données, nouvelle fenêtre) ne ramène plus la
 * liste à la fenêtre · l'écran garde les fichiers qu'il montrait pendant la
 * relecture (la liste ne se replie pas, le défilement reste en place), relit
 * le dossier depuis son début jusqu'à la même profondeur, puis montre les
 * fichiers relus (nom neuf compris), sans doublon · « Charger plus » reprend
 * ensuite après le dernier fichier relu. Une relecture refusée revient à la
 * fenêtre et le dit.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); });

const T0 = '2026-10-20T10:00:00.000Z';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DP = U(900);
const C = { t: '2026-10-20T09:00:00.123456Z', id: U(3) };
const C2 = { t: '2026-10-20T08:00:00.000001Z', id: U(5) };
const C3 = { t: '2026-10-20T07:00:00.000001Z', id: U(5) };
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (n: number, extra: Partial<MediaSource> = {}): MediaSource => ({
  id: U(n), name: `photo-${n}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${U(n)}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: DP, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const ligne = (dossierId: string | null, n: number): LigneCompteBibliotheque => ({ dossierId, kind: 'image', mimeType: 'image/jpeg', supprime: false, n, octets: n * 1000, sansTaille: 0 });
/** « Photos » compte 7 fichiers · la fenêtre de la page en a chargé 3. */
const page = (medias: MediaSource[]) => donneesDrive({ dossiers: [dossier(DP, 'Photos')], medias, comptes: [ligne(DP, 7)] });
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const props = (o: Partial<PropsBibliotheque> = {}): PropsBibliotheque => ({ donnees: page([media(1), media(2), media(3)]), lectureSeule: null, stockage: true, drive: DRIVE, maintenant: T0, gestion: GESTION, pagination: { vivants: C, corbeille: null }, ouverture: { fichier: null, chemin: ['r:assets', DP] }, ...o });
const rendre = async (p: PropsBibliotheque) => {
  if (!el) { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); }
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque {...p} /></FournisseurSpatial>); });
  return el;
};
const cartes = (h: HTMLElement) => [...h.querySelectorAll('.dcard .nm')].map((x) => x.textContent);
const suite = (h: HTMLElement) => h.querySelector('[data-suite]')?.querySelector('[role="status"]')?.textContent ?? null;
const bouton = (h: HTMLElement) => h.querySelector('button[data-geste="charger-plus"]') as HTMLButtonElement | null;
const differe = <T,>() => { let ok!: (v: T) => void; const p = new Promise<T>((r) => { ok = r; }); return { p, ok }; };

/** 3 affichés sur 7, « Charger plus » en apporte 2 · la liste montre 5 (profondeur 5). */
const chargerPuisGeste = async () => {
  f.page.mockResolvedValueOnce({ medias: [media(4), media(5)], suivant: C2 });
  const h = await rendre(props());
  await act(async () => { bouton(h)!.click(); });
  expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
  return h;
};

describe('« Charger plus » puis un geste · la profondeur est gardée', () => {
  it('pendant la relecture la liste garde ses 5 fichiers · puis le dossier relu depuis son début à 5, nom neuf, sans doublon', async () => {
    const h = await chargerPuisGeste();
    // Le geste · photo-4 (chargé par « Charger plus ») est renommé, la page se relit (nouvelles données, nouvelle fenêtre).
    const relu = differe<PageBibliotheque>();
    f.page.mockImplementationOnce(() => relu.p);
    await rendre(props({ donnees: page([media(1), media(2), media(3)]), pagination: { vivants: { ...C }, corbeille: null } }));
    expect(f.page).toHaveBeenCalledTimes(2);
    expect(f.page.mock.calls[1]![0]).toEqual({ portee: { type: 'dossier', dossier: DP }, filtre: 'tous', curseur: null, limite: 5 });
    // Rien ne se replie pendant la relecture · la liste et donc le défilement restent en place, « Charger plus » attend.
    expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-4.jpg', 'photo-5.jpg']);
    expect(bouton(h)?.disabled).toBe(true);
    await act(async () => { relu.ok({ medias: [media(1), media(2), media(3), media(4, { name: 'renomme-4.jpg' }), media(5)], suivant: C3 }); });
    expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-5.jpg', 'renomme-4.jpg']);
    expect(suite(h)).toMatch(/^5 fichiers affichés sur 7/);
    // « Charger plus » reprend après le dernier fichier RELU, jamais depuis la fenêtre.
    f.page.mockResolvedValueOnce({ medias: [media(6), media(7)], suivant: null });
    expect(bouton(h)?.disabled).toBe(false);
    await act(async () => { bouton(h)!.click(); });
    expect((f.page.mock.calls[2]![0] as { curseur: unknown }).curseur).toEqual(C3);
    expect(cartes(h)).toHaveLength(7);
    expect(new Set(cartes(h)).size).toBe(7);
  });

  it('un fichier mis à la corbeille pendant le geste · absent de la liste relue, la profondeur suit ce que la base rend', async () => {
    const h = await chargerPuisGeste();
    f.page.mockResolvedValueOnce({ medias: [media(1), media(2), media(3), media(5), media(6)], suivant: C3 });
    await rendre(props({ donnees: page([media(1), media(2), media(3)]), pagination: { vivants: { ...C }, corbeille: null } }));
    expect(cartes(h)).toEqual(['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg', 'photo-5.jpg', 'photo-6.jpg']);
  });

  it('une relecture refusée · la liste revient à la fenêtre neuve et le dit, « Charger plus » repart de la fenêtre', async () => {
    const h = await chargerPuisGeste();
    f.page.mockResolvedValueOnce({ error: MESSAGE_PAGE.echec });
    await rendre(props({ donnees: page([media(1), media(2), media(3)]), pagination: { vivants: { ...C }, corbeille: null } }));
    expect([cartes(h), suite(h)]).toEqual([['photo-1.jpg', 'photo-2.jpg', 'photo-3.jpg'], MESSAGE_PAGE.echec]);
    f.page.mockResolvedValueOnce({ medias: [media(4)], suivant: C2 });
    await act(async () => { bouton(h)!.click(); });
    expect((f.page.mock.calls[2]![0] as { curseur: unknown }).curseur).toEqual(C);
  });

  it('sans « Charger plus » avant le geste · rien n’est relu, la page relue suffit', async () => {
    await rendre(props());
    await rendre(props({ donnees: page([media(1), media(2), media(3)]) }));
    expect(f.page).not.toHaveBeenCalled();
  });
});
