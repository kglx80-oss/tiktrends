import { describe, expect, it } from 'vitest';
import {
  destinationsDeplacement, donneesDrive, focusMenuSuivant, gestesSelection, menuFichier, refusSelectionFichiersTropLarge, versementApercu, RAISONS_ECART_VERSEMENT,
  type MediaSource,
} from '../src';

/**
 * Bibliothèque · le menu « … » d'une carte de fichier · règles pures. Le menu
 * applique à UN fichier la règle de la barre de sélection (`gestesSelection`)
 * et celle de l'aperçu (`versementApercu`) · mêmes libellés, même ouvert/fermé,
 * même raison. Aucun geste sans action · une sortie Studios n'a que l'aperçu,
 * son projet et le téléchargement.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const d = donneesDrive({
  dossiers: [
    { id: 'photos', parentId: null, name: 'Photos', locked: false, deletedAt: null, createdAt: T0 },
    { id: 'faces', parentId: 'photos', name: 'Faces', locked: false, deletedAt: null, createdAt: T0 },
    { id: 'jete', parentId: null, name: 'Vieux', locked: false, deletedAt: T0, createdAt: T0 },
  ],
  medias: [
    media('img', { rights: 'photo_marque', folderId: 'faces' }),
    media('vid', { kind: 'video', mimeType: 'video/mp4', name: 'rush.mp4' }),
    media('corbeille', { deletedAt: T0 }),
    media('sous-jete', { folderId: 'jete' }),
    media('sortie', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
    media('ancien', { source: 'historique', historique: { libelle: 'Ancien studio', telecharger: '/api/creations/ancien' } }),
  ],
});
const DRIVE = { section: 'drive' as const, lectureSeule: null };
const resume = (e: ReturnType<typeof menuFichier>) => e.map((x) => [x.cle, x.libelle, x.ouvert, x.raison]);

describe('menuFichier · les gestes existants, à l’unité', () => {
  it('une image vivante · aperçu, déplacer, projet, télécharger, corbeille · tous ouverts, libellés de la barre', () => {
    const e = menuFichier(d, 'img', DRIVE);
    expect(resume(e)).toEqual([
      ['apercu', 'Aperçu', true, null],
      ['renommer', 'Renommer', true, null],
      ['ranger', 'Déplacer vers…', true, null],
      ['projet', 'Utiliser dans un projet', true, null],
      ['telecharger', 'Télécharger', true, null],
      ['corbeille', 'Mettre à la corbeille', true, null],
    ]);
    expect(e.find((x) => x.cle === 'telecharger')!.href).toBe('/api/asset?id=img');
    expect(e.find((x) => x.cle === 'ranger')!.sousMenu).toBe(true);
    // La même règle que la barre de sélection appliquée à ce seul fichier.
    const s = gestesSelection(d, ['img'], { section: 'drive', lectureSeule: null, ia: false });
    for (const cle of ['ranger', 'corbeille'] as const) {
      const g = s.gestes.find((x) => x.cle === cle)!;
      expect(e.find((x) => x.cle === cle)).toMatchObject({ libelle: g.libelle, ouvert: g.ouvert, raison: g.raison });
    }
  });

  it('une vidéo · « Utiliser dans un projet » fermé avec la raison d’écart de l’aperçu', () => {
    const p = menuFichier(d, 'vid', DRIVE).find((x) => x.cle === 'projet')!;
    expect([p.ouvert, p.raison]).toEqual([false, RAISONS_ECART_VERSEMENT.type]);
    expect(p.raison).toBe(versementApercu(d, 'vid', null)!.raison);
  });

  it('lecture seule · les gestes d’écriture restent, FERMÉS avec la raison · aperçu et téléchargement ouverts', () => {
    const e = menuFichier(d, 'img', { section: 'drive', lectureSeule: 'Ton rôle est en lecture seule.' });
    expect(resume(e)).toEqual([
      ['apercu', 'Aperçu', true, null],
      ['renommer', 'Renommer', false, 'Ton rôle est en lecture seule.'],
      ['ranger', 'Déplacer vers…', false, 'Ton rôle est en lecture seule.'],
      ['projet', 'Utiliser dans un projet', false, 'Ton rôle est en lecture seule.'],
      ['telecharger', 'Télécharger', true, null],
      ['corbeille', 'Mettre à la corbeille', false, 'Ton rôle est en lecture seule.'],
    ]);
  });

  it('section « Corbeille » · aperçu, télécharger, restaurer · ni déplacer, ni projet', () => {
    expect(menuFichier(d, 'corbeille', { section: 'corbeille', lectureSeule: null }).map((x) => [x.cle, x.ouvert])).toEqual([['apercu', true], ['telecharger', true], ['restaurer', true]]);
  });

  it('un fichier hors de la section (en corbeille vu du drive, ou sous un dossier en corbeille) · aucun geste d’écriture', () => {
    expect(menuFichier(d, 'corbeille', DRIVE).map((x) => x.cle)).toEqual(['apercu', 'telecharger']);
    expect(menuFichier(d, 'sous-jete', DRIVE).map((x) => x.cle)).toEqual(['apercu', 'telecharger']);
  });

  it('une sortie Studios · aperçu, son projet, télécharger · une ancienne création · son lien de téléchargement', () => {
    const s = menuFichier(d, 'sortie', DRIVE);
    expect(s.map((x) => [x.cle, x.href ?? null])).toEqual([['apercu', null], ['ouvrir-projet', '/studio/projets/p1'], ['telecharger', '/api/asset?id=sortie']]);
    expect(menuFichier(d, 'ancien', DRIVE).map((x) => [x.cle, x.href ?? null])).toEqual([['apercu', null], ['telecharger', '/api/creations/ancien']]);
  });

  it('un fichier inconnu · aucun menu', () => {
    expect(menuFichier(d, 'disparu', DRIVE)).toEqual([]);
  });

  it('la phrase de borne de la barre ne s’applique jamais à un seul fichier', () => {
    expect(menuFichier(d, 'img', DRIVE).some((x) => x.raison === refusSelectionFichiersTropLarge(1))).toBe(false);
  });
});

describe('destinationsDeplacement · les dossiers de la barre, le dossier actuel marqué', () => {
  it('la racine et les dossiers vivants (chemin complet) · « Faces » est le dossier actuel', () => {
    expect(destinationsDeplacement(d, 'img')).toEqual([
      { id: null, nom: 'Assets de la marque · non classé', actuel: false },
      { id: 'photos', nom: 'Photos', actuel: false },
      { id: 'faces', nom: 'Photos › Faces', actuel: true },
    ]);
  });
  it('un fichier non classé · la racine est l’emplacement actuel', () => {
    expect(destinationsDeplacement(d, 'vid').filter((x) => x.actuel).map((x) => x.id)).toEqual([null]);
  });
});

describe('focusMenuSuivant · le clavier du menu', () => {
  it('flèches en boucle, Début, Fin, autre touche sans effet', () => {
    expect([focusMenuSuivant('ArrowDown', 0, 3), focusMenuSuivant('ArrowDown', 2, 3), focusMenuSuivant('ArrowUp', 0, 3), focusMenuSuivant('ArrowDown', -1, 3)]).toEqual([1, 0, 2, 0]);
    expect([focusMenuSuivant('Home', 2, 3), focusMenuSuivant('End', 0, 3), focusMenuSuivant('a', 0, 3), focusMenuSuivant('ArrowDown', 0, 0)]).toEqual([0, 2, null, null]);
  });
});
