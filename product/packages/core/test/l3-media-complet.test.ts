import { describe, it, expect } from 'vitest';
import {
  inspecterMedia, etatFichierMedia, verdictDecodage, decisionMediaRefuse, operationsNonVerifiables, TELECHARGEMENTS_MEDIA_MAX,
  type EnteteMedia,
} from '../src/studios/execution/media';
import { concat, mp4Recette88, mp4StructurePlausible, pngIdatCorrompu, jpegScanCoupe } from './l3-fixtures-media';

/**
 * Premier filtre PUR (structure plausible) · recettes du 8 octobre.
 *
 * 1. « des fichiers tronqués peuvent être acceptés comme livrés » : un fichier
 *    coupé en route a un en-tête intact et passait le contrôle.
 * 2. Contre-recette (P1 décodabilité) : un MP4 de 88 octets sans piste passait
 *    pour `video/mp4` lisible, et la garde appelait « décodable » un faux MP4.
 *
 * Le noyau ne décode rien : il dit « structure plausible », jamais
 * « décodable ». Le décodage RÉEL est au worker (`studios-decodeur`,
 * `l3-decodage`). Images : fixtures RÉELLES (6×4, produites par sharp 0.34.5).
 * Vidéo : AUCUNE vraie vidéo disponible (pas de ffmpeg) · le MP4 « plausible »
 * est fabriqué, données à zéro, et nommé comme tel.
 */
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const JPEG = b64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=');
const WEBP_SANS_PERTE = b64('UklGRh4AAABXRUJQVlA4TBEAAAAvBcAAAAdQrv5Xsf+BiOh/AAA=');
const WEBP = b64('UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoGAAQAAUAmJaACdAF1AAD+5IYsW/+5wP/9nA//2cD+JAAA');

const CAS: Array<[string, Uint8Array, string]> = [
  ['PNG', PNG, 'image/png'], ['JPEG', JPEG, 'image/jpeg'], ['WebP sans perte', WEBP_SANS_PERTE, 'image/webp'], ['WebP', WEBP, 'image/webp'],
  ['MP4 à structure plausible (fabriqué, données à zéro)', mp4StructurePlausible(), 'video/mp4'],
];

describe('premier filtre · un fichier tronqué n’est jamais plausible', () => {
  for (const [nom, octets, mime] of CAS) {
    it(`${nom} complet ⇒ structure plausible (pas « décodable » : le noyau ne décode pas)`, () => {
      expect(inspecterMedia(octets)?.mime).toBe(mime);
      expect(etatFichierMedia(octets)).toBe('structure_plausible');
    });
    it(`${nom} tronqué (moitié, 1 octet en moins) ⇒ refusé`, () => {
      expect(inspecterMedia(octets.subarray(0, Math.floor(octets.length / 2))), `${nom} coupé de moitié accepté`).toBeNull();
      expect(inspecterMedia(octets.subarray(0, octets.length - 1)), `${nom} privé de son dernier octet accepté`).toBeNull();
    });
  }
  it('PNG altéré au milieu (contrôle d’intégrité) ⇒ refusé', () => {
    const o = PNG.slice();
    o[Math.floor(o.length / 2)]! ^= 0xff;
    expect(inspecterMedia(o)).toBeNull();
  });
  it('PNG suivi d’octets parasites ⇒ refusé', () => {
    expect(inspecterMedia(concat(PNG, new Uint8Array([1, 2, 3])))).toBeNull();
  });
  it('dimensions lues sur le vrai fichier', () => {
    for (const [, octets, mime] of CAS.slice(0, 4)) expect(inspecterMedia(octets)).toEqual({ mime, largeur: 6, hauteur: 4 });
    expect(inspecterMedia(mp4StructurePlausible({ largeur: 640, hauteur: 360 }))).toEqual({ mime: 'video/mp4', largeur: 640, hauteur: 360 });
  });
});

