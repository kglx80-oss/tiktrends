import { describe, expect, it } from 'vitest';
import {
  ACCEPT_REMPLACEMENT, PHRASES_REMPLACEMENT, PHRASES_UTILISE_DANS, REFUS_REMPLACEMENT,
  confirmationRemplacement, contenuMedia, decisionRemplacement, donneesDrive, menuFichier, messageFichierRemplace,
  refusFamilleRemplacement, refusSourceRemplacement, remplacementFichier, utilisationsBibliotheque, vueUtiliseDans,
  type MediaSource,
} from '../src';

/**
 * Bibliothèque · « Remplacer » un fichier · règles pures (`remplacer.ts`).
 * On lit ce qui SORT · le geste proposé ou non, ouvert ou fermé avec sa
 * phrase, la décision du serveur (famille relue, source, objet identique) et
 * la confirmation affichée avant tout envoi (« Utilisé dans N projets »).
 */

const T0 = '2026-10-20T10:00:00.000Z';
const U1 = '11111111-1111-4111-8111-111111111111';
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset/${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, contenu: 'stockage', ...extra,
});
const d = donneesDrive({
  dossiers: [],
  medias: [
    media('img'),
    media('vid', { kind: 'video', mimeType: 'video/mp4', name: 'rush.mp4' }),
    media('son', { kind: 'audio', mimeType: 'audio/mpeg' }),
    media('pdf', { kind: 'other', mimeType: 'application/pdf' }),
    media('drive', { source: 'drive' }),
    media('base', { contenu: 'base' }),
    media('lien', { source: 'url', contenu: 'externe' }),
    media('inconnu', { contenu: undefined }),
    media('corbeille', { deletedAt: T0 }),
    media('sortie', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet 1', href: '/studio/projets/p1' } }),
    media('ancien', { source: 'historique', historique: { libelle: 'Ancien studio', telecharger: '/api/creations/ancien' } }),
  ],
});
const f = (id: string) => d.fichiers.find((x) => x.id === id)!;
const OUVERT = { lectureSeule: null, stockage: true };

describe('remplacementFichier · le geste, proposé ou non, ouvert ou fermé', () => {
  it('un téléversement du stockage · ouvert, filtré sur sa famille', () => {
    expect(remplacementFichier(f('img'), OUVERT)).toEqual({ libelle: 'Remplacer', ouvert: true, raison: null, accept: 'image/*', famille: 'image' });
    expect(['vid', 'son', 'pdf'].map((id) => remplacementFichier(f(id), OUVERT)!.accept)).toEqual([ACCEPT_REMPLACEMENT.video, ACCEPT_REMPLACEMENT.audio, ACCEPT_REMPLACEMENT.other]);
  });
  it('Drive, base, lien · proposé FERMÉ, chacun avec sa phrase', () => {
    expect(['drive', 'base', 'lien'].map((id) => [remplacementFichier(f(id), OUVERT)!.ouvert, remplacementFichier(f(id), OUVERT)!.raison]))
      .toEqual([[false, REFUS_REMPLACEMENT.drive], [false, REFUS_REMPLACEMENT.base], [false, REFUS_REMPLACEMENT.lien]]);
  });
  it('lecture seule puis stockage inactif · fermé avec la raison de l’écran', () => {
    expect(remplacementFichier(f('img'), { lectureSeule: 'Offre Core requise.', stockage: true })!.raison).toBe('Offre Core requise.');
    expect(remplacementFichier(f('img'), { lectureSeule: null, stockage: false })!.raison).toBe(REFUS_REMPLACEMENT.stockage);
  });
  it('corbeille, sortie Studios, ancienne création, contenu inconnu · aucun geste', () => {
    expect(['corbeille', 'sortie', 'ancien', 'inconnu'].map((id) => remplacementFichier(f(id), OUVERT))).toEqual([null, null, null, null]);
  });
});

describe('menuFichier · « Remplacer » après « Renommer »', () => {
  it('ouvert avec le stockage, fermé sans, absent pour une sortie Studios et en corbeille', () => {
    const cles = (id: string, stockage: boolean) => menuFichier(d, id, { section: 'drive', lectureSeule: null, stockage }).map((x) => x.cle);
    expect(cles('img', true).slice(0, 3)).toEqual(['apercu', 'renommer', 'remplacer']);
    const e = menuFichier(d, 'img', { section: 'drive', lectureSeule: null, stockage: false }).find((x) => x.cle === 'remplacer')!;
    expect([e.ouvert, e.raison, e.icone]).toEqual([false, REFUS_REMPLACEMENT.stockage, 'loop']);
    expect(cles('sortie', true)).not.toContain('remplacer');
    expect(menuFichier(d, 'corbeille', { section: 'corbeille', lectureSeule: null, stockage: true }).map((x) => x.cle)).not.toContain('remplacer');
  });
});

describe('decisionRemplacement · la décision du serveur', () => {
  const ancien = { kind: 'image', source: 'upload', contenu: 'stockage' as const, url: 'https://cdn/a.png' };
  it('même famille relue, autre objet · accepté (un PNG par un JPEG)', () => {
    expect(decisionRemplacement(ancien, { kind: 'image', url: 'https://cdn/b.jpg' })).toEqual({ ok: true });
  });
  it('autre famille · refusé, la phrase dit les deux familles', () => {
    expect(decisionRemplacement(ancien, { kind: 'video', url: 'https://cdn/b.mp4' })).toEqual({ ok: false, raison: refusFamilleRemplacement('image', 'video') });
    expect(refusFamilleRemplacement('image', 'video')).toBe('Remplacement refusé · une image se remplace par une image, ce fichier est une vidéo.');
    expect(refusFamilleRemplacement('audio', 'other')).toBe('Remplacement refusé · un son se remplace par un son, ce fichier est un document.');
  });
  it('introuvable, même objet, source qui ne se remplace pas · refusés', () => {
    expect(decisionRemplacement(null, { kind: 'image', url: 'x' })).toEqual({ ok: false, raison: REFUS_REMPLACEMENT.introuvable });
    expect(decisionRemplacement(ancien, { kind: 'image', url: ancien.url })).toEqual({ ok: false, raison: REFUS_REMPLACEMENT.identique });
    expect(decisionRemplacement({ ...ancien, source: 'drive' }, { kind: 'image', url: 'y' })).toEqual({ ok: false, raison: REFUS_REMPLACEMENT.drive });
    expect(decisionRemplacement({ ...ancien, contenu: 'base', url: 'data:image/png;base64,AA' }, { kind: 'image', url: 'y' })).toEqual({ ok: false, raison: REFUS_REMPLACEMENT.base });
  });
  it('contenuMedia · data: en base, objet du stockage, sinon ailleurs', () => {
    expect([contenuMedia('data:image/png;base64,AA', true), contenuMedia('https://cdn/a', true), contenuMedia('https://ailleurs/a', false)]).toEqual(['base', 'stockage', 'externe']);
    expect(refusSourceRemplacement({ source: 'upload', contenu: 'externe' })).toBe(REFUS_REMPLACEMENT.lien);
  });
});

describe('confirmationRemplacement · ce que l’écran dit AVANT d’envoyer', () => {
  const ref = (role: string) => ({ assetId: `bib_${U1}`, role, scope: 'global' });
  const u = utilisationsBibliotheque([
    { id: 'pa', titre: 'A', marque: 'M', statut: 'active', references: [ref('style')] },
    { id: 'pb', titre: 'B', marque: 'M', statut: 'archived', references: [ref('logo')] },
  ], { borne: false });
  it('cité par deux projets · « Utilisé dans 2 projets Studios », l’association à refaire, ce qui reste, l’ancienne gardée', () => {
    const c = confirmationRemplacement({ nom: 'face.jpg', nouveau: 'face-v2.png', utilise: vueUtiliseDans(u, { id: U1, lectureSeule: false }), tags: 0 });
    expect(c).toEqual({
      question: 'Remplacer « face.jpg » par « face-v2.png » ?',
      lignes: ['Utilisé dans 2 projets Studios · ils liront la nouvelle version.', PHRASES_REMPLACEMENT.association, PHRASES_REMPLACEMENT.garde, PHRASES_REMPLACEMENT.ancienne],
    });
    expect(c.lignes.join(' ')).not.toContain('—');
  });
  it('un seul projet · singulier ; aucun · la phrase de l’aperçu ; lecture Studios fermée · la phrase prudente ; tags · signalés', () => {
    const un = utilisationsBibliotheque([{ id: 'pa', titre: 'A', marque: 'M', statut: 'active', references: [ref('style')] }], { borne: false });
    expect(confirmationRemplacement({ nom: 'a', nouveau: 'b', utilise: vueUtiliseDans(un, { id: U1, lectureSeule: false }), tags: 0 }).lignes[0]).toBe('Utilisé dans 1 projet Studios · il lira la nouvelle version.');
    const aucun = confirmationRemplacement({ nom: 'a', nouveau: 'b', utilise: vueUtiliseDans(un, { id: 'autre', lectureSeule: false }), tags: 2 });
    expect(aucun.lignes).toEqual([PHRASES_UTILISE_DANS.aucun, PHRASES_REMPLACEMENT.garde, PHRASES_REMPLACEMENT.tags, PHRASES_REMPLACEMENT.ancienne]);
    expect(confirmationRemplacement({ nom: 'a', nouveau: 'b', utilise: null, tags: 0 }).lignes[0]).toBe(PHRASES_REMPLACEMENT.sansLecture);
  });
  it('le message de succès', () => {
    expect(messageFichierRemplace('face.jpg')).toBe('« face.jpg » remplacé par sa nouvelle version');
  });
});
