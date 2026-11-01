// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { connexionDrive, donneesDrive, GESTES_SANS_ACTION, LOT_ANALYSE_IMAGES, RAISONS_SELECTION, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  ranger: vi.fn(async (x: { ids: string[]; folderId: string | null }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  droits: vi.fn(async (x: { ids: string[]; droit: string | null }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  ia: vi.fn(async (x: { ids: string[]; useForAi: boolean }): Promise<{ ok?: true; n?: number; error?: string }> => ({ ok: true, n: x.ids.length })),
  corbeille: vi.fn(async (_x: { id: string }) => ({ ok: true as const })),
  unitaire: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: f.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: f.unitaire,
  importAssetAction: vi.fn(), toggleAssetAiAction: f.unitaire, basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(),
  basculerAssetsIaAction: (x: { ids: string[]; useForAi: boolean }) => f.ia(x),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: (x: { id: string }) => f.corbeille(x), restaurerDossierAction: vi.fn(),
  affecterAssetDossierAction: f.unitaire, definirDroitsAssetAction: f.unitaire, definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(),
  affecterAssetsDossierAction: (x: { ids: string[]; folderId: string | null }) => f.ranger(x),
  definirDroitsAssetsAction: (x: { ids: string[]; droit: string | null }) => f.droits(x),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · les FICHIERS se sélectionnent, comme la maquette (`vBib` ·
 * `chk(k)` sur chaque carte de fichier et chaque ligne de la liste). On MONTE
 * l'écran (jsdom), on coche, on lit la barre (gestes ouverts, fermés et leur
 * phrase) et l'appel réellement parti · une action groupée, UNE fois, avec les
 * seuls fichiers de la sélection (jamais un dossier, jamais un fichier en
 * lecture seule).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
/** Deux dossiers et, à la racine des assets, trois fichiers de la bibliothèque ; une sortie Studios (lecture seule) sous « Créations ». */
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit'), dossier('d-ugc', 'UGC')],
  medias: [
    media('m1', { rights: 'photo_marque' }), media('m2', { ia: { utilisable: false, template: false, tags: [] } }), media('m3'),
    media('s1', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet', href: '/studio/projets/p1' }, ia: undefined }),
  ],
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
const caseFichier = (h: HTMLElement, nom: string) => h.querySelector(`button.dchk[aria-label="Sélectionner ${nom}"]`);
const caseDossier = (h: HTMLElement, nom: string) => h.querySelector(`button.fsel[aria-label="Sélectionner ${nom}"]`);
const barre = (h: HTMLElement) => h.querySelector('.dbulk') as HTMLElement | null;
const boutonBarre = (h: HTMLElement, texte: string) => [...barre(h)!.querySelectorAll('button')].find((b) => b.textContent === texte) as HTMLButtonElement | undefined;
const liste = (h: HTMLElement, geste: 'ranger' | 'droits') => barre(h)!.querySelector(`select[data-geste="${geste}"]`) as HTMLSelectElement;
const choisir = async (s: HTMLSelectElement, valeur: string) => {
  await act(async () => { s.value = valeur; s.dispatchEvent(new Event('change', { bubbles: true })); });
};
const aller = async (h: HTMLElement, onglet: RegExp) => clic([...h.querySelectorAll('nav.btabs button')].find((b) => onglet.test(b.textContent ?? '')));

describe('une case sur chaque fichier de la bibliothèque, en grille ET en liste', () => {
  it('grille · rendu serveur · la case précède la vignette, comme la maquette (`chk(k)` puis `dopen`)', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Bibliotheque {...props()} /></FournisseurSpatial>);
    const cases = [...html.matchAll(/<div class="dcard [^"]*"><button type="button" class="dchk " aria-pressed="false" aria-label="Sélectionner ([^"]+)"><span data-zone-tactile="" aria-hidden="true"><\/span><\/button><button type="button" class="dopen"/g)].map((m) => m[1]);
    expect(cases).toEqual(['m1.jpg', 'm2.jpg', 'm3.jpg']);
  });

  it('liste · chaque ligne de fichier porte sa case, en première colonne', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Liste"]'));
    const lignes = [...h.querySelectorAll('.dtbl .dtr:not(.h)')].filter((r) => /\.jpg$/.test(r.querySelector('.nm')?.textContent ?? ''));
    expect(lignes.map((r) => [r.querySelector('.nm')!.textContent, r.firstElementChild?.getAttribute('aria-label')])).toEqual([
      ['m1.jpg', 'Sélectionner m1.jpg'], ['m2.jpg', 'Sélectionner m2.jpg'], ['m3.jpg', 'Sélectionner m3.jpg'],
    ]);
    await clic(caseFichier(h, 'm2.jpg'));
    const l2 = lignes[1]!;
    expect([l2.className, caseFichier(h, 'm2.jpg')!.getAttribute('aria-pressed')]).toEqual(['dtr sel ', 'true']);
    expect(barre(h)!.querySelector('strong')!.textContent).toBe('1 sélectionné');
  });

  it('une sortie Studios (lecture seule) ne se sélectionne pas · ni en grille, ni en liste', async () => {
    const h = await monter();
    await aller(h, /Créations/);
    await clic([...h.querySelectorAll('.fcard .fopen')].find((b) => b.textContent?.includes('Projet')));
    expect(h.querySelectorAll('.dcard').length).toBe(1);
    expect(h.querySelector('button.dchk')).toBeNull();
    await clic(h.querySelector('button[aria-label="Liste"]'));
    expect(h.querySelector('button.dchk')).toBeNull();
  });

  it('lecture seule · aucune case, ni sur les fichiers ni sur les dossiers', async () => {
    const h = await monter({ lectureSeule: 'Ton offre ne permet pas d’ajouter des médias.' });
    expect(h.querySelector('button.dchk, button.fsel')).toBeNull();
  });
});

