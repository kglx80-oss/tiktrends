// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { connexionDrive, donneesDrive, LONGUEUR_MAX_NOM_DOSSIER, REFUS_DOSSIER, TAGS_COULEUR, type DonneesDrive, type DossierSource, type MediaSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  supprimer: vi.fn(async (_x: { id: string }): Promise<unknown> => ({ ok: true })),
  restaurer: vi.fn(async (_x: { id: string }): Promise<unknown> => ({ ok: true })),
  tag: vi.fn(async (_x: { id: string; tag: string | null }): Promise<unknown> => ({ ok: true })),
  tags: vi.fn(async (): Promise<unknown> => ({ ok: true, n: 1 })),
  renommer: vi.fn(async (x: { id: string; nom: string }): Promise<unknown> => ({ ok: true, nom: x.nom })),
  deplacer: vi.fn(async (_x: { id: string; parentId: string | null }): Promise<unknown> => ({ ok: true })),
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
  renommerDossierAction: (x: { id: string; nom: string }) => f.renommer(x), deplacerDossierAction: (x: { id: string; parentId: string | null }) => f.deplacer(x),
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
const ecran = (lectureSeule: string | null, donnees: DonneesDrive = DONNEES) => <FournisseurSpatial value={CTX}><Bibliotheque donnees={donnees} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>;

