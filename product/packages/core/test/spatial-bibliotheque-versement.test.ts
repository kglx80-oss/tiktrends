import { describe, expect, it } from 'vitest';
import {
  donneesDrive, gestesSelection, versementSelection, validerVersement, refusFichiersVersement, verserReferences, messageVersement,
  uuidsBibliothequeCites, idBibliotheque, versionDepuisEmpreinte, ROLES_VERSEMENT, RAISONS_ECART_VERSEMENT, RAISONS_VERSEMENT,
  RAISONS_SELECTION, TAG_SELECTION_MAX, refusSelectionFichiersTropLarge,
  type FichierCatalogue, type MediaSource, type ReferenceBrief, type LigneMediaVersement,
} from '../src';

/**
 * Bibliothèque · « Utiliser dans un projet » · règles pures. Ce que le geste
 * verse et ce qu'il écarte AVANT le clic, ce que l'action accepte, pourquoi
 * le serveur refuse un fichier (tout ou rien), et les références après
 * versement (même règle `ajouterAssociation` que l'écran « Produit et
 * références », doublons non ajoutés).
 */

const T0 = '2026-10-20T10:00:00.000Z';
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const d = donneesDrive({
  dossiers: [{ id: 'a', parentId: null, name: 'Photos', locked: false, deletedAt: null, createdAt: T0 }],
  medias: [
    media('img1', { rights: 'photo_marque' }),
    media('img2'),
    media('vid1', { kind: 'video', mimeType: 'video/mp4', name: 'rush.mp4' }),
    media('img3', { rights: 'a_preciser', name: 'douteuse.jpg' }),
  ],
});
const DRIVE = { section: 'drive' as const, lectureSeule: null, ia: true };

const U = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const PROJET = '44444444-4444-4444-8444-444444444444';
const fichier = (u: string): FichierCatalogue => ({
  assetId: idBibliotheque(u), assetVersion: versionDepuisEmpreinte('a'.repeat(64)), sha256: 'a'.repeat(64), nature: 'contenu', provenance: 'bibliotheque',
  libelle: u.slice(0, 4), productId: null, position: null, annonceur: null, apercu: true,
});
const catalogue = (uuids: string[]) => new Map(uuids.map((u) => [idBibliotheque(u), fichier(u)] as const));

