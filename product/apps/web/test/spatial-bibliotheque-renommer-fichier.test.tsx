// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, REFUS_DOSSIER, REFUS_FICHIER, RAISONS_SELECTION, type DonneesDrive, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  renommerFichier: vi.fn(async (x: { id: string; nom: string }): Promise<{ ok?: true; nom?: string; error?: string }> => ({ ok: true, nom: x.nom })),
  renommerDossier: vi.fn(async (x: { id: string; nom: string }): Promise<{ ok?: true; nom?: string; error?: string }> => ({ ok: true, nom: x.nom })),
  deplacerDossiers: vi.fn(async (x: { ids: string[]; parentId: string | null }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  deplacerDossier: vi.fn(async (): Promise<{ ok?: true; error?: string }> => ({ ok: true })),
  ranger: vi.fn(async (x: { ids: string[] }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: f.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
  renommerAssetAction: (x: { id: string; nom: string }) => f.renommerFichier(x),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(), definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(),
  affecterAssetsDossierAction: (x: { ids: string[] }) => f.ranger(x), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: (x: { id: string; nom: string }) => f.renommerDossier(x), deplacerDossierAction: () => f.deplacerDossier(),
  deplacerDossiersAction: (x: { ids: string[]; parentId: string | null }) => f.deplacerDossiers(x),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · RENOMMER UN FICHIER (menu « … » et aperçu) et DÉPLACER
 * PLUSIEURS DOSSIERS (barre de sélection). On MONTE l'écran (jsdom), on ouvre
 * la fenêtre, on lit ce qu'elle présélectionne et ce qu'elle dit, l'appel
 * RÉELLEMENT parti (une fois, avec ce seul fichier, le nom rogné et son
 * extension), le refus gardé dans la fenêtre ; dans la barre, les destinations
 * fermées avec la phrase de l'action et l'appel groupé unique.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SHOOT = uid(1), HIVER = uid(2), ARCH = uid(3), SYS = uid(4), F1 = uid(10), F2 = uid(11);
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1024, createdAt: T0, folderId: null, rights: null, ...extra,
});
/** Shooting › Hiver ; Archives ; Système (verrouillé) · à la racine des assets, « IMG_0042.jpg » et « Shooting v1.2 ». */
const DONNEES = donneesDrive({
  dossiers: [dossier(SHOOT, 'Shooting'), dossier(HIVER, 'Hiver', { parentId: SHOOT }), dossier(ARCH, 'Archives'), dossier(SYS, 'Système', { locked: true })],
  medias: [media(F1, 'IMG_0042.jpg'), media(F2, 'Shooting v1.2')],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async (lectureSeule: string | null = null, donnees: DonneesDrive = DONNEES) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={donnees} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const declencheur = (h: HTMLElement, nom: string) => h.querySelector(`button[data-menu-fichier][aria-label="Actions sur ${nom}"]`) as HTMLButtonElement | null;
const menu = (h: HTMLElement) => h.querySelector('[role="menu"].dmenu') as HTMLElement | null;
const entree = (h: HTMLElement, cle: string) => menu(h)?.querySelector(`[data-menu="${cle}"]`) as HTMLElement | null;
const ouvrirMenu = async (h: HTMLElement, nom: string) => { await clic(declencheur(h, nom)); expect(menu(h), 'menu non ouvert').toBeTruthy(); };
const dialogue = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const saisie = () => dialogue()?.querySelector('input') as HTMLInputElement | null;
const ecrire = async (texte: string) => {
  const i = saisie();
  expect(i, 'saisie du renommage introuvable').toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, texte);
    i!.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const valider = async () => { await act(async () => { saisie()!.form!.requestSubmit(); }); };
const alerte = () => dialogue()?.querySelector('[role="alert"]')?.textContent ?? null;

describe('« Renommer » un fichier · depuis son menu « … »', () => {
  it('la fenêtre « Renommer le fichier » · le nom actuel, la BASE présélectionnée, l’extension conservée dite', async () => {
    const h = await monter();
    await ouvrirMenu(h, 'IMG_0042.jpg');
    expect([entree(h, 'renommer')?.textContent, entree(h, 'renommer')?.getAttribute('aria-disabled')]).toEqual(['Renommer', null]);
    await clic(entree(h, 'renommer'));
    expect([menu(h), dialogue()?.querySelector('h2')?.textContent, dialogue()?.querySelector('form')?.getAttribute('data-renommer-fichier')]).toEqual([null, 'Renommer le fichier', F1]);
    const i = saisie()!;
    expect([i.value, i.getAttribute('aria-label'), document.activeElement === i, i.selectionStart, i.selectionEnd]).toEqual(['IMG_0042.jpg', 'Nouveau nom de IMG_0042.jpg', true, 0, 'IMG_0042'.length]);
    expect(dialogue()!.querySelector('[data-extension-conservee]')?.textContent).toBe('L’extension .jpg est conservée · le type du fichier ne change pas.');
  });

  it('un nouveau nom sans extension · UN appel, ce seul fichier, le nom rogné AVEC son extension · dit, fenêtre fermée, focus rendu', async () => {
    const h = await monter();
    await ouvrirMenu(h, 'IMG_0042.jpg');
    await clic(entree(h, 'renommer'));
    await ecrire('  Flacon face  ');
    await valider();
    expect(f.renommerFichier.mock.calls).toEqual([[{ id: F1, nom: 'Flacon face.jpg' }]]);
    expect([dialogue(), toasts, f.refresh.mock.calls.length]).toEqual([null, ['Fichier renommé en « Flacon face.jpg »'], 1]);
    expect(document.activeElement, 'le focus ne revient pas au « … » du fichier').toBe(declencheur(h, 'IMG_0042.jpg'));
    expect([f.renommerDossier.mock.calls.length, f.ranger.mock.calls.length]).toEqual([0, 0]);
  });

  it('un nom sans extension connue (« Shooting v1.2 ») · rien n’est ajouté, tout est présélectionné', async () => {
    const h = await monter();
    await ouvrirMenu(h, 'Shooting v1.2');
    await clic(entree(h, 'renommer'));
    expect([saisie()!.selectionStart, saisie()!.selectionEnd, dialogue()!.querySelector('[data-extension-conservee]')]).toEqual([0, 'Shooting v1.2'.length, null]);
    await ecrire('Shooting final');
    await valider();
    expect(f.renommerFichier.mock.calls).toEqual([[{ id: F2, nom: 'Shooting final' }]]);
  });

  it('un nom refusé par la règle du noyau · dit DANS la fenêtre, aucun appel ; le même nom · fermé sans appel', async () => {
    const h = await monter();
    await ouvrirMenu(h, 'IMG_0042.jpg');
    await clic(entree(h, 'renommer'));
    for (const [texte, raison] of [['   ', REFUS_FICHIER.vide], ['.jpg', REFUS_FICHIER.vide], ['n'.repeat(157), 'Nom trop long (max 160 caractères, extension .jpg comprise).'], ['a\u202egpj.exe', REFUS_FICHIER.interdit]] as const) {
      await ecrire(texte);
      await valider();
      expect([texte.length, alerte(), saisie()!.getAttribute('aria-invalid')]).toEqual([texte.length, raison, 'true']);
    }
    expect(f.renommerFichier).not.toHaveBeenCalled();
    await ecrire(' IMG_0042 ');
    await valider();
    expect([dialogue(), f.renommerFichier.mock.calls.length, toasts]).toEqual([null, 0, []]);
  });

  it('le refus du serveur reste dans la fenêtre · aucun faux succès', async () => {
    f.renommerFichier.mockResolvedValueOnce({ error: REFUS_FICHIER.introuvable });
    const h = await monter();
    await ouvrirMenu(h, 'IMG_0042.jpg');
    await clic(entree(h, 'renommer'));
    await ecrire('Nouveau');
    await valider();
    expect([alerte(), toasts, f.renommerFichier.mock.calls.length, f.refresh.mock.calls.length]).toEqual([REFUS_FICHIER.introuvable, [], 1, 0]);
  });

  it('lecture seule · « Renommer » FERMÉ avec la raison · aucune fenêtre, aucun appel', async () => {
    const h = await monter(LS);
    await ouvrirMenu(h, 'IMG_0042.jpg');
    expect([entree(h, 'renommer')?.getAttribute('aria-disabled'), entree(h, 'renommer')?.title]).toEqual(['true', LS]);
    await clic(entree(h, 'renommer'));
    expect([dialogue(), f.renommerFichier.mock.calls.length]).toEqual([null, 0]);
  });
});

describe('« Renommer » un fichier · depuis son aperçu', () => {
  const ouvrirApercu = async (h: HTMLElement, nom: string) => clic(h.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`));

  it('le bouton « Renommer » de l’aperçu ouvre la même fenêtre · UN appel, le focus revient au bouton', async () => {
    const h = await monter();
    await ouvrirApercu(h, 'IMG_0042.jpg');
    const b = h.querySelector('aside.dprev [data-geste="renommer-fichier"]') as HTMLButtonElement;
    expect(b?.textContent).toBe('Renommer');
    await clic(b);
    expect(dialogue()?.querySelector('h2')?.textContent).toBe('Renommer le fichier');
    await ecrire('Dos');
    await valider();
    expect(f.renommerFichier.mock.calls).toEqual([[{ id: F1, nom: 'Dos.jpg' }]]);
    expect(document.activeElement).toBe(h.querySelector('aside.dprev [data-geste="renommer-fichier"]'));
  });

  it('lecture seule, ou fichier en corbeille · pas de bouton « Renommer » dans l’aperçu', async () => {
    let h = await monter(LS);
    await ouvrirApercu(h, 'IMG_0042.jpg');
    expect([!!h.querySelector('aside.dprev'), h.querySelector('[data-geste="renommer-fichier"]')]).toEqual([true, null]);
    act(() => { root?.unmount(); }); el?.remove();
    const jete = donneesDrive({ dossiers: [], medias: [media(F1, 'IMG_0042.jpg', { deletedAt: T0 })] });
    h = await monter(null, jete);
    await clic([...h.querySelectorAll('nav.dsec button')].find((x) => x.textContent?.startsWith('Corbeille')));
    await ouvrirApercu(h, 'IMG_0042.jpg');
    expect([!!h.querySelector('aside.dprev [data-geste="restaurer-fichier"]'), h.querySelector('[data-geste="renommer-fichier"]')]).toEqual([true, null]);
  });
});

describe('« Déplacer vers… » de la barre · une sélection de DOSSIERS, en une action', () => {
  const caseDossier = (h: HTMLElement, nom: string) => h.querySelector(`button.fsel[aria-label="Sélectionner ${nom}"]`);
  const caseFichier = (h: HTMLElement, nom: string) => h.querySelector(`button.dchk[aria-label="Sélectionner ${nom}"]`);
  const liste = (h: HTMLElement) => h.querySelector('.dbulk select[data-geste="ranger"]') as HTMLSelectElement;
  const choisir = async (s: HTMLSelectElement, valeur: string) => { await act(async () => { s.value = valeur; s.dispatchEvent(new Event('change', { bubbles: true })); }); };

  it('Shooting et Archives · la liste juge chaque destination (fermées avec la phrase de l’action) · UN appel groupé, dit, sélection vidée', async () => {
    const h = await monter();
    await clic(caseDossier(h, 'Shooting'));
    await clic(caseDossier(h, 'Archives'));
    const s = liste(h);
    expect([s.disabled, s.getAttribute('aria-label')]).toEqual([false, 'Déplacer les dossiers sélectionnés vers un dossier']);
    expect([...s.options].map((o) => [o.textContent, o.disabled, o.title])).toEqual([
      ['Déplacer vers…', true, ''],
      ['Assets de la marque · non classé', true, 'Les dossiers sont déjà ici.'],
      ['Archives', true, REFUS_DOSSIER.destinationSelectionnee],
      ['Shooting', true, REFUS_DOSSIER.destinationSelectionnee],
      ['Shooting › Hiver', true, `« Shooting » · ${REFUS_DOSSIER.descendant}`],
      ['Système', true, REFUS_DOSSIER.destinationSysteme],
    ]);
    // Une destination fermée, forcée · aucun appel.
    await choisir(s, HIVER);
    expect(f.deplacerDossiers).not.toHaveBeenCalled();
    await clic(caseDossier(h, 'Shooting'));
    expect([...liste(h).options].find((o) => o.value === HIVER)).toMatchObject({ disabled: false });
    await choisir(liste(h), HIVER);
    expect(f.deplacerDossiers.mock.calls).toEqual([[{ ids: [ARCH], parentId: HIVER }]]);
    expect([toasts, h.querySelector('.dbulk'), f.refresh.mock.calls.length]).toEqual([['1 dossier déplacé dans « Shooting › Hiver »'], null, 1]);
    expect([f.deplacerDossier.mock.calls.length, f.ranger.mock.calls.length]).toEqual([0, 0]);
  });

  it('le refus du serveur est dit · la sélection est gardée', async () => {
    f.deplacerDossiers.mockResolvedValueOnce({ error: REFUS_DOSSIER.selectionIntrouvable });
    const h = await monter();
    await clic(caseDossier(h, 'Archives'));
    await choisir(liste(h), SHOOT);
    expect(f.deplacerDossiers.mock.calls).toEqual([[{ ids: [ARCH], parentId: SHOOT }]]);
    expect([toasts, !!h.querySelector('.dbulk')]).toEqual([[REFUS_DOSSIER.selectionIntrouvable], true]);
  });

  it('une sélection MIXTE · « Déplacer vers… » fermé avec sa phrase, aucun appel', async () => {
    const h = await monter();
    await clic(caseDossier(h, 'Archives'));
    await clic(caseFichier(h, 'IMG_0042.jpg'));
    expect([liste(h).disabled, liste(h).title]).toEqual([true, RAISONS_SELECTION.rangerMixte]);
    await choisir(liste(h), SHOOT);
    expect([f.deplacerDossiers.mock.calls.length, f.ranger.mock.calls.length]).toEqual([0, 0]);
  });
});
