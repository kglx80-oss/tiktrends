// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, DELAI_DEPLIAGE_SURVOL_MS, REFUS_DOSSIER, type DossierSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
  deplacer: vi.fn(async (_x: { id: string; parentId: string | null }): Promise<unknown> => ({ ok: true })),
  deplacerGroupe: vi.fn(async (x: { ids: string[]; parentId: string | null }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
  affecter: vi.fn(async (x: { ids: string[]; folderId: string | null }): Promise<unknown> => ({ ok: true, n: x.ids.length })),
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
  deplacerDossiersAction: (x: { ids: string[]; parentId: string | null }) => f.deplacerGroupe(x),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · les finitions du glisser-déposer, écran MONTÉ (jsdom). On
 * simule les événements de glisser (transfert minimal posé sur l'événement) et
 * on lit le RÉSULTAT :
 *  · la zone d'import · un glisser sans fichiers (`types` sans `Files`) ne
 *    l'ouvre pas et n'importe rien ; avec des fichiers, elle s'ouvre et importe ;
 *  · un dossier SÉLECTIONNÉ emporte les dossiers de la sélection · UN appel
 *    groupé (`deplacerDossiersAction`) avec les bons ids ; une cible sous
 *    l'AUTRE dossier sélectionné (cycle croisé) refuse, aucun appel ;
 *  · un nœud replié de l'arbre survolé se déplie au délai du noyau (faux
 *    temps), pas avant, et pas du tout si on le quitte avant.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); vi.useRealTimers(); toasts = []; });

const T0 = '2026-10-20T10:00:00.000Z';
// Des UUID, comme en base · la règle groupée (`validerDeplacementDossiers`) les exige.
const PHOTOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', FACES = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const UGC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', HIVER = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const ARCHIVES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const DONNEES = donneesDrive({
  dossiers: [dossier(PHOTOS, 'Photos produit'), dossier(FACES, 'Faces', { parentId: PHOTOS }), dossier(UGC, 'UGC'), dossier(HIVER, 'Hiver', { parentId: UGC }), dossier(ARCHIVES, 'Archives')],
  medias: [],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };

/** Le transfert minimal d'un glisser · `types` et `files` comme le navigateur les annonce. */
const transfert = (types: string[] = [], files: File[] = []) => {
  const donnees: Record<string, string> = {};
  return { donnees, dropEffect: 'none', effectAllowed: 'all', types, files, setData: (t: string, v: string) => { donnees[t] = v; }, getData: (t: string) => donnees[t] ?? '' };
};
type Transfert = ReturnType<typeof transfert>;
const evenement = async (cible: Element | null | undefined, type: string, dt: Transfert) => {
  expect(cible, `cible de ${type} introuvable`).toBeTruthy();
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  await act(async () => { cible!.dispatchEvent(e); });
  return e;
};
const glisserSur = async (source: Element | null | undefined, cible: Element | null | undefined) => {
  const dt = transfert();
  await evenement(source, 'dragstart', dt);
  const survol = await evenement(cible, 'dragover', dt);
  const vu = { pris: survol.defaultPrevented, effet: dt.dropEffect, etat: (cible as HTMLElement).getAttribute('data-depot') };
  await evenement(cible, 'drop', dt);
  await evenement(source, 'dragend', dt);
  return vu;
};

const carteDossier = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.fcard')].find((c) => c.querySelector('.ftx strong')?.textContent === nom) ?? null;
const noeud = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dtree .tnb')].find((b) => b.querySelector('.tnn')?.textContent === nom) ?? null;
const nomsArbre = (h: HTMLElement) => [...h.querySelectorAll('.dtree .tnn')].map((x) => x.textContent);
const zoneOuverte = (h: HTMLElement) => !h.querySelector('#ddrop')!.hasAttribute('hidden');
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

describe('zone d’import · seuls les glissers qui portent des fichiers', () => {
  it('un texte, un lien glissés d’ailleurs · aucun état, aucun import', async () => {
    const h = await monter();
    const barre = h.querySelector('#dmain .dbar');
    for (const types of [['text/plain'], ['text/uri-list', 'text/html'], []]) {
      const dt = transfert(types);
      const survol = await evenement(barre, 'dragover', dt);
      const depot = await evenement(barre, 'drop', dt);
      expect([types, survol.defaultPrevented, depot.defaultPrevented, zoneOuverte(h)]).toEqual([types, false, false, false]);
    }
    expect([f.presign.mock.calls.length, f.upload.mock.calls.length, toasts]).toEqual([0, 0, []]);
  });

  it('même s’il traîne un fichier dans `files`, sans le type Files · rien (le type fait foi)', async () => {
    const h = await monter();
    const dt = transfert(['text/plain'], [new File(['x'], 'x.jpg', { type: 'image/jpeg' })]);
    await evenement(h.querySelector('#dmain .dbar'), 'dragover', dt);
    await evenement(h.querySelector('#dmain .dbar'), 'drop', dt);
    expect([zoneOuverte(h), f.presign.mock.calls.length]).toEqual([false, 0]);
  });

  it('témoin · des fichiers de l’ordinateur (Files) ouvrent la zone et partent à l’import', async () => {
    const h = await monter();
    const dt = transfert(['Files'], [new File(['x'], 'x.jpg', { type: 'image/jpeg' })]);
    const survol = await evenement(h.querySelector('#dmain .dbar'), 'dragover', dt);
    expect([survol.defaultPrevented, zoneOuverte(h)]).toEqual([true, true]);
    const depot = await evenement(h.querySelector('#dmain .dbar'), 'drop', dt);
    expect([depot.defaultPrevented, zoneOuverte(h), f.presign.mock.calls.length]).toEqual([true, false, 1]);
  });
});

describe('dossiers sélectionnés · le glisser emporte la sélection', () => {
  it('glisser un dossier sélectionné · UN appel groupé avec les dossiers de la sélection, aucun appel unitaire, le toast le dit', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Sélectionner Photos produit"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner UGC"]'));
    const vu = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'Archives'));
    expect(vu).toEqual({ pris: true, effet: 'move', etat: 'accepte' });
    expect(f.deplacerGroupe.mock.calls).toEqual([[{ ids: [PHOTOS, UGC], parentId: ARCHIVES }]]);
    expect([f.deplacer.mock.calls.length, f.affecter.mock.calls.length]).toEqual([0, 0]);
    expect(toasts).toEqual(['2 dossiers déplacés dans « Archives »']);
    // Déplacés, ils quittent la sélection · la barre se ferme.
    expect(h.querySelector('.dbulk')).toBeNull();
  });

  it('un autre dossier de la sélection, survolé · il part aussi, il n’est pas mis en évidence et ne prend pas le dépôt · aucun appel', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Sélectionner Photos produit"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner UGC"]'));
    const vu = await glisserSur(carteDossier(h, 'UGC'), carteDossier(h, 'Photos produit'));
    expect(vu).toEqual({ pris: false, effet: 'none', etat: null });
    expect([f.deplacerGroupe.mock.calls.length, f.deplacer.mock.calls.length]).toEqual([0, 0]);
  });

  it('un dossier NON sélectionné part seul, même quand d’autres le sont · l’action unitaire', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Sélectionner Photos produit"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner UGC"]'));
    await glisserSur(carteDossier(h, 'Archives'), carteDossier(h, 'UGC'));
    expect([f.deplacer.mock.calls, f.deplacerGroupe.mock.calls.length]).toEqual([[[{ id: ARCHIVES, parentId: UGC }]], 0]);
  });

  it('cycle CROISÉ · Photos (sélectionné avec UGC) déposé sur Hiver, sous UGC · la cible refuse, AUCUN appel', async () => {
    const h = await monter();
    await clic(h.querySelector('button[aria-label="Déplier UGC"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner Photos produit"]'));
    await clic(h.querySelector('button[aria-label="Sélectionner UGC"]'));
    const vu = await glisserSur(carteDossier(h, 'Photos produit'), noeud(h, 'Hiver'));
    expect(vu).toEqual({ pris: false, effet: 'none', etat: 'refuse' });
    // Aucun appel · la raison (celle du serveur, le dossier fautif nommé) dite par le toast, UNE fois.
    expect([f.deplacerGroupe.mock.calls.length, f.deplacer.mock.calls.length, toasts]).toEqual([0, 0, [`« UGC » · ${REFUS_DOSSIER.descendant}`]]);
    // Témoin · le même dossier glissé SEUL (non sélectionné) sur Hiver est accepté · c'est bien l'autre dossier qui refuse.
    await clic([...h.querySelectorAll('.dbulk button')].find((b) => b.textContent === 'Désélectionner'));
    const seul = await glisserSur(carteDossier(h, 'Photos produit'), noeud(h, 'Hiver'));
    expect(seul).toEqual({ pris: true, effet: 'move', etat: 'accepte' });
    expect(f.deplacer.mock.calls).toEqual([[{ id: PHOTOS, parentId: HIVER }]]);
  });
});