describe('le geste dans la barre', () => {
  it('ouvert pour des fichiers, fermé pour des dossiers seuls avec sa raison, fermé au-delà de la borne', () => {
    expect(gestesSelection(d, ['img1'], DRIVE).gestes.find((g) => g.cle === 'projet')).toMatchObject({ libelle: 'Utiliser dans un projet', ouvert: true, raison: null });
    expect(gestesSelection(d, ['a'], DRIVE).gestes.find((g) => g.cle === 'projet')).toMatchObject({ ouvert: false, raison: RAISONS_SELECTION.projetDossiers });
    const beaucoup = donneesDrive({ dossiers: [], medias: Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => media(`x${i}`)) });
    expect(gestesSelection(beaucoup, beaucoup.fichiers.map((f) => f.id), DRIVE).gestes.find((g) => g.cle === 'projet')).toMatchObject({ ouvert: false, raison: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
  });
});

describe('ce qui part et ce qui est écarté, avant le clic', () => {
  it('les images aux droits admis partent ; une vidéo et une image « à préciser » sont écartées, nommées, avec leur raison', () => {
    const sel = gestesSelection(d, ['img1', 'img2', 'vid1', 'img3'], DRIVE);
    const v = versementSelection(d, sel.fichiers);
    expect(v.versables.map((f) => f.id)).toEqual(['img1', 'img2']);
    expect(v.ecartes).toEqual([
      { id: 'vid1', nom: 'rush.mp4', raison: RAISONS_ECART_VERSEMENT.type },
      { id: 'img3', nom: 'douteuse.jpg', raison: RAISONS_ECART_VERSEMENT.droits },
    ]);
    expect(v.phrase).toBe('2 images deviendront des références du projet · 2 fichiers écartés.');
  });
  it('rien de versable · la phrase le dit', () => {
    expect(versementSelection(d, [{ id: 'vid1' }]).phrase).toBe('Aucune image à verser · le fichier est écarté.');
    expect(versementSelection(d, [{ id: 'img2' }]).phrase).toBe('1 image deviendra une référence du projet.');
  });
});

describe('ce que l’action accepte', () => {
  it('projet, fichiers, rôle et portée explicites · normalisés, dédoublonnés', () => {
    expect(validerVersement({ projectId: PROJET.toUpperCase(), ids: [U[0], U[0]!.toUpperCase(), U[1]], role: 'style', scope: 'background' }))
      .toEqual({ ok: true, projectId: PROJET, ids: [U[0], U[1]], role: 'style', scope: 'background' });
  });
  it('tout écart refuse le geste entier, avec sa phrase', () => {
    const ok = { projectId: PROJET, ids: [U[0]], role: 'style', scope: 'global' };
    expect(validerVersement({ ...ok, projectId: 'x' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.projet });
    expect(validerVersement({ ...ok, role: undefined })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.role });
    expect(validerVersement({ ...ok, role: 'product' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.roleProduit });
    expect(validerVersement({ ...ok, scope: 'partout' })).toEqual({ ok: false, raison: RAISONS_VERSEMENT.portee });
    expect(validerVersement({ ...ok, ids: [] })).toEqual({ ok: false, raison: 'Aucun fichier sélectionné.' });
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(validerVersement({ ...ok, ids: trop })).toEqual({ ok: false, raison: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(validerVersement(null)).toEqual({ ok: false, raison: RAISONS_VERSEMENT.projet });
  });
  it('les rôles proposés · tous sauf Produit (réservé à la photo épinglée)', () => {
    expect(ROLES_VERSEMENT).toEqual(['identity', 'style', 'composition', 'logo', 'integrate']);
  });
});

describe('le refus serveur, fichier par fichier', () => {
  const ligne = (id: string, o: Partial<LigneMediaVersement> = {}): LigneMediaVersement => ({ id, name: `${id.slice(0, 4)}.jpg`, kind: 'image', brandId: null, rights: null, supprime: false, ...o });
  const MARQUE = 'marque-du-projet';
  it('commune ou de la marque du projet, image, hors corbeille, droits admis · aucun refus', () => {
    expect(refusFichiersVersement([ligne(U[0]!), ligne(U[1]!, { brandId: MARQUE, rights: 'photo_marque' })], [U[0]!, U[1]!], MARQUE)).toEqual([]);
  });
  it('introuvable (autre espace), corbeille, pas une image, autre marque, droits · chacun sa phrase', () => {
    const r = refusFichiersVersement([
      ligne(U[1]!, { supprime: true }), ligne(U[2]!, { kind: 'video' }),
      ligne('55555555-5555-4555-8555-555555555555', { brandId: 'autre' }), ligne('66666666-6666-4666-8666-666666666666', { rights: 'a_preciser' }),
    ], [U[0]!, U[1]!, U[2]!, '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'], MARQUE);
    expect(r.map((x) => x.raison)).toEqual([
      'Un fichier sélectionné est introuvable dans cet espace.',
      '« 2222.jpg » est à la corbeille.',
      '« 3333.jpg » n’est pas une image · les références d’un projet sont des images.',
      '« 5555.jpg » appartient à une autre marque que le projet.',
      '« 6666.jpg » a des droits d’usage qui n’autorisent pas la publicité.',
    ]);
  });
});

describe('les références après versement', () => {
  it('chaque image devient UNE association (rôle et portée choisis), après les références déjà là', () => {
    const avant: ReferenceBrief[] = [{ assetId: 'src_x', assetVersion: 'v', sha256: 's', role: 'composition', scope: 'global', allowedChanges: [], requiredComponents: [] }];
    const r = verserReferences(avant, [U[0]!, U[1]!], 'style', 'background', catalogue([U[0]!, U[1]!]), null);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.references.map((x) => [x.assetId, x.role, x.scope])).toEqual([['src_x', 'composition', 'global'], [idBibliotheque(U[0]!), 'style', 'background'], [idBibliotheque(U[1]!), 'style', 'background']]);
    expect(r.ajoutes).toEqual([U[0], U[1]]);
    expect(r.dejaPresents).toEqual([]);
  });
  it('un doublon (même fichier, même rôle) n’est pas ajouté une seconde fois · un AUTRE rôle, si', () => {
    const premier = verserReferences([], [U[0]!], 'style', 'global', catalogue([U[0]!, U[1]!]), null);
    if (!premier.ok) throw new Error('refus');
    const r = verserReferences(premier.references, [U[0]!, U[1]!], 'style', 'global', catalogue([U[0]!, U[1]!]), null);
    if (!r.ok) throw new Error('refus');
    expect(r.references).toHaveLength(2);
    expect(r).toMatchObject({ ajoutes: [U[1]], dejaPresents: [U[0]] });
    const autre = verserReferences(r.references, [U[0]!], 'composition', 'global', catalogue([U[0]!, U[1]!]), null);
    expect(autre.ok && autre.references).toHaveLength(3);
  });
  it('un seul fichier hors catalogue · RIEN n’est versé (tout ou rien)', () => {
    const r = verserReferences([], [U[0]!, U[2]!], 'style', 'global', catalogue([U[0]!]), null);
    expect(r).toEqual({ ok: false, violations: [{ chemin: 'association/assetId', raison: 'fichier absent du catalogue de la marque ou des sources du projet' }] });
  });
});

describe('les phrases et les références citées', () => {
  it('message après versement', () => {
    expect(messageVersement(2, 1, 'Lunettes', 'style')).toBe('2 images versées dans « Lunettes » · rôle Style · 1 image y était déjà avec ce rôle.');
    expect(messageVersement(1, 0, '  ', 'logo')).toBe('1 image versée dans « Projet sans titre » · rôle Logo.');
    expect(messageVersement(0, 2, 'P', 'style')).toBe('Rien de nouveau dans « P » · 2 images y étaient déjà avec ce rôle.');
  });
  it('les médias de la bibliothèque cités par un brief · seulement `bib_<uuid>`', () => {
    expect(uuidsBibliothequeCites({ references: [{ assetId: idBibliotheque(U[0]!) }, { assetId: 'src_ab' }, { assetId: 'bib_pas-un-uuid' }, { assetId: idBibliotheque(U[0]!.toUpperCase()) }, null] })).toEqual([U[0]]);
    expect(uuidsBibliothequeCites(null)).toEqual([]);
    expect(uuidsBibliothequeCites({ references: 'x' })).toEqual([]);
  });
});