describe('la barre propose les bons gestes selon la sélection', () => {
  it('FICHIERS seuls · déplacer, droits, IA ouverts ; corbeille et tag fermés avec leur phrase ; gestes sans action fermés', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm3.jpg'));
    expect(barre(h)!.querySelector('strong')!.textContent).toBe('2 sélectionnés');
    const corbeille = boutonBarre(h, 'Mettre à la corbeille')!;
    expect([corbeille.disabled, corbeille.title]).toEqual([true, RAISONS_SELECTION.corbeilleFichiers]);
    const tag = boutonBarre(h, 'Tag de couleur')!;
    expect([tag.disabled, tag.title]).toEqual([true, 'Les fichiers ne portent pas de tag · seuls les dossiers en portent un.']);
    expect([liste(h, 'ranger').disabled, liste(h, 'droits').disabled]).toEqual([false, false]);
    expect(boutonBarre(h, 'Ne plus servir à l’IA')!.disabled, 'les deux servent à l’IA · le geste les en retire').toBe(false);
    for (const g of GESTES_SANS_ACTION) {
      const b = barre(h)!.querySelector(`button[data-ferme="${g.cle}"]`) as HTMLButtonElement;
      expect([b.textContent, b.disabled, b.title], g.cle).toEqual([g.libelle, true, g.raison]);
    }
    expect(barre(h)!.querySelector('[data-geste="note-selection"]')!.textContent).toBe('Les fichiers ne portent pas de tag et ne vont pas à la corbeille · un fichier se supprime depuis son aperçu.');
  });

  it('DOSSIERS seuls · corbeille et tag ouverts ; déplacer, droits et IA fermés avec leur phrase', async () => {
    const h = await monter();
    await clic(caseDossier(h, 'UGC'));
    expect(boutonBarre(h, 'Mettre à la corbeille')!.disabled).toBe(false);
    expect(boutonBarre(h, 'Tag de couleur')!.disabled).toBe(false);
    expect([liste(h, 'ranger').disabled, liste(h, 'ranger').title]).toEqual([true, RAISONS_SELECTION.rangerDossiers]);
    expect([liste(h, 'droits').disabled, liste(h, 'droits').title]).toEqual([true, RAISONS_SELECTION.droitsDossiers]);
    const ia = barre(h)!.querySelector('button[data-geste="ia"]') as HTMLButtonElement;
    expect([ia.disabled, ia.title]).toEqual([true, RAISONS_SELECTION.iaDossiers]);
    expect(barre(h)!.querySelector('[data-geste="note-selection"]')!.textContent).toBe('Les gestes des fichiers (déplacer, droits et IA) ne s’appliquent pas à un dossier.');
  });

  it('MIXTE · tout s’ouvre, la phrase dit qui reçoit quoi', async () => {
    const h = await monter();
    await clic(caseDossier(h, 'UGC'));
    await clic(caseFichier(h, 'm2.jpg'));
    expect(barre(h)!.querySelector('strong')!.textContent).toBe('2 sélectionnés');
    expect([boutonBarre(h, 'Mettre à la corbeille')!.disabled, boutonBarre(h, 'Tag de couleur')!.disabled, liste(h, 'ranger').disabled, liste(h, 'droits').disabled, boutonBarre(h, 'Servir à l’IA')!.disabled])
      .toEqual([false, false, false, false, false]);
    expect(barre(h)!.querySelector('[data-geste="note-selection"]')!.textContent).toBe('Sélection mixte · corbeille et tag pour 1 dossier, déplacer, droits et IA pour 1 fichier.');
  });
});

