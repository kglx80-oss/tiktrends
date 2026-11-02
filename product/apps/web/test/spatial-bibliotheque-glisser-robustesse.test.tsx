// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { connexionDrive, donneesDrive, GARDE_CHARGE_MS, REFUS_DEPOT, type DonneesDrive, type DossierSource } from '@tiktrends/core';

const f = vi.hoisted(() => ({
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
  affecterAssetsDossierAction: vi.fn(async () => ({ ok: true, n: 1 })), definirDroitsAssetsAction: vi.fn(),
  renommerDossierAction: vi.fn(), deplacerDossierAction: (x: { id: string; parentId: string | null }) => f.deplacer(x), deplacerDossiersAction: vi.fn(async () => ({ ok: true, n: 2 })),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · glisser-déposer, écran MONTÉ (jsdom, faux temps) · la
 * ROBUSTESSE du glisser. On lit le RÉSULTAT :
 *  · les TOASTS de l'écran · lâchée sur une cible refusée, la charge fait dire
 *    la raison du serveur, une fois · dans la séquence d'un vrai navigateur
 *    (aucun `drop` sur une cible qui n'a pas accepté le survol · `dragleave`
 *    puis `dragend`) comme si `drop` y est tiré ; rien quand on lâche ailleurs ;
 *  · la ZONE D'IMPORT (fichiers de l'ordinateur) · fermée tant que la charge
 *    interne est armée, de nouveau ouverte (et l'import lancé) quand la charge
 *    est désarmée sans `dragend` (source retirée du document · après la garde ;
 *    élément disparu des données · à la relecture) ;
 *  · le DÉPÔT accepté (l'action appelée) · une charge dont la source est encore
 *    là survit à une sortie de la fenêtre.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let toasts: string[] = [];
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); } };
let root: Root | null = null; let el: HTMLDivElement | null = null;

const T0 = '2026-10-20T10:00:00.000Z';
const PHOTOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', UGC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ARCHIVES = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOUVEAU = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const dossier = (id: string, name: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...extra });
const avec = (archives: Partial<DossierSource> | null, autres: DossierSource[] = []) => donneesDrive({
  dossiers: [dossier(PHOTOS, 'Photos produit'), dossier(UGC, 'UGC'), ...(archives ? [dossier(ARCHIVES, 'Archives', archives)] : []), ...autres],
  medias: [],
});
const DONNEES = avec({});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] }); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; vi.clearAllMocks(); vi.useRealTimers(); toasts = []; });

const ecran = (donnees: DonneesDrive) => <FournisseurSpatial value={CTX}><Bibliotheque donnees={donnees} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} /></FournisseurSpatial>;
const monter = async () => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(ecran(DONNEES)); });
  return el;
};
/** La liste se relit (rafraîchissement du serveur) · de nouvelles données, le même écran. */
const relire = async (donnees: DonneesDrive) => { await act(async () => { root!.render(ecran(donnees)); }); };

/** Le transfert minimal d'un glisser · `types` et `files` comme le navigateur les annonce ; `mozUserCancelled` (Firefox, Échap). */
const transfert = (types: string[] = [], files: File[] = []) => {
  const donnees: Record<string, string> = {};
  return { donnees, dropEffect: 'none', effectAllowed: 'all', types, files, mozUserCancelled: false, setData: (t: string, v: string) => { donnees[t] = v; }, getData: (t: string) => donnees[t] ?? '' };
};
type Transfert = ReturnType<typeof transfert>;
const evenement = async (cible: Element | null | undefined, type: string, dt: Transfert, extra: { relatedTarget?: EventTarget | null } = {}) => {
  expect(cible, `cible de ${type} introuvable`).toBeTruthy();
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: dt });
  if ('relatedTarget' in extra) Object.defineProperty(e, 'relatedTarget', { value: extra.relatedTarget });
  await act(async () => { cible!.dispatchEvent(e); });
  return e;
};
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