describe('arbre · un nœud replié se déplie au survol prolongé', () => {
  it(`il se déplie à ${DELAI_DEPLIAGE_SURVOL_MS} ms de survol, pas avant · le glisser continue dessous`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = await monter();
    expect(nomsArbre(h)).not.toContain('Faces');
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(noeud(h, 'Photos produit'), 'dragover', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS / 2);
    // Le navigateur tire `dragover` en continu · l'échéance ne repart pas à chaque fois.
    await evenement(noeud(h, 'Photos produit'), 'dragover', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS / 2 - 1);
    expect(nomsArbre(h)).not.toContain('Faces');
    await avancer(1);
    expect(nomsArbre(h)).toContain('Faces');
    expect(h.querySelector('button[aria-label="Replier Photos produit"]')).toBeTruthy();
    // Le nœud qui vient de s'ouvrir reçoit le dépôt.
    await evenement(noeud(h, 'Faces'), 'dragover', dt);
    await evenement(noeud(h, 'Faces'), 'drop', dt);
    expect(f.deplacer.mock.calls).toEqual([[{ id: ARCHIVES, parentId: FACES }]]);
  });

  it('quitté avant l’échéance · il reste replié', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(noeud(h, 'Photos produit'), 'dragover', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS - 1);
    await evenement(noeud(h, 'Photos produit'), 'dragleave', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS * 4);
    expect(nomsArbre(h)).not.toContain('Faces');
  });

  it('passé à un autre nœud, ou glisser fini, avant l’échéance · rien ne se déplie', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(noeud(h, 'Photos produit'), 'dragover', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS - 1);
    // Sans `dragleave` (le navigateur peut le perdre) · survoler un autre nœud annule le premier.
    await evenement(noeud(h, 'UGC'), 'dragover', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS - 1);
    await evenement(carteDossier(h, 'Archives'), 'dragend', dt);
    await avancer(DELAI_DEPLIAGE_SURVOL_MS * 4);
    expect(nomsArbre(h).filter((n) => n === 'Faces' || n === 'Hiver')).toEqual([]);
  });

  it('sans glisser, le survol ne déplie rien', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = await monter();
    await evenement(noeud(h, 'Photos produit'), 'dragover', transfert(['Files']));
    await avancer(DELAI_DEPLIAGE_SURVOL_MS * 4);
    expect(nomsArbre(h)).not.toContain('Faces');
  });
});
