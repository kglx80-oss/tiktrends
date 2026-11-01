import { describe, expect, it } from 'vitest';
import {
  donneesDrive, vueDrive, gestesSelection, actionsApercuFichier, compteCorbeille, confirmationCorbeille, messageCorbeille,
  ETAT_DRIVE_INITIAL, NOTE_FICHIER_CORBEILLE, RAISONS_SELECTION, TAG_SELECTION_MAX, refusSelectionFichiersTropLarge,
  type ContexteSelection, type DossierSource, type EtatDrive, type MediaSource,
} from '../src';

/**
 * Bibliothèque · la CORBEILLE DES FICHIERS · règles pures. Un fichier mis à la
 * corbeille (`deletedAt` posé) ne se montre que dans la section « Corbeille »
 * (ni dossier, ni récents, ni recherche, ni compte), s'y sélectionne pour
 * « Restaurer », et seul lui offre « Supprimer définitivement » dans l'aperçu.
 * On lit la VUE et les gestes rendus, jamais la présence d'un appel.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-25T10:00:00.000Z';
const dossier = (id: string, name: string, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0, ...o });
const media = (id: string, o: Partial<MediaSource> = {}): MediaSource => ({
  id, name: id, kind: 'image', mimeType: 'image/png', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: ['flacon'] }, ...o,
});
const d = donneesDrive({
  dossiers: [dossier('a', 'Photos produit'), dossier('x', 'Jeté', { deletedAt: T0 }), dossier('y', 'Sous jeté', { parentId: 'x' })],
  medias: [
    media('vivant', { folderId: 'a' }),
    media('jete-racine', { deletedAt: T1, createdAt: T1 }),
    media('jete-dossier', { folderId: 'a', deletedAt: T1 }),
    media('dans-dossier-jete', { folderId: 'y' }),
    // Une sortie Studios ne va jamais à la corbeille des fichiers · un `deletedAt` y serait ignoré.
    media('studio', { source: 'studios', studio: { projetId: 'p', projetTitre: 'Projet', href: '/p' }, ia: undefined, deletedAt: T1 }),
  ],
});
const etat = (o: Partial<EtatDrive> = {}): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, ...o });
const noms = (v: ReturnType<typeof vueDrive>) => v.fichiers.map((f) => f.id);
const DRIVE: ContexteSelection = { section: 'drive', lectureSeule: null, ia: true };
const CORBEILLE: ContexteSelection = { ...DRIVE, section: 'corbeille' };

describe('un fichier en corbeille ne se montre QUE dans la corbeille', () => {
  it('la construction le marque · seule une ligne de la bibliothèque', () => {
    expect(d.fichiers.filter((f) => f.supprime).map((f) => f.id)).toEqual(['jete-racine', 'jete-dossier']);
  });
  it('ni dans son dossier, ni à la racine des assets', () => {
    expect(noms(vueDrive(d, etat({ chemin: ['r:assets', 'a'] })))).toEqual(['vivant']);
    expect(noms(vueDrive(d, etat()))).toEqual([]);
  });
  it('ni dans les récents, ni dans une recherche (nom ou tag)', () => {
    expect(noms(vueDrive(d, etat({ section: 'recents' })))).toEqual(['studio', 'vivant']);
    expect(noms(vueDrive(d, etat({ recherche: 'jete' })))).toEqual([]);
    expect(noms(vueDrive(d, etat({ recherche: 'flacon' })))).toEqual(['vivant']);
  });
  it('ni dans les comptes (onglets, arbre, carte du dossier)', () => {
    const v = vueDrive(d, etat());
    expect(v.onglets.find((o) => o.id === 'r:assets')!.compte).toBe(1);
    expect(v.arbre.find((n) => n.id === 'a')!.compte).toBe(1);
    expect(vueDrive(d, etat({ chemin: ['r:assets'] })).dossiers.find((c) => c.id === 'a')!.compte).toBe(1);
  });
  it('la section « Corbeille » montre les fichiers jetés · un fichier d’un dossier jeté n’y est pas (il revient avec son dossier)', () => {
    const v = vueDrive(d, etat({ section: 'corbeille' }));
    expect(v.dossiers.map((c) => c.id)).toEqual(['x']);
    expect(noms(v)).toEqual(['jete-dossier', 'jete-racine']);
    expect(v.vide).toBeNull();
  });
  it('corbeille vide · la phrase cite les fichiers', () => {
    expect(vueDrive(donneesDrive({ dossiers: [], medias: [] }), etat({ section: 'corbeille' })).vide)
      .toEqual({ titre: 'La corbeille est vide', texte: 'Un dossier ou un fichier mis à la corbeille reste ici, restaurable.', icone: 'x' });
  });
  it('le nombre à côté de « Corbeille » · un sommet de dossier et chaque fichier jeté', () => {
    expect(compteCorbeille(d)).toBe(3);
    expect(compteCorbeille(donneesDrive({ dossiers: [], medias: [media('m')] }))).toBe(0);
  });
});

describe('la barre de sélection', () => {
  it('hors corbeille · « Mettre à la corbeille » s’ouvre pour des fichiers ; un fichier jeté ne se sélectionne pas', () => {
    const s = gestesSelection(d, ['vivant', 'jete-racine'], DRIVE);
    expect(s.fichiers.map((f) => f.id)).toEqual(['vivant']);
    expect(s.gestes.find((g) => g.cle === 'corbeille')).toMatchObject({ ouvert: true, raison: null });
  });
  it('dans la corbeille · les fichiers jetés se restaurent, seuls ou avec un dossier ; un fichier vivant ne compte pas', () => {
    const s = gestesSelection(d, ['jete-racine', 'jete-dossier', 'vivant', 'studio'], CORBEILLE);
    expect(s.fichiers.map((f) => f.id)).toEqual(['jete-racine', 'jete-dossier']);
    expect(s.gestes).toEqual([{ cle: 'restaurer', libelle: 'Restaurer', ouvert: true, raison: null }]);
    const m = gestesSelection(d, ['x', 'jete-racine'], CORBEILLE);
    expect([m.composition, m.dossiers.length, m.fichiers.length, m.gestes[0]!.ouvert]).toEqual(['mixte', 1, 1, true]);
    expect(gestesSelection(d, ['vivant'], CORBEILLE).gestes[0]).toMatchObject({ ouvert: false, raison: RAISONS_SELECTION.restaurerVide });
  });
  it(`au-delà de ${TAG_SELECTION_MAX} fichiers · « Restaurer » fermé avant le clic, avec la phrase de l’action`, () => {
    const beaucoup = donneesDrive({ dossiers: [], medias: Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => media(`j${i}`, { deletedAt: T1 })) });
    const ids = beaucoup.fichiers.map((f) => f.id);
    expect(gestesSelection(beaucoup, ids, CORBEILLE).gestes[0]).toMatchObject({ ouvert: false, raison: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(gestesSelection(beaucoup, ids.slice(1), CORBEILLE).gestes[0]!.ouvert).toBe(true);
  });
  it('lecture seule · tout reste fermé dans la corbeille aussi', () => {
    expect(gestesSelection(d, ['jete-racine'], { ...CORBEILLE, lectureSeule: 'Lecture seule.' }).gestes[0]).toMatchObject({ ouvert: false, raison: 'Lecture seule.' });
  });
});

describe('l’aperçu d’un fichier', () => {
  const f = (id: string) => d.fichiers.find((x) => x.id === id)!;
  it('vivant · « Mettre à la corbeille » et l’édition ; JAMAIS « Supprimer définitivement »', () => {
    expect(actionsApercuFichier(f('vivant'), true)).toEqual({ edition: true, corbeille: true, restaurer: false, supprimerDefinitivement: false, note: null });
  });
  it('en corbeille · « Restaurer » et « Supprimer définitivement » ; ni édition, ni corbeille ; la note le dit', () => {
    expect(actionsApercuFichier(f('jete-racine'), true)).toEqual({ edition: false, corbeille: false, restaurer: true, supprimerDefinitivement: true, note: NOTE_FICHIER_CORBEILLE });
  });
  it('lecture seule · aucun geste, la note reste', () => {
    expect(actionsApercuFichier(f('jete-racine'), false)).toEqual({ edition: false, corbeille: false, restaurer: false, supprimerDefinitivement: false, note: NOTE_FICHIER_CORBEILLE });
    expect(actionsApercuFichier(f('vivant'), false).corbeille).toBe(false);
  });
  it('une sortie Studios · rien', () => {
    expect(actionsApercuFichier(f('studio'), true)).toEqual({ edition: false, corbeille: false, restaurer: false, supprimerDefinitivement: false, note: null });
  });
});

describe('confirmation et messages', () => {
  it('la confirmation dit ce qui part, et que tout reste restaurable', () => {
    expect(confirmationCorbeille(1, 0)).toBe('Mettre 1 dossier à la corbeille ? Ils restent restaurables, avec leur contenu.');
    expect(confirmationCorbeille(0, 1)).toBe('Mettre 1 fichier à la corbeille ? Il reste restaurable.');
    expect(confirmationCorbeille(0, 3)).toBe('Mettre 3 fichiers à la corbeille ? Ils restent restaurables.');
    expect(confirmationCorbeille(2, 1)).toBe('Mettre 2 dossiers et 1 fichier à la corbeille ? Tout reste restaurable, les dossiers avec leur contenu.');
  });
  it('le message dit ce qui a été écrit', () => {
    expect(messageCorbeille('corbeille', 2, 0)).toBe('2 dossiers placés dans la corbeille');
    expect(messageCorbeille('corbeille', 0, 1)).toBe('1 fichier placé dans la corbeille');
    expect(messageCorbeille('restaurer', 1, 2)).toBe('1 dossier et 2 fichiers restaurés');
    expect(messageCorbeille('restaurer', 0, 1)).toBe('1 fichier restauré');
  });
});
