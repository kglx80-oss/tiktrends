// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  connexionDrive, donneesDrive, messageCreationVersement, titreNouveauProjetParDefaut, LOT_ANALYSE_IMAGES, RAISONS_ECART_VERSEMENT,
  type DossierSource, type MediaSource,
} from '@tiktrends/core';

const PROJET = '44444444-4444-4444-8444-444444444444';
const NOUVEAU = '66666666-6666-4666-8666-666666666666';
const MARQUE = '77777777-7777-4777-8777-777777777777';
const f = vi.hoisted(() => {
  const PRET = { etat: 'pret', marque: { id: '77777777-7777-4777-8777-777777777777', nom: 'Marque A1' }, libelle: 'Nouveau concept créatif' };
  return {
    PRET,
    projets: vi.fn(async (): Promise<unknown> => ({ ok: true, projets: [{ id: '44444444-4444-4444-8444-444444444444', titre: 'Lunettes · rentrée', marque: 'Marque A1' }], creation: PRET })),
    verser: vi.fn(async (x: { projectId: string; ids: string[]; role: string; scope: string }): Promise<unknown> => ({
      ok: true, ajoutes: x.ids.length, dejaPresents: 0, versionN: 2, projet: { id: x.projectId, titre: 'Lunettes · rentrée', href: `/studio/projets/${x.projectId}/produit` },
    })),
    creer: vi.fn(async (x: { titre: string; ids: string[] }): Promise<unknown> => ({
      ok: true, projet: { id: '66666666-6666-4666-8666-666666666666', titre: x.titre, href: '/studio/projets/66666666-6666-4666-8666-666666666666/produit' },
      versement: { ok: true, ajoutes: x.ids.length, dejaPresents: 0, versionN: 2, projet: { id: '66666666-6666-4666-8666-666666666666', titre: x.titre, href: '/studio/projets/66666666-6666-4666-8666-666666666666/produit' } },
    })),
  };
});
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
vi.mock('../app/actions/studios/versement', () => ({
  projetsPourVersement: () => f.projets(),
  verserSelectionDansProjet: (x: { projectId: string; ids: string[]; role: string; scope: string }) => f.verser(x),
  creerProjetEtVerser: (x: { titre: string; ids: string[] }) => f.creer(x),
}));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque, type GestionBibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';

