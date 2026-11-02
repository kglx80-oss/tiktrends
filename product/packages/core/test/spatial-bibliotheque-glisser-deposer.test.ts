import { describe, expect, it } from 'vitest';
import {
  chargeGlissee, glissable, verdictDepot, donneesDrive, destinationsDeplacementDossier, REFUS_DEPOT, REFUS_DOSSIER, TAG_SELECTION_MAX,
  type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · le glisser-déposer · règles pures. Le glisser n'est qu'un
 * raccourci de « Déplacer vers… » · ce qui part suit la règle de la barre
 * (fichiers) et du menu (dossier) ; ce qui reçoit suit la liste du menu
 * (`dossiersRangement`, `destinationsDeplacementDossier` → anti-cycle au noyau).
 */

const T0 = '2026-10-20T10:00:00.000Z';
const LS = 'Ton rôle est en lecture seule.';
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...extra,
});
const d = donneesDrive({
  dossiers: [
    dossier('photos'), dossier('faces', { parentId: 'photos' }), dossier('profil', { parentId: 'faces' }),
    dossier('ugc'), dossier('systeme', { locked: true }), dossier('jete', { deletedAt: T0 }),
    dossier('marque-b', { brandId: 'b' }),
  ],
  medias: [
    media('a', { folderId: 'photos' }), media('b', { folderId: 'photos' }), media('c'),
    media('poubelle', { folderId: 'ugc', deletedAt: T0 }),
    media('sortie', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
  ],
});
const DRIVE = { section: 'drive' as const, lectureSeule: null };

describe('chargeGlissee · ce qui part', () => {
  it('un fichier non sélectionné part SEUL · sélectionné, il emporte les fichiers de la sélection (pas les dossiers)', () => {
    expect(chargeGlissee(d, 'a', [], DRIVE)).toEqual({ type: 'fichiers', ids: ['a'] });
    expect(chargeGlissee(d, 'a', ['b', 'c'], DRIVE)).toEqual({ type: 'fichiers', ids: ['a'] });
    expect(chargeGlissee(d, 'a', ['a', 'c', 'ugc', 'sortie'], DRIVE)).toEqual({ type: 'fichiers', ids: ['a', 'c'] });
  });

  it('un dossier réel vivant part, avec son nom · seul, même sélectionné avec d’autres', () => {
    expect(chargeGlissee(d, 'faces', [], DRIVE)).toEqual({ type: 'dossier', id: 'faces', nom: 'faces' });
    expect(chargeGlissee(d, 'faces', ['faces', 'ugc', 'a'], DRIVE)).toEqual({ type: 'dossier', id: 'faces', nom: 'faces' });
  });

  it('rien ne part · lecture seule, corbeille, sortie Studios, dossier système, racine, projet, inconnu', () => {
    expect(chargeGlissee(d, 'a', [], { section: 'drive', lectureSeule: LS })).toBeNull();
    expect(chargeGlissee(d, 'photos', [], { section: 'drive', lectureSeule: LS })).toBeNull();
    expect(chargeGlissee(d, 'poubelle', [], { section: 'corbeille', lectureSeule: null })).toBeNull();
    expect(chargeGlissee(d, 'jete', [], { section: 'corbeille', lectureSeule: null })).toBeNull();
    expect(chargeGlissee(d, 'sortie', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'systeme', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'r:assets', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'r:creations', [], DRIVE)).toBeNull();
    expect(chargeGlissee(d, 'inconnu', [], DRIVE)).toBeNull();
    expect([glissable(d, 'a', DRIVE), glissable(d, 'faces', DRIVE), glissable(d, 'sortie', DRIVE), glissable(d, 'a', { section: 'drive', lectureSeule: LS })]).toEqual([true, true, false, false]);
  });

  it('une sélection au-delà de la borne de la barre ne part pas (même refus que « Déplacer vers… »)', () => {
    const n = TAG_SELECTION_MAX + 1;
    const gros = donneesDrive({ dossiers: [], medias: Array.from({ length: n }, (_, i) => media(`m${i}`)) });
    const tous = Array.from({ length: n }, (_, i) => `m${i}`);
    expect(chargeGlissee(gros, 'm0', tous, DRIVE)).toBeNull();
    expect(chargeGlissee(gros, 'm0', tous.slice(0, TAG_SELECTION_MAX), DRIVE)?.type).toBe('fichiers');
  });
});

describe('verdictDepot · ce qui reçoit', () => {
  const F = (ids: string[]) => ({ type: 'fichiers' as const, ids });
  const D = (id: string) => ({ type: 'dossier' as const, id, nom: id });

  it('des fichiers · tout dossier de rangement, la racine « Assets » valant non classé (null), nommé par son chemin', () => {
    expect(verdictDepot(d, F(['a']), 'ugc')).toEqual({ ok: true, destination: 'ugc', nom: 'ugc' });
    expect(verdictDepot(d, F(['a']), 'profil')).toEqual({ ok: true, destination: 'profil', nom: 'photos › faces › profil' });
    expect(verdictDepot(d, F(['a']), 'r:assets')).toEqual({ ok: true, destination: null, nom: 'Assets de la marque · non classé' });
    // Un seul des deux est déjà là · le dépôt garde son effet sur l'autre.
    expect(verdictDepot(d, F(['a', 'c']), 'photos')).toMatchObject({ ok: true, destination: 'photos' });
  });

  it('des fichiers · déjà là, une racine sans rangement, un projet, un dossier jeté, un inconnu · refusés', () => {
    expect(verdictDepot(d, F(['a']), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.fichierIci });
    expect(verdictDepot(d, F(['a', 'b']), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.fichiersIci });
    expect(verdictDepot(d, F(['c']), 'r:assets')).toEqual({ ok: false, raison: REFUS_DEPOT.fichierIci });
    for (const cible of ['r:creations', 'r:anciens', 'p:p1', 'jete', 'inconnu']) expect(verdictDepot(d, F(['a']), cible), cible).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
    expect(verdictDepot(d, F([]), 'ugc')).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
  });

  it('un dossier · ailleurs dans la même marque, ou à la racine · accepté', () => {
    expect(verdictDepot(d, D('faces'), 'ugc')).toEqual({ ok: true, destination: 'ugc', nom: 'ugc' });
    expect(verdictDepot(d, D('faces'), 'r:assets')).toEqual({ ok: true, destination: null, nom: 'Assets de la marque · non classé' });
  });

  it('un dossier · anti-cycle et règles du serveur · lui-même, un descendant, système, autre marque, déjà là · refusés avec la phrase', () => {
    expect(verdictDepot(d, D('photos'), 'photos')).toEqual({ ok: false, raison: REFUS_DOSSIER.soiMeme });
    expect(verdictDepot(d, D('photos'), 'faces')).toEqual({ ok: false, raison: REFUS_DOSSIER.descendant });
    expect(verdictDepot(d, D('photos'), 'profil')).toEqual({ ok: false, raison: REFUS_DOSSIER.descendant });
    expect(verdictDepot(d, D('ugc'), 'systeme')).toEqual({ ok: false, raison: REFUS_DOSSIER.destinationSysteme });
    expect(verdictDepot(d, D('ugc'), 'marque-b')).toEqual({ ok: false, raison: REFUS_DOSSIER.autreMarque });
    expect(verdictDepot(d, D('faces'), 'photos')).toEqual({ ok: false, raison: REFUS_DEPOT.dossierIci });
    expect(verdictDepot(d, D('photos'), 'r:assets')).toEqual({ ok: false, raison: REFUS_DEPOT.dossierIci });
    for (const cible of ['r:creations', 'jete', 'inconnu']) expect(verdictDepot(d, D('ugc'), cible), cible).toEqual({ ok: false, raison: REFUS_DEPOT.cible });
  });

  it('le verdict d’un dossier est celui du menu « Déplacer vers… » · pour chaque destination de la liste', () => {
    for (const o of destinationsDeplacementDossier(d, 'photos')) {
      const v = verdictDepot(d, D('photos'), o.id ?? 'r:assets');
      expect(v.ok, o.nom).toBe(!o.actuel && !o.raison);
    }
  });
});