describe('chaque geste part en UNE action groupée, avec les seuls fichiers', () => {
  it('« Déplacer vers… » · les fichiers cochés vont dans le dossier choisi · la sélection se vide', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm2.jpg'));
    expect([...liste(h, 'ranger').options].map((o) => o.textContent)).toEqual(['Déplacer vers…', 'Assets de la marque · non classé', 'Photos produit', 'UGC']);
    await choisir(liste(h, 'ranger'), 'd-photos');
    expect(f.ranger).toHaveBeenCalledTimes(1);
    expect(f.ranger).toHaveBeenCalledWith({ ids: ['m1', 'm2'], folderId: 'd-photos' });
    expect(f.unitaire, 'le geste unitaire a été appelé en boucle').not.toHaveBeenCalled();
    expect(toasts).toEqual(['2 fichiers rangés dans « Photos produit »']);
    expect(barre(h), 'la sélection se vide après le geste').toBeNull();
    expect(f.refresh).toHaveBeenCalled();
  });

  it('« Déplacer vers… » la racine · `folderId: null` (non classé), jamais la valeur technique', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm3.jpg'));
    await choisir(liste(h, 'ranger'), ':racine');
    expect(f.ranger).toHaveBeenCalledWith({ ids: ['m3'], folderId: null });
  });

  it('« Droits d’usage » · le droit choisi part pour chaque fichier ; « Non classé » efface ; le droit commun est rappelé', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    expect(liste(h, 'droits').options[0]!.textContent).toBe('Droits d’usage · Photo de la marque');
    await clic(caseFichier(h, 'm3.jpg'));
    expect(liste(h, 'droits').options[0]!.textContent).toBe('Droits d’usage…');
    await choisir(liste(h, 'droits'), 'ugc_accord');
    expect(f.droits).toHaveBeenCalledWith({ ids: ['m1', 'm3'], droit: 'ugc_accord' });
    expect(toasts).toEqual(['Droits d’usage enregistrés pour 2 fichiers']);
    await clic(caseFichier(h, 'm2.jpg'));
    await choisir(liste(h, 'droits'), ':aucun');
    expect(f.droits).toHaveBeenLastCalledWith({ ids: ['m2'], droit: null });
  });

  it('« Servir à l’IA » · un fichier hors IA dans la sélection · tous y sont mis', async () => {
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(caseFichier(h, 'm2.jpg'));
    await clic(boutonBarre(h, 'Servir à l’IA'));
    expect(f.ia).toHaveBeenCalledTimes(1);
    expect(f.ia).toHaveBeenCalledWith({ ids: ['m1', 'm2'], useForAi: true });
    expect(toasts).toEqual(['2 fichiers peuvent servir à l’IA']);
  });

  it('MIXTE · la corbeille ne reçoit que le dossier, le déplacement que le fichier', async () => {
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const h = await monter();
      await clic(caseDossier(h, 'UGC'));
      await clic(caseFichier(h, 'm1.jpg'));
      await choisir(liste(h, 'ranger'), 'd-photos');
      expect(f.ranger).toHaveBeenCalledWith({ ids: ['m1'], folderId: 'd-photos' });
      await clic(caseDossier(h, 'UGC'));
      await clic(caseFichier(h, 'm2.jpg'));
      await clic(boutonBarre(h, 'Mettre à la corbeille'));
      expect(confirmer).toHaveBeenCalledWith('Mettre 1 dossier à la corbeille ? Ils restent restaurables, avec leur contenu.');
      expect(f.corbeille.mock.calls).toEqual([[{ id: 'd-ugc' }]]);
      expect(f.unitaire, 'un fichier est parti à une action de suppression').not.toHaveBeenCalled();
    } finally { confirmer.mockRestore(); }
  });

  it('un refus de l’action est dit, la sélection est gardée', async () => {
    f.ia.mockResolvedValueOnce({ error: 'Un fichier de la sélection est introuvable · rien n’a été modifié.' });
    const h = await monter();
    await clic(caseFichier(h, 'm1.jpg'));
    await clic(boutonBarre(h, 'Ne plus servir à l’IA'));
    expect(toasts).toEqual(['Un fichier de la sélection est introuvable · rien n’a été modifié.']);
    expect(barre(h)!.querySelector('strong')!.textContent).toBe('1 sélectionné');
  });
});
