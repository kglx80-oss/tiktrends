// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  connexionDrive, donneesDrive, utilisationsBibliotheque, vueUtiliseDans, PHRASES_UTILISE_DANS, PROJETS_APERCU_MAX,
  type DossierSource, type MediaSource, type UtilisationsBibliotheque,
} from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
  mettreAssetsCorbeilleAction: vi.fn(), restaurerAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));
vi.mock('../app/actions/studios/versement', () => ({ projetsPourVersement: vi.fn(), verserSelectionDansProjet: vi.fn(), creerProjetEtVerser: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';
import { UtiliseDans } from '../spatial/vues/bibliotheque/utilise-dans';

/**
 * Bibliothèque · « Utilisé dans » dans l'aperçu d'un fichier. On MONTE l'écran
 * avec des utilisations (telles que la page les lit), on ouvre l'aperçu et on
 * lit le HTML rendu · le titre, chaque projet (titre, marque, rôles, archivé),
 * son lien vers « Produit et références », la phrase quand aucun projet ne le
 * cite, et l'ABSENCE de la section quand la lecture Studios n'est pas ouverte
 * ou pour une sortie Studios.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const CTX: CtxSpatial = { utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333';
const PA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const media = (id: string, name: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const DONNEES = donneesDrive({
  dossiers: [dossier('d-photos', 'Photos produit')],
  medias: [
    media(U1, 'face.jpg', { rights: 'photo_marque' }), media(U2, 'dos.jpg'),
    media(U3, 'sortie.png', { source: 'studios', studio: { projetId: PB, projetTitre: 'Rentrée', href: `/studio/projets/${PB}` } }),
  ],
});
const DRIVE = connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null });
const ref = (uuid: string, role: string) => ({ assetId: `bib_${uuid}`, role, scope: 'global' });
const UTILISATIONS = utilisationsBibliotheque([
  { id: PA, titre: 'Lunettes · rentrée', marque: 'Marque A1', statut: 'active', references: [ref(U1, 'style'), ref(U1, 'composition')] },
  { id: PB, titre: 'Ancien test', marque: 'Marque A2', statut: 'archived', references: [ref(U1, 'logo')] },
], { borne: false });

const monter = async (utilisations: UtilisationsBibliotheque | null | undefined) => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<FournisseurSpatial value={CTX}><Bibliotheque donnees={DONNEES} lectureSeule={null} stockage drive={DRIVE} maintenant={T0} utilisations={utilisations} /></FournisseurSpatial>); });
  return el;
};
const apercu = async (h: HTMLElement, nom: string) => {
  const b = h.querySelector(`button.dopen[aria-label="Aperçu de ${nom}"]`) as HTMLButtonElement | null;
  expect(b, `carte ${nom} introuvable`).toBeTruthy();
  await act(async () => { b!.click(); });
  return h.querySelector('aside.dprev') as HTMLElement;
};
const section = (a: HTMLElement) => a.querySelector('[data-utilise-dans]') as HTMLElement | null;

describe('« Utilisé dans » · l’aperçu d’un fichier', () => {
  it('cité par deux projets · titre, détail (marque, rôles, archivé) et lien vers « Produit et références », actif d’abord', async () => {
    const a = await apercu(await monter(UTILISATIONS), 'face.jpg');
    const s = section(a)!;
    expect(s.querySelector('.lbl')!.textContent).toBe('Utilisé dans');
    const lignes = [...s.querySelectorAll('li')].map((li) => [li.querySelector('a')!.getAttribute('href'), li.querySelector('strong')!.textContent, li.querySelector('small')!.textContent]);
    expect(lignes).toEqual([
      [`/studio/projets/${PA}/produit`, 'Lunettes · rentrée', 'Marque A1 · Style, Composition'],
      [`/studio/projets/${PB}/produit`, 'Ancien test', 'Marque A2 · Logo · archivé'],
    ]);
    expect(s.querySelector('[data-utilise-dans-phrase]')).toBeNull();
    // Rendu après la fiche du fichier (Type, Taille…), avant les gestes.
    expect(a.querySelector('dl.kv2')!.nextElementSibling).toBe(s);
  });

  it('cité par aucun projet · la phrase le dit, aucune liste', async () => {
    const s = section(await apercu(await monter(UTILISATIONS), 'dos.jpg'))!;
    expect([s.querySelector('ul'), s.querySelector('[data-utilise-dans-phrase]')!.textContent]).toEqual([null, PHRASES_UTILISE_DANS.aucun]);
  });

  it('lecture Studios fermée (null ou absente) · la section n’est pas rendue · jamais un faux « aucun projet »', async () => {
    expect(section(await apercu(await monter(null), 'face.jpg'))).toBeNull();
    act(() => { root?.unmount(); }); el?.remove();
    expect(section(await apercu(await monter(undefined), 'face.jpg'))).toBeNull();
  });

  it('une sortie Studios · pas de section (son lien « Ouvrir le projet » reste)', async () => {
    const h = await monter(UTILISATIONS);
    await act(async () => { ([...h.querySelectorAll('.btabs button')].find((b) => b.textContent?.includes('Créations')) as HTMLButtonElement).click(); });
    const projet = h.querySelector('button.fopen') as HTMLButtonElement;
    await act(async () => { projet.click(); });
    const a = await apercu(h, 'sortie.png');
    expect(section(a)).toBeNull();
    expect([...a.querySelectorAll('a')].some((x) => x.textContent === 'Ouvrir le projet')).toBe(true);
  });
});

describe('UtiliseDans · rendu HTML seul', () => {
  it(`au-delà de ${PROJETS_APERCU_MAX} projets · ${PROJETS_APERCU_MAX} liens et « Et N autres projets. »`, () => {
    const u = utilisationsBibliotheque(Array.from({ length: PROJETS_APERCU_MAX + 3 }, (_, i) => ({ id: `p${i}`, titre: `P${i}`, marque: 'M', statut: 'active' as const, references: [ref(U1, 'style')] })), { borne: true });
    const html = renderToStaticMarkup(<UtiliseDans vue={vueUtiliseDans(u, { id: U1, lectureSeule: false })!} />);
    expect(html.match(/<li /g)).toHaveLength(PROJETS_APERCU_MAX);
    expect(html).toContain(`Et 3 autres projets. ${PHRASES_UTILISE_DANS.borne}`);
    expect(html).not.toContain('—');
  });
});
