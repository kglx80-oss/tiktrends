// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, RAISONS_SELECTION, RAISONS_ECART_VERSEMENT, type DossierSource, type MediaSource } from '@tiktrends/core';

const PROJET = '44444444-4444-4444-8444-444444444444';
const f = vi.hoisted(() => ({
  projets: vi.fn(async (): Promise<unknown> => ({ ok: true, projets: [{ id: '44444444-4444-4444-8444-444444444444', titre: 'Lunettes · rentrée', marque: 'Marque A1' }] })),
  verser: vi.fn(async (_x: { projectId: string; ids: string[]; role: string; scope: string }): Promise<unknown> => ({
    ok: true, ajoutes: 2, dejaPresents: 0, versionN: 4, projet: { id: '44444444-4444-4444-8444-444444444444', titre: 'Lunettes · rentrée', href: '/studio/projets/44444444-4444-4444-8444-444444444444/produit' },
  })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: () => f.projets(), verserSelectionDansProjet: (x: { projectId: string; ids: string[]; role: string; scope: string }) => f.verser(x), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Utiliser dans un projet » depuis la barre de sélection. On
 * MONTE l'écran (jsdom), on coche, on ouvre la fenêtre, on lit ce qu'elle dit
 * (ce qui part, ce qui est écarté et pourquoi, la liste des projets) et l'appel
 * réellement parti · UNE fois, avec les seules images versables, le projet, le
 * rôle et la portée choisis. Après succès, un lien mène au projet.
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
    media(U3, 'rush.mp4', { kind: 'video', mimeType: 'video/mp4' }), media(U4, 'douteuse.jpg', { rights: 'a_preciser' }),
  ],
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} gestion={GESTION} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const cocher = (h: HTMLElement, nom: string) => clic(h.querySelector(`button.dchk[aria-label="Sélectionner ${nom}"]`));
const geste = (h: HTMLElement) => h.querySelector('.dbulk button[data-geste="projet"]') as HTMLButtonElement | null;
const fenetre = (h: HTMLElement) => h.querySelector('[role="dialog"] [data-versement=""]') as HTMLElement | null;
const champ = (h: HTMLElement, cle: string) => fenetre(h)!.querySelector(`[data-versement="${cle}"]`) as HTMLElement | null;
const choisir = async (s: HTMLElement | null, valeur: string) => {
  const x = s as HTMLSelectElement;
  await act(async () => { x.value = valeur; x.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('« Utiliser dans un projet » · ouvert depuis la barre de sélection', () => {
  it('fichiers sélectionnés · le geste est OUVERT (il n’est plus parmi les gestes fermés)', async () => {
    const h = await monter();
    await cocher(h, 'face.jpg');
    expect([geste(h)?.textContent, geste(h)?.disabled]).toEqual(['Utiliser dans un projet', false]);
    expect(h.querySelector('.dbulk button[data-ferme="projet"]')).toBeNull();
  });

  it('un dossier seul · fermé, avec sa raison', async () => {
    const h = await monter();
    await clic(h.querySelector('button.fsel[aria-label="Sélectionner Photos produit"]'));
    expect([geste(h)!.disabled, geste(h)!.title]).toEqual([true, RAISONS_SELECTION.projetDossiers]);
  });

  it('la fenêtre dit ce qui part et ce qui est écarté, liste les projets, et verse UNE fois les seules images, avec le projet, le rôle et la portée choisis', async () => {
    const h = await monter();
    for (const n of ['face.jpg', 'dos.jpg', 'rush.mp4', 'douteuse.jpg']) await cocher(h, n);
    await clic(geste(h));
    expect(f.projets).toHaveBeenCalledTimes(1);
    expect(champ(h, 'phrase')!.textContent).toBe('2 images deviendront des références du projet · 2 fichiers écartés.');
    expect([...champ(h, 'ecartes')!.querySelectorAll('li')].map((li) => li.textContent)).toEqual([`rush.mp4 · ${RAISONS_ECART_VERSEMENT.type}`, `douteuse.jpg · ${RAISONS_ECART_VERSEMENT.droits}`]);
    expect([...champ(h, 'projet')!.querySelectorAll('option:not([disabled])')].map((o) => o.textContent)).toEqual(['Lunettes · rentrée · Marque A1']);
    const bouton = champ(h, 'verser') as HTMLButtonElement;
    expect([bouton.textContent, bouton.disabled, bouton.title]).toEqual(['Verser 2 images', true, 'Choisis un projet.']);
    await choisir(champ(h, 'projet'), PROJET);
    expect(bouton.title).toBe('Choisis un rôle · aucun rôle n’est déduit du fichier.');
    expect([...champ(h, 'role')!.querySelectorAll('option:not([disabled])')].map((o) => o.textContent)).toEqual(['Identité personnage', 'Style', 'Composition', 'Logo', 'Élément à intégrer']);
    await choisir(champ(h, 'role'), 'style');
    expect(champ(h, 'effet')!.textContent).toBe('Matière, lumière, palette · ni le sujet, ni le produit, ni le logo.');
    expect(bouton.title).toBe('Choisis une portée.');
    await choisir(champ(h, 'portee'), 'background');
    expect(bouton.disabled).toBe(false);
    await clic(bouton);
    expect(f.verser).toHaveBeenCalledTimes(1);
    expect(f.verser).toHaveBeenCalledWith({ projectId: PROJET, ids: [U1, U2], role: 'style', scope: 'background' });
    const succes = champ(h, 'succes')!;
    expect(succes.textContent).toContain('2 images versées dans « Lunettes · rentrée » · rôle Style.');
    expect(succes.querySelector('a')!.getAttribute('href')).toBe(`/studio/projets/${PROJET}/produit`);
    expect(toasts).toEqual(['2 images versées dans « Lunettes · rentrée » · rôle Style.']);
  });

  it('refus du serveur · la raison est dite, aucun succès affiché', async () => {
    f.verser.mockResolvedValueOnce({ ok: false, code: 'INVALID_SCHEMA', message: 'x', targetIds: [], status: 422, recoverable: true, traceId: 't', violations: [{ chemin: 'fichiers/0', raison: '« face.jpg » appartient à une autre marque que le projet.' }] });
    const h = await monter();
    await cocher(h, 'face.jpg');
    await clic(geste(h));
    await choisir(champ(h, 'projet'), PROJET);
    await choisir(champ(h, 'role'), 'composition');
    await choisir(champ(h, 'portee'), 'global');
    await clic(champ(h, 'verser'));
    expect(champ(h, 'erreur')!.textContent).toBe('« face.jpg » appartient à une autre marque que le projet.');
    expect(champ(h, 'succes')).toBeNull();
  });

  it('sans droit Studios · la liste des projets est refusée, dit pourquoi, et rien ne peut partir', async () => {
    f.projets.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN', message: 'Ton rôle ne permet pas cette action.', targetIds: [], status: 403, recoverable: false, traceId: 't' });
    const h = await monter();
    await cocher(h, 'face.jpg');
    await clic(geste(h));
    expect(champ(h, 'refus-projets')!.textContent).toBe('Ton rôle ne permet pas cette action.');
    expect((champ(h, 'projet') as HTMLSelectElement).disabled).toBe(true);
    expect((champ(h, 'verser') as HTMLButtonElement).disabled).toBe(true);
    expect(f.verser).not.toHaveBeenCalled();
  });

  it('seulement une vidéo · rien à verser, le bouton le dit', async () => {
    const h = await monter();
    await cocher(h, 'rush.mp4');
    await clic(geste(h));
    const bouton = champ(h, 'verser') as HTMLButtonElement;
    expect([bouton.disabled, bouton.title]).toEqual([true, 'Aucune image à verser · le fichier est écarté.']);
  });
});
