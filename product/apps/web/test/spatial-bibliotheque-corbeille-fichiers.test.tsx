// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { connexionDrive, donneesDrive, LOT_ANALYSE_IMAGES, NOTE_FICHIER_CORBEILLE, type DossierSource, type MediaSource } from '@tiktrends/core';

type R = { ok?: true; n?: number; error?: string };
const f = vi.hoisted(() => ({
  corbeille: vi.fn(async (x: { ids: string[] }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  restaurer: vi.fn(async (x: { ids: string[] }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  definitif: vi.fn(async (_x: { id: string }): Promise<{ ok?: true; error?: string }> => ({ ok: true })),
  dossierCorbeille: vi.fn(async (_x: { id: string }) => ({ ok: true as const })),
  dossierRestaurer: vi.fn(async (_x: { id: string }) => ({ ok: true as const })),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: f.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), importAssetAction: vi.fn(),
  toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  deleteAssetAction: (x: { id: string }) => f.definitif(x),
  mettreAssetsCorbeilleAction: (x: { ids: string[] }) => f.corbeille(x),
  restaurerAssetsAction: (x: { ids: string[] }) => f.restaurer(x),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: (x: { id: string }) => f.dossierCorbeille(x), restaurerDossierAction: (x: { id: string }) => f.dossierRestaurer(x),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(), definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(),
  affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · la CORBEILLE DES FICHIERS à l'écran. On MONTE l'écran
 * (jsdom), on ouvre la section « Corbeille », on lit son HTML (les fichiers
 * jetés, leurs cases, l'aperçu avec « Restaurer » et « Supprimer
 * définitivement ») et les appels réellement partis · « Mettre à la corbeille »
 * n'appelle JAMAIS la suppression définitive, qui n'est offerte qu'à un fichier
 * déjà dans la corbeille, confirmée.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...o });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
/** Un fichier vivant ; deux fichiers jetés (l'un rangé dans « Photos produit ») ; un dossier jeté. */
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit'), dossier('d-jete', 'Ancien shooting', { deletedAt: T0 })],
  medias: [media('vivant'), media('jete-1', { folderId: 'd-photos', deletedAt: T0 }), media('jete-2', { deletedAt: T0 })],
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });
const props = (o: Partial<Parameters<typeof Bibliotheque>[0]> = {}) => ({ donnees: DONNEES, lectureSeule: null, stockage: true, drive: DRIVE, maintenant: T0, gestion: GESTION, ...o });

const monter = async (o: Partial<Parameters<typeof Bibliotheque>[0]> = {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque {...props(o)} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const sectionCorbeille = (h: HTMLElement) => [...h.querySelectorAll('nav.dsec button')].find((b) => b.textContent?.startsWith('Corbeille')) as HTMLButtonElement;
const nomsFichiers = (h: HTMLElement) => [...h.querySelectorAll('.dfiles .dcard .nm')].map((n) => n.textContent);
const apercu = (h: HTMLElement) => h.querySelector('aside.dprev') as HTMLElement | null;
const boutonApercu = (h: HTMLElement, texte: string) => [...apercu(h)!.querySelectorAll('button')].find((b) => b.textContent === texte) as HTMLButtonElement | undefined;
const ouvrirApercu = async (h: HTMLElement, nom: string) => clic(h.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`));
const barre = (h: HTMLElement) => h.querySelector('.dbulk') as HTMLElement | null;
const boutonBarre = (h: HTMLElement, texte: string) => [...barre(h)!.querySelectorAll('button')].find((b) => b.textContent === texte) as HTMLButtonElement | undefined;

describe('la vue « Corbeille » · rendu HTML', () => {
  it('hors corbeille (rendu serveur) · aucun fichier jeté n’apparaît, ni son nom', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Bibliotheque {...props()} /></FournisseurSpatial>);
    expect(html).toContain('vivant.jpg');
    expect(html, 'un fichier de la corbeille est montré dans le drive').not.toContain('jete-1.jpg');
    expect(html).not.toContain('jete-2.jpg');
  });

  it('la section « Corbeille » compte le dossier et les deux fichiers, et montre les fichiers jetés avec leur case', async () => {
    const h = await monter();
    expect(sectionCorbeille(h).textContent).toBe('Corbeille3');
    await clic(sectionCorbeille(h));
    expect(nomsFichiers(h)).toEqual(['jete-1.jpg', 'jete-2.jpg']);
    const main = h.querySelector('section.dmain')!.innerHTML;
    expect(main).toContain('Ancien shooting');
    expect(main, 'un fichier vivant est montré dans la corbeille').not.toContain('vivant.jpg');
    expect([...h.querySelectorAll('.dfiles button.dchk')].map((b) => b.getAttribute('aria-label'))).toEqual(['Sélectionner jete-1.jpg', 'Sélectionner jete-2.jpg']);
  });

  it('l’aperçu d’un fichier jeté · la note, « Restaurer » et « Supprimer définitivement » ; ni corbeille, ni droits, ni IA', async () => {
    const h = await monter();
    await clic(sectionCorbeille(h));
    await ouvrirApercu(h, 'jete-2.jpg');
    const a = apercu(h)!;
    expect(a.querySelector('[data-geste="note-corbeille"]')!.textContent).toBe(NOTE_FICHIER_CORBEILLE);
    expect([...a.querySelectorAll('button[data-geste]')].map((b) => b.textContent)).toEqual(['Restaurer', 'Supprimer définitivement']);
    expect(a.querySelector('select[aria-label="Droits d’usage"]'), 'un fichier jeté se modifie encore').toBeNull();
    expect(a.querySelector('[data-geste="ia-fichier"]')).toBeNull();
  });

  it('lecture seule · la corbeille se consulte, aucun geste', async () => {
    const h = await monter({ lectureSeule: 'Ton offre ne permet pas d’ajouter des médias.' });
    await clic(sectionCorbeille(h));
    expect(nomsFichiers(h)).toEqual(['jete-1.jpg', 'jete-2.jpg']);
    expect(h.querySelector('button.dchk')).toBeNull();
    await ouvrirApercu(h, 'jete-1.jpg');
    expect(apercu(h)!.querySelectorAll('button[data-geste]').length).toBe(0);
  });
});

describe('les gestes', () => {
  it('fichier vivant · « Mettre à la corbeille » (une action, un id) ; « Supprimer définitivement » n’est pas proposé', async () => {
    const h = await monter();
    await ouvrirApercu(h, 'vivant.jpg');
    expect(boutonApercu(h, 'Supprimer définitivement'), 'la suppression définitive est offerte hors corbeille').toBeUndefined();
    await clic(boutonApercu(h, 'Mettre à la corbeille'));
    expect(f.corbeille.mock.calls).toEqual([[{ ids: ['vivant'] }]]);
    expect(f.definitif, 'mettre à la corbeille a appelé la suppression définitive').not.toHaveBeenCalled();
    expect(toasts).toEqual(['1 fichier placé dans la corbeille']);
    expect(apercu(h)).toBeNull();
    expect(f.refresh).toHaveBeenCalled();
  });

  it('aperçu en corbeille · « Restaurer » · une action, un id, jamais la suppression', async () => {
    const h = await monter();
    await clic(sectionCorbeille(h));
    await ouvrirApercu(h, 'jete-2.jpg');
    await clic(boutonApercu(h, 'Restaurer'));
    expect(f.restaurer.mock.calls).toEqual([[{ ids: ['jete-2'] }]]);
    expect(f.definitif).not.toHaveBeenCalled();
    expect(toasts).toEqual(['1 fichier restauré']);
  });

  it('« Supprimer définitivement » · confirmé d’abord ; un refus de la confirmation n’envoie rien', async () => {
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      const h = await monter();
      await clic(sectionCorbeille(h));
      await ouvrirApercu(h, 'jete-1.jpg');
      await clic(boutonApercu(h, 'Supprimer définitivement'));
      expect(f.definitif, 'supprimé sans confirmation').not.toHaveBeenCalled();
      await clic(boutonApercu(h, 'Supprimer définitivement'));
      expect(confirmer).toHaveBeenLastCalledWith('Supprimer définitivement « jete-1.jpg » ? Il quittera la corbeille et ne pourra plus être restauré.');
      expect(f.definitif.mock.calls).toEqual([[{ id: 'jete-1' }]]);
      expect(toasts).toEqual(['Fichier supprimé définitivement']);
    } finally { confirmer.mockRestore(); }
  });

  it('barre de la corbeille · « Restaurer » deux fichiers et un dossier · UNE action pour les fichiers', async () => {
    const h = await monter();
    await clic(sectionCorbeille(h));
    await clic(h.querySelector('button.dchk[aria-label="Sélectionner jete-1.jpg"]'));
    await clic(h.querySelector('button.dchk[aria-label="Sélectionner jete-2.jpg"]'));
    await clic(h.querySelector('button.fsel[aria-label="Sélectionner Ancien shooting"]'));
    await clic(boutonBarre(h, 'Restaurer'));
    expect(f.restaurer.mock.calls).toEqual([[{ ids: ['jete-1', 'jete-2'] }]]);
    expect(f.dossierRestaurer.mock.calls).toEqual([[{ id: 'd-jete' }]]);
    expect(toasts).toEqual(['1 dossier et 2 fichiers restaurés']);
    expect(barre(h)).toBeNull();
  });

  it('barre hors corbeille · un refus des fichiers (tout ou rien) · le dossier ne part pas, la sélection est gardée', async () => {
    f.corbeille.mockResolvedValueOnce({ error: 'Un fichier de la sélection est introuvable · rien n’a été modifié.' } as R);
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const h = await monter();
      await clic(h.querySelector('button.fsel[aria-label="Sélectionner Photos produit"]'));
      await clic(h.querySelector('button.dchk[aria-label="Sélectionner vivant.jpg"]'));
      await clic(boutonBarre(h, 'Mettre à la corbeille'));
      expect(f.corbeille.mock.calls).toEqual([[{ ids: ['vivant'] }]]);
      expect(f.dossierCorbeille, 'le dossier est parti malgré le refus des fichiers').not.toHaveBeenCalled();
      expect(toasts).toEqual(['Un fichier de la sélection est introuvable · rien n’a été modifié.']);
      expect(barre(h)!.querySelector('strong')!.textContent).toBe('2 sélectionnés');
    } finally { confirmer.mockRestore(); }
  });
});
