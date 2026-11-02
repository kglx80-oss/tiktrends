// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { connexionDrive, donneesDrive, REFUS_DOSSIER, type DonneesDrive, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  affecter: vi.fn(async (x: { ids: string[]; folderId: string | null }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
  deplacer: vi.fn(async (_x: { id: string; parentId: string | null }): Promise<unknown> => ({ ok: true })),
  presign: vi.fn(async (): Promise<unknown> => ({ error: 'non' })),
  upload: vi.fn(async (): Promise<unknown> => ({ error: 'non' })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: () => f.upload(), presignAssetUploadAction: () => f.presign(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(), definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(),
  affecterAssetsDossierAction: (x: { ids: string[]; folderId: string | null }) => f.affecter(x), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: vi.fn(), deplacerDossierAction: (x: { id: string; parentId: string | null }) => f.deplacer(x),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · le glisser-déposer à la souris. On MONTE l'écran (jsdom), on
 * simule `dragstart` → `dragover` → `drop` (jsdom n'a pas de `DataTransfer` ·
 * un transfert minimal est posé sur l'événement), et on lit le RÉSULTAT · le
 * dépôt pris ou refusé (`defaultPrevented`, `dropEffect` · ce que le navigateur
 * lit pour le curseur), l'état montré sur la cible, l'appel réellement parti
 * (une fois, avec les bons ids), ou son absence pour une cible interdite, en
 * lecture seule et au téléphone.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); vi.unstubAllGlobals(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1024, createdAt: T0, folderId: null, rights: null, ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit'), dossier('d-faces', 'Faces', { parentId: 'd-photos' }), dossier('d-ugc', 'UGC'), dossier('d-sys', 'Système', { locked: true })],
  medias: [media(U1, 'face.jpg', { folderId: 'd-photos' }), media(U2, 'dos.jpg', { folderId: 'd-photos' }), media(U3, 'racine.jpg')],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });
const ecran = (lectureSeule: string | null, donnees: DonneesDrive = DONNEES) => <FournisseurSpatial value={CTX}><Bibliotheque donnees={donnees} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>;

const monter = async (lectureSeule: string | null = null) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(ecran(lectureSeule)); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };

/** Le transfert minimal d'un glisser · ce que l'écran pose et ce que le navigateur lit. */
const transfert = () => {
  const donnees: Record<string, string> = {};
  return { donnees, dropEffect: 'none', effectAllowed: 'all', types: [] as string[], files: [] as File[], setData: (t: string, v: string) => { donnees[t] = v; }, getData: (t: string) => donnees[t] ?? '' };
};
type Transfert = ReturnType<typeof transfert>;
const evenement = async (cible: Element | null | undefined, type: string, dt: Transfert) => {
  expect(cible, `cible de ${type} introuvable`).toBeTruthy();
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  await act(async () => { cible!.dispatchEvent(e); });
  return e;
};
/** dragstart sur la source, dragover puis drop sur la cible · le verdict du survol et l'état montré. */
const glisserSur = async (source: Element | null | undefined, cible: Element | null | undefined) => {
  const dt = transfert();
  const depart = await evenement(source, 'dragstart', dt);
  const survol = await evenement(cible, 'dragover', dt);
  const vu = { pris: survol.defaultPrevented, effet: dt.dropEffect, etat: (cible as HTMLElement).getAttribute('data-depot'), contour: (cible as HTMLElement).style.outline };
  await evenement(cible, 'drop', dt);
  await evenement(source, 'dragend', dt);
  return { dt, depart, vu };
};

const carteDossier = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.fcard')].find((c) => c.querySelector('.ftx strong')?.textContent === nom) ?? null;
const carteFichier = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dcard')].find((c) => c.querySelector('.nm')?.textContent === nom) ?? null;
const noeud = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dtree .tnb')].find((b) => b.querySelector('.tnn')?.textContent === nom) ?? null;
const ligne = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dtr')].find((r) => r.querySelector('.dname .nm')?.textContent === nom) ?? null;