const carteDossier = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.fcard')].find((c) => c.querySelector('.ftx strong')?.textContent === nom) ?? null;
const noeud = (h: HTMLElement, nom: string) => [...h.querySelectorAll<HTMLElement>('.dtree .tnb')].find((b) => b.querySelector('.tnn')?.textContent === nom) ?? null;
const zoneOuverte = (h: HTMLElement) => !h.querySelector('#ddrop')!.hasAttribute('hidden');
const barre = (h: HTMLElement) => h.querySelector('#dmain .dbar');
/** Un VRAI fichier de l'ordinateur glissé sur l'écran · la zone d'import s'ouvre-t-elle (le survol est-il pris) ? */
const fichierSurvole = async (h: HTMLElement) => {
  const e = await evenement(barre(h), 'dragover', transfert(['Files'], [new File(['x'], 'x.jpg', { type: 'image/jpeg' })]));
  return { pris: e.defaultPrevented, zone: zoneOuverte(h) };
};
const refus = () => toasts.filter((t) => (Object.values(REFUS_DEPOT) as string[]).includes(t));

describe('dépôt sur une cible REFUSÉE · la raison dite par le toast, une fois', () => {
  it('séquence d’un vrai navigateur · survol refusé, lâcher (`dragleave` puis `dragend`, aucun `drop`) · la phrase du serveur, UNE fois', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    for (let i = 0; i < 4; i++) await evenement(noeud(h, 'Assets de la marque'), 'dragover', dt);
    expect(dt.dropEffect, 'la cible refuse (curseur interdit)').toBe('none');
    expect(toasts, 'rien pendant le survol · seule la région polie parle').toEqual([]);
    await evenement(noeud(h, 'Assets de la marque'), 'dragleave', dt, { relatedTarget: null });
    await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    expect([toasts, f.deplacer.mock.calls.length]).toEqual([[REFUS_DEPOT.dossierIci], 0]);
    // Un second `dragend` (ou une garde échue) ne redit rien.
    await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    await avancer(5 * GARDE_CHARGE_MS);
    expect(toasts).toEqual([REFUS_DEPOT.dossierIci]);
  });

  it('si le navigateur tire `drop` sur la cible refusée · dite au dépôt, pas redite à la fin du glisser', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    await evenement(noeud(h, 'Créations'), 'drop', dt);
    expect(toasts).toEqual([REFUS_DEPOT.cible]);
    await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    expect([toasts, f.deplacer.mock.calls.length]).toEqual([[REFUS_DEPOT.cible], 0]);
  });

  it('lâché ailleurs · après le survol refusé, un élément qui n’est pas une cible, une cible qui accepte ou la source · rien', async () => {
    const h = await monter();
    for (const ailleurs of [() => barre(h), () => carteDossier(h, 'Archives'), () => carteDossier(h, 'UGC')]) {
      const dt = transfert();
      await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
      await evenement(noeud(h, 'Assets de la marque'), 'dragover', dt);
      await evenement(ailleurs(), 'dragover', dt);
      dt.dropEffect = 'none';
      await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    }
    expect([toasts, f.deplacer.mock.calls.length]).toEqual([[], 0]);
  });

  it('Échap dit par le navigateur (`mozUserCancelled`), ou un dépôt pris ailleurs (`dropEffect` move) · rien', async () => {
    const h = await monter();
    for (const fin of [{ mozUserCancelled: true, dropEffect: 'none' }, { mozUserCancelled: false, dropEffect: 'move' }]) {
      const dt = transfert();
      await evenement(carteDossier(h, 'UGC'), 'dragstart', dt);
      await evenement(noeud(h, 'Assets de la marque'), 'dragover', dt);
      Object.assign(dt, fin);
      await evenement(carteDossier(h, 'UGC'), 'dragend', dt);
    }
    expect(toasts).toEqual([]);
  });

  it('témoin · un dépôt ACCEPTÉ après un survol refusé · le déplacement, aucun refus dit', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(noeud(h, 'Créations'), 'dragover', dt);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    await evenement(carteDossier(h, 'Archives'), 'dragend', dt);
    expect([f.deplacer.mock.calls, refus()]).toEqual([[[{ id: ARCHIVES, parentId: UGC }]], []]);
  });
});

