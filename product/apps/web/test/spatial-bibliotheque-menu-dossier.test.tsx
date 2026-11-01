// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { connexionDrive, donneesDrive, TAGS_COULEUR, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  supprimer: vi.fn(async (_x: { id: string }): Promise<unknown> => ({ ok: true })),
  restaurer: vi.fn(async (_x: { id: string }): Promise<unknown> => ({ ok: true })),
  tag: vi.fn(async (_x: { id: string; tag: string | null }): Promise<unknown> => ({ ok: true })),
  tags: vi.fn(async (): Promise<unknown> => ({ ok: true, n: 1 })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: (x: { id: string }) => f.supprimer(x), restaurerDossierAction: (x: { id: string }) => f.restaurer(x),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(), definirTagDossierAction: (x: { id: string; tag: string | null }) => f.tag(x),
  definirTagDossiersAction: () => f.tags(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · le menu « … » d'une carte de DOSSIER (grille ET liste). On
 * MONTE l'écran (jsdom), on ouvre le menu à la souris puis au clavier, on lit
 * ce qu'il propose (ouvert, fermé avec sa raison), l'appel RÉELLEMENT parti
 * (une fois, avec ce seul dossier · action de corbeille, de restauration, de
 * tag, vérification puis formulaire de la route d'archive), le focus, et la
 * place du bouton (dans les actions de la carte, dernière colonne de la ligne).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1024, createdAt: T0, folderId: null, rights: null, ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit', { colorTag: 'vert' }), dossier('d-ugc', 'UGC'), dossier('d-sys', 'Système', { locked: true }), dossier('d-jete', 'Vieux', { deletedAt: T0 })],
  medias: [media(U1, 'face.jpg', { folderId: 'd-photos' }), media(U2, 'dos.jpg', { folderId: 'd-photos' }), media(U3, 'racine.jpg')],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });
const ecran = (lectureSeule: string | null) => <FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>;

const monter = async (lectureSeule: string | null = null) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(ecran(lectureSeule)); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const touche = async (cible: Element | null, key: string) => {
  expect(cible, 'cible du clavier introuvable').toBeTruthy();
  await act(async () => { cible!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
};
const declencheur = (h: HTMLElement, nom: string) => h.querySelector(`button[data-menu-dossier][aria-label="Actions sur ${nom}"]`) as HTMLButtonElement | null;
const menu = (h: HTMLElement) => h.querySelector('[role="menu"].dmenu') as HTMLElement | null;
const entrees = (h: HTMLElement) => [...(menu(h)?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
const entree = (h: HTMLElement, cle: string) => menu(h)?.querySelector(`[data-menu="${cle}"]`) as HTMLElement | null;
const focusTexte = () => (document.activeElement as HTMLElement | null)?.textContent ?? '';
const ouvrir = async (h: HTMLElement, nom: string) => { await clic(declencheur(h, nom)); expect(menu(h), 'menu non ouvert').toBeTruthy(); };
const enListe = async (h: HTMLElement) => clic(h.querySelector('button[aria-label="Liste"]'));
const etat = (h: HTMLElement) => entrees(h).map((x) => [x.dataset.menu, x.getAttribute('aria-disabled'), x.title]);

function capterArchive(corps: unknown = { ok: true, fichiers: 2, dossiers: 1, octets: 2048 }) {
  const postes: Array<{ action: string; champs: Array<[string, string]> }> = [];
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    postes.push({ action: new URL(this.action).pathname, champs: [...new FormData(this).entries()].map(([k, v]) => [k, String(v)]) });
  });
  const appels: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, body: init.body });
    return new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return { postes, appels };
}

describe('menu « … » d’une carte de dossier · grille', () => {
  it('rendu serveur · un « … » par carte de dossier, en DERNIER dans ses actions, après la case et le tag · fermé', () => {
    const html = renderToStaticMarkup(ecran(null));
    const facts = [...html.matchAll(/<div class="facts">([\s\S]*?)<\/div>/g)].map((m) => [...m[1]!.matchAll(/<button type="button" (?:class="([^"]*)"|(data-menu-dossier))/g)].map((b) => b[1]?.trim() ?? b[2]));
    expect(facts).toEqual([['fsel', 'ftb has', 'data-menu-dossier'], ['ftb', 'data-menu-dossier'], ['fsel', 'ftb', 'data-menu-dossier']]);
    expect(html).toMatch(/<button type="button" data-menu-dossier="" aria-label="Actions sur Photos produit" aria-haspopup="menu" aria-expanded="false"><svg class="i s"><use href="#i-more"><\/use><\/svg><\/button><\/div>/);
    expect(html).not.toContain('class="dmenu');
  });

  it('« … » ouvre les gestes existants · ouvrir, télécharger (contenu dit), corbeille · le tag reste au bouton de la carte', async () => {
    const h = await monter();
    const d = declencheur(h, 'Photos produit')!;
    expect(d.closest('.fcard .facts')).toBeTruthy();
    await ouvrir(h, 'Photos produit');
    expect(d.getAttribute('aria-expanded')).toBe('true');
    expect(entrees(h).map((x) => [x.textContent, x.getAttribute('aria-disabled')])).toEqual([['Ouvrir', null], ['Télécharger', null], ['Mettre à la corbeille', null]]);
    expect(entree(h, 'telecharger')!.title).toBe('Archive ZIP de 1 dossier et 2 fichiers · 2 Ko');
    expect(entree(h, 'tag')).toBeNull();
    expect(d.closest('.fcard')!.querySelector('.ftb')).toBeTruthy();
    // Le panneau est HORS des actions (sinon leur style le rogne), au-dessus des cartes voisines.
    expect([menu(h)!.parentElement!.classList.contains('fcard'), (menu(h)!.parentElement as HTMLElement).style.zIndex]).toEqual([true, '7']);
    expect(focusTexte()).toBe('Ouvrir');
  });

  it('clavier · Flèche bas ouvre, flèches en boucle, Début et Fin, Échap ferme et rend le focus à « … »', async () => {
    const h = await monter();
    const d = declencheur(h, 'Photos produit')!;
    await act(async () => { d.focus(); });
    await touche(d, 'ArrowDown');
    expect([menu(h) !== null, focusTexte()]).toEqual([true, 'Ouvrir']);
    await touche(document.activeElement, 'ArrowUp');
    expect(focusTexte()).toBe('Mettre à la corbeille');
    await touche(document.activeElement, 'ArrowDown');
    expect(focusTexte()).toBe('Ouvrir');
    await touche(document.activeElement, 'End');
    expect(focusTexte()).toBe('Mettre à la corbeille');
    await touche(document.activeElement, 'Home');
    expect(focusTexte()).toBe('Ouvrir');
    await touche(document.activeElement, 'Escape');
    expect([menu(h), document.activeElement === d, d.getAttribute('aria-expanded')]).toEqual([null, true, 'false']);
  });

  it('« Ouvrir » entre dans CE dossier (ses fichiers s’affichent)', async () => {
    const h = await monter();
    expect(h.textContent).not.toContain('face.jpg');
    await ouvrir(h, 'Photos produit');
    await clic(entree(h, 'ouvrir'));
    expect([h.textContent!.includes('face.jpg'), declencheur(h, 'Photos produit'), menu(h)]).toEqual([true, null, null]);
  });

  it('« Mettre à la corbeille » · confirmé comme la barre, l’action part UNE fois avec ce seul dossier ; refusé, rien ne part', async () => {
    const h = await monter();
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'corbeille'));
    expect([confirmer.mock.calls, f.supprimer.mock.calls.length]).toEqual([[['Mettre 1 dossier à la corbeille ? Il reste restaurable, avec son contenu.']], 0]);
    confirmer.mockReturnValue(true);
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'corbeille'));
    expect(f.supprimer).toHaveBeenCalledTimes(1);
    expect(f.supprimer).toHaveBeenCalledWith({ id: 'd-ugc' });
    expect(toasts).toEqual(['1 dossier placé dans la corbeille']);
  });

  it('le refus du serveur est dit · aucun faux succès', async () => {
    const h = await monter();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    f.supprimer.mockResolvedValueOnce({ error: 'Ce dossier système ne peut pas être supprimé.' });
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'corbeille'));
    expect(toasts).toEqual(['Ce dossier système ne peut pas être supprimé.']);
  });

  it('« Télécharger » · la route vérifie puis reçoit le formulaire, avec CE seul dossier (champ `dossiers`, aucun fichier)', async () => {
    const h = await monter();
    const { postes, appels } = capterArchive();
    await ouvrir(h, 'Photos produit');
    await clic(entree(h, 'telecharger'));
    expect(appels).toEqual([{ url: '/api/bibliotheque/archive?verifier=1', body: JSON.stringify({ ids: [], dossiers: ['d-photos'] }) }]);
    expect(postes).toEqual([{ action: '/api/bibliotheque/archive', champs: [['dossiers', 'd-photos']] }]);
    expect(toasts).toEqual(['Téléchargement lancé · 1 dossier, 2 fichiers, 2 Ko']);
  });

  it('« Télécharger » refusé par la route · sa phrase est dite, AUCUN formulaire posté', async () => {
    const h = await monter();
    const { postes } = capterArchive({ ok: false, raison: 'Un fichier de la sélection ne peut pas être lu depuis le stockage · aucune archive n’a été créée.' });
    await ouvrir(h, 'Photos produit');
    await clic(entree(h, 'telecharger'));
    expect([postes.length, toasts]).toEqual([0, ['Un fichier de la sélection ne peut pas être lu depuis le stockage · aucune archive n’a été créée.']]);
  });

  it('un dossier verrouillé (système) · « Ouvrir » seul en grille (il garde son bouton de tag)', async () => {
    const h = await monter();
    await ouvrir(h, 'Système');
    expect(etat(h)).toEqual([['ouvrir', null, '']]);
    expect(declencheur(h, 'Système')!.closest('.fcard')!.querySelector('.ftb')).toBeTruthy();
  });

  it('lecture seule · tag, télécharger et corbeille FERMÉS avec la raison · aucun appel, aucune liste de tags', async () => {
    const h = await monter(LS);
    const { appels } = capterArchive();
    // La carte n'a plus son bouton de tag · le menu porte le geste, fermé (jamais deux, jamais aucun).
    expect(h.querySelectorAll('.fcard .ftb')).toHaveLength(0);
    await ouvrir(h, 'Photos produit');
    expect(etat(h)).toEqual([['ouvrir', null, ''], ['tag', 'true', LS], ['telecharger', 'true', LS], ['corbeille', 'true', LS]]);
    await clic(entree(h, 'corbeille'));
    await clic(entree(h, 'telecharger'));
    await clic(entree(h, 'tag'));
    await act(async () => { entree(h, 'tag')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(menu(h)!.querySelector('[data-destination]')).toBeNull();
    expect([f.supprimer.mock.calls.length, f.tag.mock.calls.length, appels.length]).toEqual([0, 0, 0]);
  });

  it('un seul menu à la fois · d’un dossier à l’autre, puis à un fichier', async () => {
    const h = await monter();
    await ouvrir(h, 'UGC');
    await act(async () => { declencheur(h, 'Photos produit')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await clic(declencheur(h, 'Photos produit'));
    expect([h.querySelectorAll('[role="menu"].dmenu').length, menu(h)!.getAttribute('aria-label'), declencheur(h, 'UGC')!.getAttribute('aria-expanded')]).toEqual([1, 'Actions sur Photos produit', 'false']);
    const fichier = h.querySelector('button[data-menu-fichier][aria-label="Actions sur racine.jpg"]')!;
    await act(async () => { fichier.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    await clic(fichier);
    expect([h.querySelectorAll('[role="menu"].dmenu').length, menu(h)!.getAttribute('aria-label')]).toEqual([1, 'Actions sur racine.jpg']);
  });
});

describe('menu « … » d’un dossier · liste et corbeille', () => {
  it('la ligne porte « … » à sa dernière colonne · « Tag de couleur » s’y ajoute (la ligne n’a pas de bouton de tag)', async () => {
    const h = await monter();
    await enListe(h);
    const d = declencheur(h, 'Photos produit')!;
    expect([d.closest('.dtr') !== null, [...d.closest('.dtr')!.children].indexOf(d), d.classList.contains('dstar')]).toEqual([true, 6, true]);
    await ouvrir(h, 'Photos produit');
    expect(entrees(h).map((x) => [x.dataset.menu, x.textContent])).toEqual([['ouvrir', 'Ouvrir'], ['tag', 'Tag de couleur›'], ['telecharger', 'Télécharger'], ['corbeille', 'Mettre à la corbeille']]);
  });

  it('« Tag de couleur » · Flèche droite ouvre les 8 tags (le porté marqué, fermé) et « Retirer », Échap revient, un tag part UNE fois pour CE dossier', async () => {
    const h = await monter();
    await enListe(h);
    await ouvrir(h, 'Photos produit');
    await act(async () => { entree(h, 'tag')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(menu(h)!.getAttribute('aria-label')).toBe('Tag de couleur de Photos produit');
    expect(entrees(h).map((x) => [x.textContent, x.getAttribute('aria-checked'), x.getAttribute('aria-disabled')])).toEqual([
      ['Tag de couleur', null, null],
      ...TAGS_COULEUR.map((t) => [t.libelle, String(t.cle === 'vert'), t.cle === 'vert' ? 'true' : null]),
      ['Retirer le tag', 'false', null],
    ]);
    expect(focusTexte()).toBe('Tag de couleur');
    // Le tag déjà porté ne réécrit rien.
    await clic(menu(h)!.querySelector('[data-destination="vert"]'));
    expect(f.tag).not.toHaveBeenCalled();
    await touche(document.activeElement, 'Escape');
    expect([menu(h) !== null, focusTexte()]).toEqual([true, 'Tag de couleur›']);
    await clic(entree(h, 'tag'));
    await clic(menu(h)!.querySelector('[data-destination="rose"]'));
    expect(f.tag).toHaveBeenCalledTimes(1);
    expect(f.tag).toHaveBeenCalledWith({ id: 'd-photos', tag: 'rose' });
    expect(f.tags).not.toHaveBeenCalled();
    expect(toasts).toHaveLength(1);
    expect(menu(h)).toBeNull();
  });

  it('« Retirer le tag » · l’action part avec `tag: null` pour ce seul dossier · un dossier sans tag ne le propose pas', async () => {
    const h = await monter();
    await enListe(h);
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'tag'));
    expect(menu(h)!.querySelector('[data-destination=""]')).toBeNull();
    await clic(declencheur(h, 'UGC'));
    await ouvrir(h, 'Photos produit');
    await clic(entree(h, 'tag'));
    await clic(menu(h)!.querySelector('[data-destination=""]'));
    expect(f.tag.mock.calls).toEqual([[{ id: 'd-photos', tag: null }]]);
  });

  it('un dossier verrouillé en liste · ouvrir et le tag (il se tague, comme sur sa carte)', async () => {
    const h = await monter();
    await enListe(h);
    await ouvrir(h, 'Système');
    expect(etat(h)).toEqual([['ouvrir', null, ''], ['tag', null, '']]);
  });

  it('section « Corbeille » · « Restaurer » seul, part UNE fois avec ce seul dossier, et le dit', async () => {
    const h = await monter();
    await clic([...h.querySelectorAll('nav.dsec button')].find((b) => b.textContent?.startsWith('Corbeille')));
    for (const v of ['grille', 'liste']) {
      if (v === 'liste') await enListe(h);
      await ouvrir(h, 'Vieux');
      expect([v, entrees(h).map((x) => x.textContent)]).toEqual([v, ['Restaurer']]);
      await clic(declencheur(h, 'Vieux'));
    }
    await ouvrir(h, 'Vieux');
    await clic(entree(h, 'restaurer'));
    expect(f.restaurer).toHaveBeenCalledTimes(1);
    expect(f.restaurer).toHaveBeenCalledWith({ id: 'd-jete' });
    expect(toasts).toEqual(['1 dossier restauré']);
  });
});