describe('contre-recette du 8 octobre · un MP4 sans piste n’est pas une vidéo', () => {
  it('le MP4 de 88 octets de la recette (ftyp + moov et mdat à zéro) ⇒ refusé, à retélécharger', () => {
    const faux = mp4Recette88();
    expect(faux.length).toBe(88);
    expect(inspecterMedia(faux), 'MP4 sans piste accepté comme vidéo').toBeNull();
    expect(etatFichierMedia(faux)).toBe('incomplet');
  });
  const casNegatifs: Array<[string, Uint8Array]> = [
    ['moov sans trak', mp4StructurePlausible({ sansPiste: true })],
    ['piste son seulement (hdlr soun)', mp4StructurePlausible({ handler: 'soun' })],
    ['stsd sans entrée', mp4StructurePlausible({ entreesStsd: 0 })],
    ['aucun échantillon (stsz à 0)', mp4StructurePlausible({ echantillons: [] })],
    ['dimensions nulles', mp4StructurePlausible({ largeur: 0 })],
    ['décalage de morceau hors de mdat', mp4StructurePlausible({ decalageFaux: 10_000 })],
    ['échantillons plus gros que les données', mp4StructurePlausible({ donnees: 8 })],
    ['octets parasites après mdat', concat(mp4StructurePlausible(), new Uint8Array([0, 0, 0, 9, 1]))],
  ];
  for (const [nom, octets] of casNegatifs) {
    it(`${nom} ⇒ refusé`, () => {
      expect(inspecterMedia(octets), `${nom} accepté`).toBeNull();
      expect(etatFichierMedia(octets)).toBe('incomplet');
    });
  }
});

describe('CRC justes, charge utile abîmée · le premier filtre NE PEUT PAS trancher', () => {
  it('PNG à IDAT corrompu (CRC recalculés) et JPEG au scan coupé (EOI conservé) passent la structure · seul le décodeur réel les refuse', () => {
    // Si un jour ces cas tombent ici, tant mieux, mais le worker ne doit pas
    // compter dessus : c'est `l3-decodage` / `studios-decodeur` qui les refuse.
    expect(inspecterMedia(pngIdatCorrompu(PNG))).toEqual({ mime: 'image/png', largeur: 6, hauteur: 4 });
    expect(inspecterMedia(jpegScanCoupe(JPEG))).toEqual({ mime: 'image/jpeg', largeur: 6, hauteur: 4 });
  });
});

describe('verdict du décodage réel · pixels complets aux dimensions de l’en-tête', () => {
  const png: EnteteMedia = { mime: 'image/png', largeur: 6, hauteur: 4 };
  const mp4: EnteteMedia = { mime: 'video/mp4', largeur: 64, hauteur: 48 };
  it('décodé en entier aux bonnes dimensions ⇒ livrable', () => {
    expect(verdictDecodage(png, { ok: true, largeur: 6, hauteur: 4, canaux: 3, octetsPixels: 72 })).toEqual({ livrable: true, largeur: 6, hauteur: 4 });
  });
  it('vidéo SANS décodeur ⇒ refusée comme non vérifiable, jamais « lisible »', () => {
    const v = verdictDecodage(mp4, 'decodeur_absent');
    expect(v).toMatchObject({ livrable: false, suite: 'refuser' });
    expect(!v.livrable && v.raison).toMatch(/non vérifiable · aucun décodeur vidéo/);
    expect(!v.livrable && v.raison).not.toMatch(/(?<!non )lisible|décodable/);
  });
  it('décodage refusé ⇒ retéléchargement ; décodeur absent ou planté ⇒ attente, rien de compté', () => {
    expect(verdictDecodage(png, { ok: false, cause: 'contenu', raison: 'libspng read error' })).toMatchObject({ livrable: false, suite: 'retelecharger' });
    expect(verdictDecodage(png, { ok: false, cause: 'decodeur', raison: 'binaire absent' })).toMatchObject({ livrable: false, suite: 'attendre' });
  });
  it('dimensions différentes de l’en-tête, pixels manquants ⇒ pas livrable', () => {
    expect(verdictDecodage(png, { ok: true, largeur: 6, hauteur: 2, canaux: 3, octetsPixels: 36 })).toMatchObject({ livrable: false, suite: 'retelecharger' });
    expect(verdictDecodage(png, { ok: true, largeur: 6, hauteur: 4, canaux: 3, octetsPixels: 71 })).toMatchObject({ livrable: false, suite: 'retelecharger' });
  });
  it(`re-téléchargement borné à ${TELECHARGEMENTS_MEDIA_MAX}, puis échec`, () => {
    expect([1, 2, 3, 4].map(decisionMediaRefuse)).toEqual(['retelecharger', 'retelecharger', 'echec', 'echec']);
  });
  it('animation sans décodeur vidéo ⇒ non vérifiable, jamais soumise ; image ⇒ vérifiable', () => {
    const ops = [{ operation: 'keyframe:s1', profil: 'image_generation' }, { operation: 'clip:s1', profil: 'animation' }];
    expect(operationsNonVerifiables(ops, { video: false })).toEqual(['clip:s1']);
    expect(operationsNonVerifiables(ops, { video: true })).toEqual([]);
  });
});