describe('glisser-déposer · ce qui se glisse', () => {
  it('rendu serveur · les cartes de dossier réelles et de fichier sont glissables · le dossier système non · rien en lecture seule', () => {
    const doc = document.createElement('div');
    doc.innerHTML = renderToStaticMarkup(ecran(null));
    const glissables = [...doc.querySelectorAll('[draggable="true"]')].map((x) => x.querySelector('.ftx strong, .nm')?.textContent);
    expect(glissables).toEqual(['Photos produit', 'UGC', 'racine.jpg']);
    expect(renderToStaticMarkup(ecran(LS))).not.toContain('draggable');
  });
});

describe('glisser-déposer · fichiers', () => {
  it('un fichier sur une carte de dossier · la cible accepte (mise en évidence), UN appel avec ce fichier et ce dossier, le toast le dit', async () => {
    const h = await monter();
    const { dt, vu } = await glisserSur(carteFichier(h, 'racine.jpg'), carteDossier(h, 'UGC'));
    expect(vu).toEqual({ pris: true, effet: 'move', etat: 'accepte', contour: '2px solid var(--acc)' });
    expect(dt.effectAllowed).toBe('move');
    expect(f.affecter.mock.calls).toEqual([[{ ids: [U3], folderId: 'd-ugc' }]]);
    expect(f.deplacer).not.toHaveBeenCalled();
    expect(toasts).toEqual(['1 fichier rangé dans « UGC »']);
    // Le survol fini, la cible ne porte plus d'état · la zone d'import n'a rien ouvert ni envoyé.
    expect([carteDossier(h, 'UGC')!.getAttribute('data-depot'), h.querySelector('#ddrop')!.hasAttribute('hidden'), f.presign.mock.calls.length]).toEqual([null, true, 0]);
  });

  it('un fichier SÉLECTIONNÉ emporte la sélection de fichiers · déposé sur un nœud de l’arbre, UN appel avec les deux', async () => {
    const h = await monter();
    await clic(carteDossier(h, 'Photos produit')!.querySelector('.fopen'));
    await clic(h.querySelector('button[aria-label="Sélectionner face.jpg"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner dos.jpg"]'));
    const { vu } = await glisserSur(carteFichier(h, 'dos.jpg'), noeud(h, 'UGC'));
    expect(vu).toMatchObject({ pris: true, effet: 'move', etat: 'accepte' });
    expect(f.affecter.mock.calls).toEqual([[{ ids: [U1, U2], folderId: 'd-ugc' }]]);
    expect(toasts).toEqual(['2 fichiers rangés dans « UGC »']);
    expect(h.querySelector('.dbulk')).toBeNull();
  });

  it('un fichier sur la racine « Assets de la marque » de l’arbre · non classé (folderId null)', async () => {
    const h = await monter();
    await clic(carteDossier(h, 'Photos produit')!.querySelector('.fopen'));
    await glisserSur(carteFichier(h, 'face.jpg'), noeud(h, 'Assets de la marque'));
    expect(f.affecter.mock.calls).toEqual([[{ ids: [U1], folderId: null }]]);
  });

  it('un fichier sur le dossier où il est déjà · refus, rien n’est envoyé · la vue liste glisse aussi', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Liste"]'));
    const { vu } = await glisserSur(ligne(h, 'racine.jpg'), noeud(h, 'Assets de la marque'));
    expect(vu).toEqual({ pris: false, effet: 'none', etat: 'refuse', contour: '2px dashed var(--bad)' });
    await glisserSur(ligne(h, 'racine.jpg'), ligne(h, 'UGC'));
    expect(f.affecter.mock.calls).toEqual([[{ ids: [U3], folderId: 'd-ugc' }]]);
  });

  it('un glisser interne lâché hors d’un dossier n’importe rien (la zone d’import des fichiers de l’ordinateur reste fermée)', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteFichier(h, 'racine.jpg'), 'dragstart', dt);
    const survol = await evenement(h.querySelector('#dmain .dbar'), 'dragover', dt);
    await evenement(h.querySelector('#dmain .dbar'), 'drop', dt);
    expect([survol.defaultPrevented, h.querySelector('#ddrop')!.hasAttribute('hidden'), f.presign.mock.calls.length, f.upload.mock.calls.length, f.affecter.mock.calls.length]).toEqual([false, true, 0, 0, 0]);
  });
});