const monter = async (lectureSeule: string | null = null, donnees: DonneesDrive = DONNEES) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(ecran(lectureSeule, donnees)); });
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

  it('« … » ouvre les gestes · ouvrir, renommer, déplacer, télécharger (contenu dit), corbeille · le tag reste au bouton de la carte', async () => {
    const h = await monter();
    const d = declencheur(h, 'Photos produit')!;
    expect(d.closest('.fcard .facts')).toBeTruthy();
    await ouvrir(h, 'Photos produit');
    expect(d.getAttribute('aria-expanded')).toBe('true');
    expect(entrees(h).map((x) => [x.textContent, x.getAttribute('aria-disabled')])).toEqual([['Ouvrir', null], ['Renommer', null], ['Déplacer vers…›', null], ['Télécharger', null], ['Mettre à la corbeille', null]]);
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

  it('un dossier verrouillé (système) · « Ouvrir », renommer et déplacer FERMÉS avec la phrase du serveur (il garde son bouton de tag)', async () => {
    const h = await monter();
    await ouvrir(h, 'Système');
    expect(etat(h)).toEqual([['ouvrir', null, ''], ['renommer', 'true', REFUS_DOSSIER.systemeRenommer], ['deplacer', 'true', REFUS_DOSSIER.systemeDeplacer]]);
    await clic(entree(h, 'renommer'));
    await clic(entree(h, 'deplacer'));
    expect([h.querySelector('[role="dialog"]'), menu(h)!.querySelector('[data-destination]'), f.renommer.mock.calls.length, f.deplacer.mock.calls.length]).toEqual([null, null, 0, 0]);
    expect(declencheur(h, 'Système')!.closest('.fcard')!.querySelector('.ftb')).toBeTruthy();
  });

  it('lecture seule · tag, télécharger et corbeille FERMÉS avec la raison · aucun appel, aucune liste de tags', async () => {
    const h = await monter(LS);
    const { appels } = capterArchive();
    // La carte n'a plus son bouton de tag · le menu porte le geste, fermé (jamais deux, jamais aucun).
    expect(h.querySelectorAll('.fcard .ftb')).toHaveLength(0);
    await ouvrir(h, 'Photos produit');
    expect(etat(h)).toEqual([['ouvrir', null, ''], ['renommer', 'true', LS], ['deplacer', 'true', LS], ['tag', 'true', LS], ['telecharger', 'true', LS], ['corbeille', 'true', LS]]);
    await clic(entree(h, 'renommer'));
    expect(h.querySelector('[role="dialog"]'), 'la fenêtre de renommage s’ouvre en lecture seule').toBeNull();
    await act(async () => { entree(h, 'deplacer')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(menu(h)!.querySelector('[data-destination]')).toBeNull();
    await clic(entree(h, 'corbeille'));
    await clic(entree(h, 'telecharger'));
    await clic(entree(h, 'tag'));
    await act(async () => { entree(h, 'tag')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(menu(h)!.querySelector('[data-destination]')).toBeNull();
    expect([f.supprimer.mock.calls.length, f.tag.mock.calls.length, appels.length, f.renommer.mock.calls.length, f.deplacer.mock.calls.length]).toEqual([0, 0, 0, 0, 0]);
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
    expect(entrees(h).map((x) => [x.dataset.menu, x.textContent])).toEqual([['ouvrir', 'Ouvrir'], ['renommer', 'Renommer'], ['deplacer', 'Déplacer vers…›'], ['tag', 'Tag de couleur›'], ['telecharger', 'Télécharger'], ['corbeille', 'Mettre à la corbeille']]);
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

  it('un dossier verrouillé en liste · ouvrir, renommer et déplacer fermés, et le tag (il se tague, comme sur sa carte)', async () => {
    const h = await monter();
    await enListe(h);
    await ouvrir(h, 'Système');
    expect(etat(h)).toEqual([['ouvrir', null, ''], ['renommer', 'true', REFUS_DOSSIER.systemeRenommer], ['deplacer', 'true', REFUS_DOSSIER.systemeDeplacer], ['tag', null, '']]);
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

const dialogue = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const saisie = () => dialogue()?.querySelector('input') as HTMLInputElement | null;
/** Écrit dans la saisie contrôlée (React lit la valeur posée par le setter natif). */
const ecrire = async (texte: string) => {
  const i = saisie();
  expect(i, 'saisie du renommage introuvable').toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, texte);
    i!.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
/** Entrée dans la saisie · la soumission du formulaire (ce que fait le navigateur). */
const entreeClavier = async () => {
  await touche(saisie(), 'Enter');
  await act(async () => { saisie()!.form!.requestSubmit(); });
};

describe('« Renommer » · petite fenêtre, Entrée valide, Échap annule', () => {
  it('ouvre la fenêtre, le nom actuel en saisie (focalisé) · Entrée envoie UNE fois le nom rogné pour CE dossier, le dit et ferme', async () => {
    const h = await monter();
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'renommer'));
    expect([menu(h), dialogue()?.getAttribute('aria-modal'), dialogue()?.querySelector('h2')?.textContent]).toEqual([null, 'true', 'Renommer le dossier']);
    expect([saisie()!.value, saisie()!.getAttribute('aria-label'), document.activeElement === saisie()]).toEqual(['UGC', 'Nouveau nom de UGC', true]);
    await ecrire('  UGC clients  ');
    await entreeClavier();
    expect(f.renommer.mock.calls).toEqual([[{ id: 'd-ugc', nom: 'UGC clients' }]]);
    expect([dialogue(), toasts]).toEqual([null, ['Dossier renommé en « UGC clients »']]);
    expect(document.activeElement, 'le focus ne revient pas au « … » du dossier').toBe(declencheur(h, 'UGC'));
  });

  it('Échap annule · aucun appel, la fenêtre se ferme ; « Annuler » aussi', async () => {
    const h = await monter();
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'renommer'));
    await ecrire('Autre');
    await act(async () => { saisie()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect([dialogue(), f.renommer.mock.calls.length]).toEqual([null, 0]);
    expect(document.activeElement).toBe(declencheur(h, 'UGC'));
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'renommer'));
    expect(saisie()!.value, 'la saisie annulée revient').toBe('UGC');
    await clic([...dialogue()!.querySelectorAll('button')].find((b) => b.textContent === 'Annuler'));
    expect([dialogue(), f.renommer.mock.calls.length]).toEqual([null, 0]);
  });

  it('un nom refusé par la règle du noyau · dit DANS la fenêtre, aucun appel ; le même nom · fermé sans appel', async () => {
    const h = await monter();
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'renommer'));
    for (const [texte, raison] of [['   ', 'Donne un nom au dossier.'], ['x'.repeat(LONGUEUR_MAX_NOM_DOSSIER + 1), `Nom trop long (max ${LONGUEUR_MAX_NOM_DOSSIER} caractères).`]] as const) {
      await ecrire(texte);
      await entreeClavier();
      expect([dialogue()?.querySelector('[role="alert"]')?.textContent, saisie()!.getAttribute('aria-invalid')]).toEqual([raison, 'true']);
    }
    expect(f.renommer).not.toHaveBeenCalled();
    await ecrire(' UGC ');
    expect(dialogue()!.querySelector('[role="alert"]'), 'la raison reste après une nouvelle saisie').toBeNull();
    await entreeClavier();
    expect([dialogue(), f.renommer.mock.calls.length, toasts]).toEqual([null, 0, []]);
  });

  it('le refus du serveur reste dans la fenêtre · aucun faux succès', async () => {
    const h = await monter();
    f.renommer.mockResolvedValueOnce({ error: REFUS_DOSSIER.introuvable });
    await ouvrir(h, 'UGC');
    await clic(entree(h, 'renommer'));
    await ecrire('Nouveau');
    await entreeClavier();
    expect([dialogue()?.querySelector('[role="alert"]')?.textContent, toasts, f.renommer.mock.calls.length]).toEqual([REFUS_DOSSIER.introuvable, [], 1]);
  });
});

describe('« Déplacer vers… » d’un dossier · la liste des fichiers, destinations interdites fermées avec leur raison', () => {
  const ARBRE = donneesDrive({
    dossiers: [
      dossier('d-shoot', 'Shooting'), dossier('d-hiver', 'Hiver', { parentId: 'd-shoot' }), dossier('d-rush', 'Rushs', { parentId: 'd-hiver' }),
      dossier('d-arch', 'Archives'), dossier('d-sys', 'Système', { locked: true }), dossier('d-mx', 'Autre marque', { brandId: 'marque-x' }),
      dossier('d-jete', 'Vieux', { deletedAt: T0 }),
    ],
    medias: [],
  });
  const options = (h: HTMLElement) => [...menu(h)!.querySelectorAll<HTMLElement>('[data-destination]')]
    .map((x) => [x.dataset.destination, x.textContent, x.getAttribute('aria-checked'), x.getAttribute('aria-disabled'), x.title]);

  it('Flèche droite ouvre la liste · le parent actuel marqué, lui-même, ses descendants, le dossier système et l’autre marque FERMÉS avec leur raison, la corbeille absente', async () => {
    const h = await monter(null, ARBRE);
    await ouvrir(h, 'Shooting');
    await act(async () => { entree(h, 'deplacer')!.focus(); });
    await touche(document.activeElement, 'ArrowRight');
    expect(menu(h)!.getAttribute('aria-label')).toBe('Déplacer Shooting vers');
    expect(options(h)).toEqual([
      ['', 'Assets de la marque · non classé', 'true', 'true', 'Le dossier est déjà ici.'],
      ['d-arch', 'Archives', 'false', null, ''],
      ['d-mx', 'Autre marque', 'false', 'true', REFUS_DOSSIER.autreMarque],
      ['d-shoot', 'Shooting', 'false', 'true', REFUS_DOSSIER.soiMeme],
      ['d-hiver', 'Shooting › Hiver', 'false', 'true', REFUS_DOSSIER.descendant],
      ['d-rush', 'Shooting › Hiver › Rushs', 'false', 'true', REFUS_DOSSIER.descendant],
      ['d-sys', 'Système', 'false', 'true', REFUS_DOSSIER.destinationSysteme],
    ]);
    expect(focusTexte()).toBe('Déplacer vers…');
    // Une destination fermée ne part pas · ni au clic, ni le dossier actuel.
    for (const id of ['d-hiver', 'd-rush', 'd-shoot', 'd-sys', 'd-mx', '']) await clic(menu(h)!.querySelector(`[data-destination="${id}"]`));
    expect(f.deplacer).not.toHaveBeenCalled();
    // Échap revient au menu, sur « Déplacer vers… ».
    await touche(document.activeElement, 'Escape');
    expect([menu(h)!.getAttribute('aria-label'), focusTexte()]).toEqual(['Actions sur Shooting', 'Déplacer vers…›']);
  });

  it('une destination permise · l’action part UNE fois avec ce seul dossier et ce parent, le dit, le menu se ferme', async () => {
    const h = await monter(null, ARBRE);
    await ouvrir(h, 'Shooting');
    await clic(entree(h, 'deplacer'));
    await clic(menu(h)!.querySelector('[data-destination="d-arch"]'));
    expect(f.deplacer.mock.calls).toEqual([[{ id: 'd-shoot', parentId: 'd-arch' }]]);
    expect([menu(h), toasts]).toEqual([null, ['« Shooting » déplacé dans « Archives »']]);
  });

  it('vers la racine (non classé) depuis un sous-dossier · `parentId: null` · le refus du serveur est dit, aucun faux succès', async () => {
    const h = await monter(null, ARBRE);
    await clic([...h.querySelectorAll('.fcard .fopen')].find((b) => b.textContent?.includes('Shooting')));
    await ouvrir(h, 'Hiver');
    await clic(entree(h, 'deplacer'));
    expect(options(h).filter((o) => o[2] === 'true').map((o) => o[0])).toEqual(['d-shoot']);
    f.deplacer.mockResolvedValueOnce({ error: REFUS_DOSSIER.destinationIntrouvable });
    await clic(menu(h)!.querySelector('[data-destination=""]'));
    expect(f.deplacer.mock.calls).toEqual([[{ id: 'd-hiver', parentId: null }]]);
    expect(toasts).toEqual([REFUS_DOSSIER.destinationIntrouvable]);
  });

  it('en liste, les DEUX listes du menu · « Déplacer vers… » puis « Tag de couleur » ont chacune leurs options', async () => {
    const h = await monter(null, ARBRE);
    await enListe(h);
    await ouvrir(h, 'Archives');
    await clic(entree(h, 'deplacer'));
    expect(menu(h)!.getAttribute('aria-label')).toBe('Déplacer Archives vers');
    expect(options(h).map((o) => o[0])).toContain('d-shoot');
    await clic(menu(h)!.querySelector('[data-menu="retour"]'));
    await clic(entree(h, 'tag'));
    expect(menu(h)!.getAttribute('aria-label')).toBe('Tag de couleur de Archives');
    expect(options(h).map((o) => o[0])).toEqual(TAGS_COULEUR.map((t) => t.cle));
    await clic(menu(h)!.querySelector('[data-destination="rose"]'));
    expect([f.tag.mock.calls, f.deplacer.mock.calls.length]).toEqual([[[{ id: 'd-arch', tag: 'rose' }]], 0]);
  });
});