/**
 * Bibliothèque · « Utiliser dans un projet » depuis l'APERÇU d'un fichier, et
 * « Nouveau projet » dans la fenêtre. On MONTE l'écran (jsdom), on ouvre
 * l'aperçu, on lit ce qu'il propose (ouvert, fermé avec sa raison, absent) puis
 * ce que la fenêtre dit et l'appel réellement parti · UNE fois, avec ce seul
 * fichier. Pour la création, on lit l'appel parti (marque, titre, type, rôle,
 * portée), puis ce que l'écran dit · succès, ou projet créé mais versement
 * refusé (le projet devient le projet choisi, un nouvel essai ne le recrée pas).
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
    media(U3, 'rush.mp4', { kind: 'video', mimeType: 'video/mp4' }), media(U4, 'jetee.jpg', { deletedAt: T0 }),
  ],
});
const GESTION: GestionBibliotheque = { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null };
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });

const monter = async (lectureSeule: string | null = null) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={lectureSeule} stockage drive={DRIVE} maintenant={T0} gestion={GESTION} /></FournisseurSpatial>); });
  return el;
};
const clic = async (b: Element | null | undefined) => { expect(b, 'contrôle introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const apercu = (h: HTMLElement, nom: string) => clic(h.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`));
const gesteApercu = (h: HTMLElement) => h.querySelector('aside.dprev button[data-geste="projet-fichier"]') as HTMLButtonElement | null;
const fenetre = (h: HTMLElement) => h.querySelector('[role="dialog"] [data-versement=""]') as HTMLElement | null;
const champ = (h: HTMLElement, cle: string) => fenetre(h)!.querySelector(`[data-versement="${cle}"]`) as HTMLElement | null;
const choisir = async (s: HTMLElement | null, valeur: string) => {
  const x = s as HTMLSelectElement;
  await act(async () => { x.value = valeur; x.dispatchEvent(new Event('change', { bubbles: true })); });
};
const saisir = async (i: HTMLElement | null, valeur: string) => {
  const x = i as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(x, valeur); x.dispatchEvent(new Event('input', { bubbles: true })); });
};
const bouton = (h: HTMLElement) => champ(h, 'verser') as HTMLButtonElement;

describe('« Utiliser dans un projet » · depuis l’aperçu d’un seul fichier', () => {
  it('une image · le geste est OUVERT dans l’aperçu, la fenêtre parle de CE fichier, et le versement part UNE fois avec lui seul', async () => {
    const h = await monter();
    await apercu(h, 'face.jpg');
    const g = gesteApercu(h)!;
    expect([g.textContent, g.disabled]).toEqual(['Utiliser dans un projet', false]);
    // Aucune sélection n'est nécessaire · la barre n'est pas là.
    expect(h.querySelector('.dbulk')).toBeNull();
    await clic(g);
    expect(f.projets).toHaveBeenCalledTimes(1);
    expect(champ(h, 'phrase')!.textContent).toBe('1 image deviendra une référence du projet.');
    expect(bouton(h).textContent).toBe('Verser 1 image');
    await choisir(champ(h, 'projet'), PROJET);
    await choisir(champ(h, 'role'), 'composition');
    await choisir(champ(h, 'portee'), 'global');
    await clic(bouton(h));
    expect(f.verser).toHaveBeenCalledTimes(1);
    expect(f.verser).toHaveBeenCalledWith({ projectId: PROJET, ids: [U1], role: 'composition', scope: 'global' });
    expect(champ(h, 'succes')!.textContent).toContain('1 image versée dans « Lunettes · rentrée » · rôle Composition.');
  });

  it('la fenêtre de l’aperçu ignore la sélection en cours · seul le fichier de l’aperçu part', async () => {
    const h = await monter();
    await clic(h.querySelector('button.dchk[aria-label="Sélectionner dos.jpg"]'));
    await apercu(h, 'face.jpg');
    await clic(gesteApercu(h));
    expect(champ(h, 'phrase')!.textContent).toBe('1 image deviendra une référence du projet.');
    await choisir(champ(h, 'projet'), PROJET); await choisir(champ(h, 'role'), 'style'); await choisir(champ(h, 'portee'), 'global');
    await clic(bouton(h));
    expect(f.verser).toHaveBeenCalledWith({ projectId: PROJET, ids: [U1], role: 'style', scope: 'global' });
  });

  it('une vidéo · fermé, avec la raison d’écart', async () => {
    const h = await monter();
    await apercu(h, 'rush.mp4');
    expect([gesteApercu(h)!.disabled, gesteApercu(h)!.title]).toEqual([true, RAISONS_ECART_VERSEMENT.type]);
  });

  it('lecture seule · fermé avec la raison de la lecture seule, et aucune fenêtre ne s’ouvre', async () => {
    const h = await monter('Ton rôle est en lecture seule.');
    await apercu(h, 'face.jpg');
    expect([gesteApercu(h)!.disabled, gesteApercu(h)!.title]).toEqual([true, 'Ton rôle est en lecture seule.']);
    await act(async () => { gesteApercu(h)!.click(); });
    expect(fenetre(h)).toBeNull();
    expect(f.projets).not.toHaveBeenCalled();
  });

  it('un fichier de la corbeille · le geste n’est pas proposé', async () => {
    const h = await monter();
    await clic([...h.querySelectorAll('nav.dsec button')].find((b) => b.textContent?.startsWith('Corbeille')));
    await apercu(h, 'jetee.jpg');
    expect(h.querySelector('aside.dprev')).toBeTruthy();
    expect(gesteApercu(h)).toBeNull();
  });
});

describe('« Nouveau projet » · dans la fenêtre de versement', () => {
  const ouvrirDepuisApercu = async () => {
    const h = await monter();
    await apercu(h, 'face.jpg');
    await clic(gesteApercu(h));
    return h;
  };
  const TITRE_DEFAUT = titreNouveauProjetParDefaut('ads', 'Marque A1');

  it('crée le projet pour la marque active, puis verse · l’appel parti, le message, et le projet devient le projet choisi', async () => {
    const h = await ouvrirDepuisApercu();
    await clic(champ(h, 'mode-nouveau'));
    expect(champ(h, 'projet')).toBeNull();
    expect((champ(h, 'titre') as HTMLInputElement).value).toBe(TITRE_DEFAUT);
    expect(champ(h, 'marque')!.textContent).toBe('Projet de la marque Marque A1 · son brief reste à préciser dans le projet.');
    await saisir(champ(h, 'titre'), 'Rentrée');
    await choisir(champ(h, 'type'), 'image');
    expect([bouton(h).textContent, bouton(h).title]).toEqual(['Créer et verser 1 image', 'Choisis un rôle · aucun rôle n’est déduit du fichier.']);
    await choisir(champ(h, 'role'), 'style'); await choisir(champ(h, 'portee'), 'background');
    await clic(bouton(h));
    expect(f.creer).toHaveBeenCalledTimes(1);
    expect(f.creer).toHaveBeenCalledWith({ brandId: MARQUE, titre: 'Rentrée', type: 'image', ids: [U1], role: 'style', scope: 'background' });
    expect(f.verser).not.toHaveBeenCalled();
    const texte = messageCreationVersement('Rentrée', { ok: true, ajoutes: 1, dejaPresents: 0, role: 'style' });
    expect(champ(h, 'succes')!.textContent).toContain(texte);
    expect(champ(h, 'succes')!.querySelector('a')!.getAttribute('href')).toBe(`/studio/projets/${NOUVEAU}/produit`);
    expect(toasts).toEqual([texte]);
    // Le projet créé est désormais LE projet choisi · un nouveau clic verse, il ne recrée pas.
    expect((champ(h, 'projet') as HTMLSelectElement).value).toBe(NOUVEAU);
    expect([...champ(h, 'projet')!.querySelectorAll('option:not([disabled])')].map((o) => o.textContent)).toEqual(['Rentrée · Marque A1', 'Lunettes · rentrée · Marque A1']);
  });

  it('projet créé mais versement refusé · l’écran le DIT, garde le projet choisi, et le nouvel essai verse sans recréer', async () => {
    f.creer.mockResolvedValueOnce({
      ok: true, projet: { id: NOUVEAU, titre: 'Rentrée', href: `/studio/projets/${NOUVEAU}/produit` },
      versement: { ok: false, code: 'INVALID_SCHEMA', message: 'x', targetIds: [], status: 422, recoverable: true, traceId: 't', violations: [{ chemin: 'fichiers/0', raison: '« face.jpg » est à la corbeille.' }] },
    });
    const h = await ouvrirDepuisApercu();
    await clic(champ(h, 'mode-nouveau'));
    await saisir(champ(h, 'titre'), 'Rentrée');
    await choisir(champ(h, 'role'), 'style'); await choisir(champ(h, 'portee'), 'global');
    await clic(bouton(h));
    const partiel = champ(h, 'partiel')!;
    expect(partiel.textContent).toContain('Projet « Rentrée » créé, mais aucune image n’y a été versée · « face.jpg » est à la corbeille. Le projet reste · réessaie le versement ou ouvre-le.');
    expect(partiel.querySelector('a')!.getAttribute('href')).toBe(`/studio/projets/${NOUVEAU}/produit`);
    expect(champ(h, 'succes')).toBeNull();
    expect((champ(h, 'projet') as HTMLSelectElement).value).toBe(NOUVEAU);
    await clic(bouton(h));
    expect(f.creer).toHaveBeenCalledTimes(1);
    expect(f.verser).toHaveBeenCalledWith({ projectId: NOUVEAU, ids: [U1], role: 'style', scope: 'global' });
  });

  it('création refusée par le serveur · la raison est dite, rien n’est ajouté à la liste', async () => {
    f.creer.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND', message: 'Introuvable dans ton espace.', targetIds: [], status: 404, recoverable: false, traceId: 't' });
    const h = await ouvrirDepuisApercu();
    await clic(champ(h, 'mode-nouveau'));
    await choisir(champ(h, 'role'), 'style'); await choisir(champ(h, 'portee'), 'global');
    await clic(bouton(h));
    expect(champ(h, 'erreur')!.textContent).toBe('Introuvable dans ton espace.');
    expect(champ(h, 'titre')).toBeTruthy();
    await clic(champ(h, 'mode-existant'));
    expect([...champ(h, 'projet')!.querySelectorAll('option:not([disabled])')].map((o) => o.textContent)).toEqual(['Lunettes · rentrée · Marque A1']);
  });

  it('titre vide · le bouton reste fermé avec la règle de nom', async () => {
    const h = await ouvrirDepuisApercu();
    await clic(champ(h, 'mode-nouveau'));
    await choisir(champ(h, 'role'), 'style'); await choisir(champ(h, 'portee'), 'global');
    await saisir(champ(h, 'titre'), '  ');
    expect([bouton(h).disabled, bouton(h).title]).toEqual([true, 'Donne un titre au projet.']);
  });

  it('aucun projet actif · la fenêtre s’ouvre sur « Nouveau projet »', async () => {
    f.projets.mockResolvedValueOnce({ ok: true, projets: [], creation: f.PRET });
    const h = await ouvrirDepuisApercu();
    expect(champ(h, 'sans-projet')!.textContent).toBe('Aucun projet actif dans ton espace · crée-le ici.');
    expect(champ(h, 'mode-nouveau')!.getAttribute('aria-pressed')).toBe('true');
    expect(champ(h, 'titre')).toBeTruthy();
  });

  it('rôle en lecture seule Studios · « Nouveau projet » n’est pas proposé, la raison est dite', async () => {
    f.projets.mockResolvedValueOnce({ ok: true, projets: [], creation: { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer · demande un rôle Membre à un administrateur de l’espace.' } });
    const h = await ouvrirDepuisApercu();
    expect(champ(h, 'mode-nouveau')).toBeNull();
    expect(champ(h, 'titre')).toBeNull();
    expect(champ(h, 'creation-fermee')!.textContent).toBe('Ton rôle permet de lire les projets, pas d’en créer · demande un rôle Membre à un administrateur de l’espace.');
    expect(champ(h, 'sans-projet')!.querySelector('a')!.getAttribute('href')).toBe('/studio/projets');
  });
});