describe('glisser-déposer · dossiers', () => {
  it('un dossier sur un autre · la cible accepte, UN appel avec ce dossier et ce parent, le toast le dit', async () => {
    const h = await monter();
    const { vu } = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'Photos produit'));
    expect(vu).toMatchObject({ pris: true, effet: 'move', etat: 'accepte' });
    expect(f.deplacer.mock.calls).toEqual([[{ id: 'd-ugc', parentId: 'd-photos' }]]);
    expect(f.affecter).not.toHaveBeenCalled();
    expect(toasts).toEqual(['« UGC » déplacé dans « Photos produit »']);
  });

  it('anti-cycle · un dossier sur l’un de ses sous-dossiers · la cible refuse visiblement (curseur interdit, tirets), AUCUN appel', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Déplier Photos produit"]'));
    const { vu } = await glisserSur(carteDossier(h, 'Photos produit'), noeud(h, 'Faces'));
    expect(vu).toEqual({ pris: false, effet: 'none', etat: 'refuse', contour: '2px dashed var(--bad)' });
    expect(f.deplacer).not.toHaveBeenCalled();
    // Lâchée sur la cible refusée · la raison du serveur dite par le toast, UNE fois (dépôt puis fin du glisser).
    expect(toasts).toEqual([REFUS_DOSSIER.descendant]);
  });

  it('un dossier système et le dossier lui-même refusent · aucun appel ; la source n’est pas mise en évidence', async () => {
    const h = await monter();
    const sys = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'Système'));
    expect(sys.vu).toMatchObject({ pris: false, effet: 'none', etat: 'refuse' });
    const soi = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'UGC'));
    expect(soi.vu).toEqual({ pris: false, effet: 'none', etat: null, contour: '' });
    expect(f.deplacer).not.toHaveBeenCalled();
  });

  it('le dossier système ne part pas · son glisser est annulé dès le départ', async () => {
    const h = await monter();
    const sys = carteDossier(h, 'Système')!;
    expect(sys.getAttribute('draggable')).toBeNull();
    const dt = transfert();
    await evenement(sys, 'dragstart', dt);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
    // Aucune charge interne · la carte ne montre rien et le dépôt n'envoie rien (la zone d'import, elle, n'a aucun fichier à importer).
    expect([Object.keys(dt.donnees), carteDossier(h, 'UGC')!.getAttribute('data-depot')]).toEqual([[], null]);
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    expect([f.deplacer.mock.calls.length, f.affecter.mock.calls.length, f.presign.mock.calls.length]).toEqual([0, 0, 0]);
  });
});

describe('glisser-déposer · fermé', () => {
  it('lecture seule · rien ne se glisse, aucune cible ne prend le dépôt, aucun appel', async () => {
    const h = await monter(LS);
    expect(h.querySelectorAll('[draggable]')).toHaveLength(0);
    const r = await glisserSur(carteFichier(h, 'racine.jpg'), carteDossier(h, 'UGC'));
    const d = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'Photos produit'));
    expect([r.vu.pris, r.vu.etat, d.vu.pris, d.vu.etat]).toEqual([false, null, false, null]);
    expect([f.affecter.mock.calls.length, f.deplacer.mock.calls.length, f.presign.mock.calls.length]).toEqual([0, 0, 0]);
  });

  it('téléphone (seuil de la maquette) · rien ne se glisse, aucun appel', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(max-width: 760px)', media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    const h = await monter();
    expect(h.querySelectorAll('[draggable]')).toHaveLength(0);
    const r = await glisserSur(carteFichier(h, 'racine.jpg'), carteDossier(h, 'UGC'));
    expect([Object.keys(r.dt.donnees), r.vu.etat, f.affecter.mock.calls.length]).toEqual([[], null, 0]);
  });
});
