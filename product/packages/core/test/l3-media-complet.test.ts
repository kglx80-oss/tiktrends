import { describe, it, expect } from 'vitest';
import { inspecterMedia } from '../src/studios/execution/media';

/**
 * Recette Codex du 8 oct · « des fichiers tronqués peuvent être acceptés comme
 * livrés ». `completed` exige un fichier COMPLET : un fichier coupé en route
 * (téléchargement interrompu, stockage partiel) a un en-tête intact et passait
 * le contrôle, qui ne lisait que l'en-tête.
 *
 * Fixtures RÉELLES (6×4, produites par sharp 0.34.5), pas des en-têtes
 * fabriqués : un contrôle qui accepte un en-tête seul les accepterait aussi.
 */
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const JPEG = b64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=');
const WEBP_SANS_PERTE = b64('UklGRh4AAABXRUJQVlA4TBEAAAAvBcAAAAdQrv5Xsf+BiOh/AAA=');
const WEBP = b64('UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoGAAQAAUAmJaACdAF1AAD+5IYsW/+5wP/9nA//2cD+JAAA');

/** MP4 minimal à boîtes cohérentes : ftyp + moov + mdat. */
function boite(type: string, corps: Uint8Array): Uint8Array {
  const o = new Uint8Array(8 + corps.length);
  new DataView(o.buffer).setUint32(0, o.length);
  o.set(new TextEncoder().encode(type), 4);
  o.set(corps, 8);
  return o;
}
function concat(...p: Uint8Array[]): Uint8Array {
  const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0));
  let i = 0;
  for (const x of p) { o.set(x, i); i += x.length; }
  return o;
}
const MP4 = concat(boite('ftyp', new TextEncoder().encode('isom\0\0\x02\0isomiso2')), boite('moov', new Uint8Array(16)), boite('mdat', new Uint8Array(32)));

const CAS: Array<[string, Uint8Array, string]> = [
  ['PNG', PNG, 'image/png'], ['JPEG', JPEG, 'image/jpeg'], ['WebP sans perte', WEBP_SANS_PERTE, 'image/webp'], ['WebP', WEBP, 'image/webp'], ['MP4', MP4, 'video/mp4'],
];

describe('média complet · un fichier tronqué n’est jamais livré', () => {
  for (const [nom, octets, mime] of CAS) {
    it(`${nom} complet ⇒ décodable`, () => {
      expect(inspecterMedia(octets)?.mime).toBe(mime);
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
  });
});