describe('la charge se désarme sans `dragend` · la zone d’import répond de nouveau', () => {
  it(`source retirée du document en plein glisser (la liste se relit, le dossier est rangé ailleurs) · désarmée après la garde (${GARDE_CHARGE_MS} ms sans \`dragover\`), pas avant`, async () => {
    const h = await monter();
    const source = carteDossier(h, 'Archives')!;
    const dt = transfert();
    await evenement(source, 'dragstart', dt);
    expect((await evenement(carteDossier(h, 'UGC'), 'dragover', dt)).defaultPrevented, 'la charge est armée').toBe(true);
    // Un autre onglet a rangé « Archives » dans « Photos produit » · la carte quitte la grille, le dossier existe toujours.
    await relire(avec({ parentId: PHOTOS }));
    expect([source.isConnected, carteDossier(h, 'Archives')]).toEqual([false, null]);
    // Le lâcher · `dragend` tiré sur la source DÉTACHÉE · il n'atteint plus la fenêtre.
    await evenement(source, 'dragend', dt);
    // Avant la garde · la charge tient encore (un dépôt sur une cible qui accepte marcherait), la zone d'import reste fermée.
    await avancer(GARDE_CHARGE_MS - 1);
    expect(await fichierSurvole(h)).toEqual({ pris: false, zone: false });
    // Ce survol a relancé la garde · à son échéance, la charge tombe.
    await avancer(GARDE_CHARGE_MS);
    expect(await fichierSurvole(h)).toEqual({ pris: true, zone: true });
    // Le vrai fichier déposé part à l'import.
    const depot = await evenement(barre(h), 'drop', transfert(['Files'], [new File(['x'], 'x.jpg', { type: 'image/jpeg' })]));
    expect([depot.defaultPrevented, f.presign.mock.calls.length, f.deplacer.mock.calls.length]).toEqual([true, 1, 0]);
  });

  it('source retirée, le glisser CONTINUE (`dragover` toutes les 300 ms pendant 3 s) · la charge tient, le dépôt sur une cible qui accepte est pris', async () => {
    const h = await monter();
    const source = carteDossier(h, 'Archives')!;
    const dt = transfert();
    await evenement(source, 'dragstart', dt);
    await relire(avec({ parentId: PHOTOS }));
    expect(source.isConnected).toBe(false);
    const pris: boolean[] = [];
    for (let t = 0; t < 3 * GARDE_CHARGE_MS; t += 300) {
      pris.push((await evenement(carteDossier(h, 'UGC'), 'dragover', dt)).defaultPrevented);
      await avancer(300);
    }
    expect(pris.filter((x) => !x), `survols refusés · ${pris.join(', ')}`).toEqual([]);
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    expect(f.deplacer.mock.calls).toEqual([[{ id: ARCHIVES, parentId: UGC }]]);
  });

  it('source encore dans le document, pointeur sorti de la fenêtre 3 s (aucun `dragover`) · la charge survit, le dépôt au retour est accepté', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await evenement(carteDossier(h, 'UGC'), 'dragleave', dt, { relatedTarget: null });
    await avancer(3 * GARDE_CHARGE_MS);
    expect((await evenement(carteDossier(h, 'UGC'), 'dragover', dt)).defaultPrevented).toBe(true);
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    expect(f.deplacer.mock.calls).toEqual([[{ id: ARCHIVES, parentId: UGC }]]);
  });

  it('relecture · la source n’existe plus (supprimée, ou passée à la corbeille) · désarmée tout de suite, sans attendre la garde', async () => {
    for (const apres of [avec(null), avec({ deletedAt: T0 })]) {
      const h = await monter();
      const dt = transfert();
      await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
      expect((await evenement(carteDossier(h, 'UGC'), 'dragover', dt)).defaultPrevented).toBe(true);
      await relire(apres);
      // Sans avancer le temps · plus aucune cible ne prend la charge, la zone d'import répond.
      const survol = await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
      expect([survol.defaultPrevented, carteDossier(h, 'UGC')!.getAttribute('data-depot')]).toEqual([false, null]);
      expect(await fichierSurvole(h)).toEqual({ pris: true, zone: true });
      act(() => { root?.unmount(); }); el?.remove(); root = null;
    }
    expect([f.deplacer.mock.calls.length, toasts]).toEqual([0, []]);
  });

  it('témoin · la liste relue sans toucher à la charge (un dossier ajouté ailleurs) · la charge tient, le dépôt est accepté', async () => {
    const h = await monter();
    const dt = transfert();
    await evenement(carteDossier(h, 'Archives'), 'dragstart', dt);
    await relire(avec({}, [dossier(NOUVEAU, 'Nouveau')]));
    expect(await fichierSurvole(h)).toEqual({ pris: false, zone: false });
    await evenement(carteDossier(h, 'UGC'), 'dragover', dt);
    await evenement(carteDossier(h, 'UGC'), 'drop', dt);
    expect(f.deplacer.mock.calls).toEqual([[{ id: ARCHIVES, parentId: UGC }]]);
  });
});
