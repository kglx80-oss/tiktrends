// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRIVE_CONNEXION_INACTIVE, connexionDrive, donneesDrive, jargonTechnique, LOT_ANALYSE_IMAGES, lireImportLiens, vueDrive, ETAT_DRIVE_INITIAL, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  importer: vi.fn(async () => ({ ok: true as const })),
  ia: vi.fn(async () => ({ ok: true as const })),
  template: vi.fn(async () => ({ ok: true as const, isTemplate: true })),
  tag: vi.fn(async () => ({ ok: true as const, tags: ['plage'] })),
  lot: vi.fn(async () => ({ ok: true as const, tagged: 2 })),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: f.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: f.importer, toggleAssetAiAction: f.ia, basculerTemplateAction: f.template, tagAssetAction: f.tag, tagUntaggedImagesAction: f.lot,
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({ creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn() }));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Vague 2 · les gestes de l'écran V5 `/assets` portés dans la Bibliothèque
 * Spatiale · on MONTE l'écran (jsdom), on agit, on lit le HTML et l'appel
 * réellement parti : import par lien (et asset commun), usage par l'IA,
 * template, analyse d'une image et du lot (prix annoncé avant le clic),
 * sélecteur Google Drive.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const toast = vi.fn();
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); });

const T0 = '2026-10-20T10:00:00.000Z';
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 3, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: true, admin: true, messageDrive: null };
const monter = async (over: { gestion?: GestionBibliotheque; connecte?: boolean } = {}) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const donnees = donneesDrive({ dossiers: [], medias: [media('m1'), media('m2', { name: 'plage-ete.jpg', ia: { utilisable: false, template: true, tags: ['plage', 'été'] } })] });
  const drive = connexionDrive({ available: true, needBrand: false, connected: !!over.connecte, folderId: null, folderName: null });
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={donnees} lectureSeule={null} stockage drive={drive} maintenant={T0} gestion={over.gestion ?? GESTION} /></FournisseurSpatial>); });
  return el;
};
const bouton = (h: HTMLElement, re: RegExp) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '') || re.test(b.getAttribute('aria-label') ?? '')) as HTMLButtonElement | undefined;
const clic = async (b: HTMLElement | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };
const saisir = async (champ: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(champ), 'value')!.set!;
  await act(async () => { setter.call(champ, v); champ.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('Spatial · Bibliothèque · importer par lien', () => {
  it('le menu « Nouveau » ouvre l’import par lien · chaque adresse part à importAssetAction, commune si demandé', async () => {
    const h = await monter();
    await clic(bouton(h, /^Nouveau$/));
    await clic(bouton(h, /Importer comme commun à toutes les marques/));
    expect(bouton(h, /Import commun à toutes les marques · activé/)?.getAttribute('aria-pressed')).toBe('true');
    await clic(bouton(h, /Importer par lien/));
    await saisir(h.querySelector('textarea[aria-label="Adresses à importer"]')!, 'https://cdn.exemple/rush-1.mp4\nhttps://cdn.exemple/rush-2.mp4');
    await act(async () => { h.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(f.importer).toHaveBeenCalledTimes(2);
    expect(f.importer).toHaveBeenCalledWith({ name: 'rush-1.mp4', url: 'https://cdn.exemple/rush-1.mp4', kind: 'video', common: true });
    expect(toast).toHaveBeenCalledWith('2 éléments importés');
  });
  it('un lien de DOSSIER Drive est refusé avec sa raison, rien ne part', () => {
    const r = lireImportLiens('https://drive.google.com/drive/folders/abc');
    expect(r.liens).toEqual([]);
    expect(r.erreur).toMatch(/DOSSIER Drive/);
    expect(lireImportLiens('https://drive.google.com/file/d/1AbC/view', 'Rush').liens).toEqual([{ nom: 'Rush', url: 'https://drive.google.com/file/d/1AbC/view' }]);
    expect(lireImportLiens('https://drive.google.com/file/d/1AbC/view').liens[0]!.nom).toBe('1AbC');
  });
});

describe('Spatial · Bibliothèque · usage par l’IA d’un fichier', () => {
  it('l’aperçu porte « Utilisable par l’IA », « Template », les tags et l’analyse au prix annoncé', async () => {
    const h = await monter();
    await clic(bouton(h, /Aperçu de plage-ete\.jpg/));
    const ia = h.querySelector('[data-geste="ia-fichier"]')!;
    expect(ia, 'le bloc IA est absent').toBeTruthy();
    const cases = [...ia.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([false, true]);
    expect([...ia.querySelectorAll('.pill')].map((x) => x.textContent)).toEqual(['plage', 'été']);
    expect(bouton(ia as HTMLElement, /Analyser/)!.textContent).toBe('Analyser à nouveau · 1 crédit');
    await act(async () => { cases[0]!.click(); });
    expect(f.ia).toHaveBeenCalledWith({ id: 'm2', useForAi: true });
    await act(async () => { cases[1]!.click(); });
    expect(f.template).toHaveBeenCalledWith({ id: 'm2', on: false });
    await clic(bouton(ia as HTMLElement, /Analyser/));
    expect(f.tag).toHaveBeenCalledWith({ id: 'm2' });
  });
  it('templates · le badge se voit de tous, seul l’administrateur range un fichier en template', async () => {
    const h = await monter({ gestion: { ...GESTION, admin: false } });
    await clic(bouton(h, /Aperçu de plage-ete\.jpg/));
    expect(h.querySelector('[data-badge="template"]')?.textContent).toBe('Template');
    const ia = h.querySelector('[data-geste="ia-fichier"]')!;
    expect(ia.querySelectorAll('input[type="checkbox"]'), 'un non-administrateur voit l’écriture du template').toHaveLength(1);
    expect(ia.textContent).not.toContain('Visible du client comme modèle');
  });
  it('sans IA · l’analyse est fermée avec sa raison, aucun appel', async () => {
    const h = await monter({ gestion: { ...GESTION, analyse: { ...GESTION.analyse, raison: 'Analyse non activée' } } });
    await clic(bouton(h, /Aperçu de m1\.jpg/));
    const b = bouton(h.querySelector('[data-geste="ia-fichier"]') as HTMLElement, /Analyser/)!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('Analyse non activée');
  });
  it('le lot d’images sans tags annonce son plafond de crédits avant le clic', async () => {
    const h = await monter();
    await clic(bouton(h, /^Nouveau$/));
    const b = bouton(h, /sans tags/)!;
    expect(b.textContent).toBe('Analyser 3 images sans tags · jusqu’à 3 crédits');
    await clic(b);
    expect(f.lot).toHaveBeenCalledTimes(1);
  });
  it('le lot annoncé suit la borne RÉELLE de l’action (vingt images par appel)', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/assets.ts'), 'utf8');
    const corps = src.slice(src.indexOf('export async function tagUntaggedImagesAction'), src.indexOf('export async function presignAssetUploadAction'));
    expect(corps).toContain(`.limit(${LOT_ANALYSE_IMAGES})`);
  });
  it('le filtre par type ne garde que ce type (un SVG est une image)', () => {
    const d = donneesDrive({ dossiers: [], medias: [media('a'), media('b', { kind: 'video', mimeType: 'video/mp4' }), media('c', { mimeType: 'image/svg+xml' })] });
    const ids = (type: 'image' | 'video' | 'tous') => vueDrive(d, { ...ETAT_DRIVE_INITIAL, type }).fichiers.map((x) => x.id).sort();
    expect(ids('video')).toEqual(['b']);
    expect(ids('image')).toEqual(['a', 'c']);
    expect(ids('tous')).toEqual(['a', 'b', 'c']);
  });
  it('Drive · la tuile dit le dernier succès, ou la dernière tentative en échec', () => {
    const base = { available: true, needBrand: false, connected: true, folderId: 'f', folderName: 'Rushs' };
    expect(connexionDrive({ ...base, syncedAt: '2026-10-20T10:00:00.000Z', dernier: null }).resume).toBe('Dossier « Rushs » · synchronisé le 20 oct.');
    expect(connexionDrive({ ...base, syncedAt: '2026-10-20T10:00:00.000Z', dernier: { at: '2026-10-21T10:00:00.000Z', ok: false } }).resume).toBe('Dossier « Rushs » · dernière synchro en échec');
    expect(connexionDrive({ ...base, syncedAt: null }).resume).toBe('Dossier « Rushs » · jamais synchronisé');
  });
  it('la recherche trouve un fichier par ses tags', () => {
    const d = donneesDrive({ dossiers: [], medias: [media('a', { name: 'IMG_001.jpg', ia: { utilisable: true, template: false, tags: ['Plage'] } }), media('b')] });
    expect(vueDrive(d, { ...ETAT_DRIVE_INITIAL, recherche: 'plage' }).fichiers.map((x) => x.id)).toEqual(['a']);
  });
});

describe('Spatial · Bibliothèque · sélecteur Google Drive', () => {
  it('Drive connecté sans dossier · la tuile propose de choisir le dossier, le menu aussi (dossier et fichiers)', async () => {
    const h = await monter({ connecte: true });
    expect(bouton(h, /Choisir le dossier Google Drive/)).toBeTruthy();
    await clic(bouton(h, /^Nouveau$/));
    expect(bouton(h, /Choisir le dossier Drive/)).toBeTruthy();
    expect(bouton(h, /Importer des fichiers Drive/)).toBeTruthy();
  });
  it('Drive pas activé · ce qui manque, qui agit, le repli par lien et le ticket interne, sans jargon', async () => {
    const h = await monter({ gestion: { ...GESTION, messageDrive: DRIVE_CONNEXION_INACTIVE } });
    const b = h.querySelector('[data-geste="drive-inactif"]')!;
    const t = b.textContent ?? '';
    expect(t).toContain(DRIVE_CONNEXION_INACTIVE.constat);
    expect(t).toMatch(/côté plateforme, pas depuis ton espace/);
    expect(t).toContain('seuls ses admins le lisent');
    expect(t).toMatch(/importer tes fichiers Drive par lien/);
    expect(jargonTechnique(t)).toEqual([]);
    expect(b.querySelector('a[href="/support"]')?.textContent).toBe('Ouvrir un ticket interne');
  });
  it('sélecteur non configuré · aucun bouton de sélection', async () => {
    const h = await monter({ connecte: true, gestion: { ...GESTION, selecteurDrive: false } });
    expect(bouton(h, /Choisir le dossier/)).toBeUndefined();
  });
});
