import { describe, it, expect } from 'vitest';
import {
  decisionDepotRelu, lectureDepot, typeMediaReel, OCTETS_RELUS_DEPOT, MESSAGES_REFUS_RELU, MESSAGES_REFUS_DEPOT,
  TYPE_DEPOT_NEUTRE, PLAFONDS_DEPOT,
} from '../src';
import { concat, boite } from './l3-fixtures-media';

/**
 * Enregistrement d'un téléversement · le type ENREGISTRÉ est celui relu dans
 * les octets de l'objet, jamais celui que le navigateur déclare. On lit ce qui
 * SORT de la règle (type retenu, famille, refus), sur de vrais octets.
 */

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const txt = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const te = new TextEncoder();
const ftyp = (majeure: string, ...compat: string[]) => boite('ftyp', te.encode(majeure), new Uint8Array(4), ...compat.map((c) => te.encode(c)));

const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const JPEG = b64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=');
const MP4 = concat(ftyp('isom', 'isom', 'iso2', 'avc1', 'mp41'), boite('free'), boite('mdat', new Uint8Array(64)));
const M4A = concat(ftyp('M4A ', 'M4A ', 'isom', 'iso2'), boite('mdat', new Uint8Array(32)));
const HTML = txt('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');
const SVG = txt('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');
const PDF = txt('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
const TIFF = concat(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0, 0, 0]), new Uint8Array(64));

const decider = (nom: string, typeDeclare: string, octets: Uint8Array, taille = octets.length) =>
  decisionDepotRelu({ nom, typeDeclare, octets, taille });

describe('decisionDepotRelu · le type enregistré est le type RELU', () => {
  it('un PNG déclaré PNG ⇒ image/png', () => {
    expect(decider('1-ab-photo.png', 'image/png', PNG)).toEqual({ ok: true, contentType: 'image/png', famille: 'image', kind: 'image', taille: PNG.length });
  });
  it('un JPEG déclaré PNG ⇒ enregistré image/jpeg (même famille, type relu)', () => {
    expect(decider('1-ab-photo.png', 'image/png', JPEG)).toMatchObject({ ok: true, contentType: 'image/jpeg', kind: 'image' });
  });
  it('un MP4 déclaré mp4 ⇒ video/mp4 ; un M4A déclaré x-m4a ⇒ audio/mp4', () => {
    expect(decider('1-ab-clip.mp4', 'video/mp4', MP4)).toMatchObject({ ok: true, contentType: 'video/mp4', kind: 'video' });
    expect(decider('1-ab-voix.m4a', 'audio/x-m4a', M4A)).toMatchObject({ ok: true, contentType: 'audio/mp4', kind: 'audio' });
  });
  it('type absent (HEIC sous Chrome) ⇒ reconnu par l’extension de la clé, puis relu', () => {
    expect(decider('1-ab-photo.png', '', PNG)).toMatchObject({ ok: true, contentType: 'image/png' });
  });
  it('un PDF déclaré PDF ⇒ admis en application/octet-stream, famille document', () => {
    expect(decider('1-ab-devis.pdf', 'application/pdf', PDF)).toEqual({ ok: true, contentType: TYPE_DEPOT_NEUTRE, famille: 'document', kind: 'other', taille: PDF.length });
  });
  it('un média rare (TIFF) déclaré image/tiff ⇒ admis en application/octet-stream, famille image', () => {
    expect(decider('1-ab-scan.bin', 'image/tiff', TIFF)).toMatchObject({ ok: true, contentType: TYPE_DEPOT_NEUTRE, famille: 'image', kind: 'image' });
  });
});

describe('decisionDepotRelu · refus', () => {
  const REFUS: Array<[string, string, string, Uint8Array, string]> = [
    ['HTML déclaré PNG', '1-ab-photo.png', 'image/png', HTML, MESSAGES_REFUS_RELU.balisage],
    ['SVG déclaré PNG', '1-ab-photo.png', 'image/png', SVG, MESSAGES_REFUS_RELU.balisage],
    ['HTML en UTF-16 (BOM) déclaré PNG', '1-ab-photo.png', 'image/png', new Uint8Array(Buffer.from('﻿ \n<html><script>x</script></html>', 'utf16le')), MESSAGES_REFUS_RELU.balisage],
    ['HTML en UTF-16 BE déclaré PNG', '1-ab-photo.png', 'image/png', concat(new Uint8Array([0xfe, 0xff]), new Uint8Array(Buffer.from(' <html>', 'utf16le').swap16())), MESSAGES_REFUS_RELU.balisage],
    ['SVG précédé d’un BOM et d’espaces déclaré TIFF', '1-ab-scan.bin', 'image/tiff', concat(new Uint8Array([0xef, 0xbb, 0xbf]), txt('\n\t  '), SVG), MESSAGES_REFUS_RELU.balisage],
    ['HTML déclaré PDF', '1-ab-devis.pdf', 'application/pdf', txt('<html>%PDF-1.7</html>'), MESSAGES_REFUS_RELU.balisage],
    ['MP4 déclaré PNG (famille vidéo ≠ image)', '1-ab-photo.png', 'image/png', MP4, MESSAGES_REFUS_RELU.incoherent],
    ['PNG déclaré PDF', '1-ab-devis.pdf', 'application/pdf', PNG, MESSAGES_REFUS_RELU.incoherent],
    ['PDF déclaré PNG', '1-ab-photo.png', 'image/png', PDF, MESSAGES_REFUS_RELU.incoherent],
    ['PDF déclaré TIFF', '1-ab-scan.bin', 'image/tiff', PDF, MESSAGES_REFUS_RELU.incoherent],
    ['octets inconnus déclarés PNG', '1-ab-photo.png', 'image/png', TIFF, MESSAGES_REFUS_RELU.incoherent],
    ['octets inconnus déclarés PDF', '1-ab-devis.pdf', 'application/pdf', TIFF, MESSAGES_REFUS_RELU.incoherent],
    ['PNG déclaré text/html', '1-ab-photo.png', 'text/html', PNG, MESSAGES_REFUS_DEPOT.type],
    ['PNG déclaré image/svg+xml', '1-ab-photo.png', 'image/svg+xml', PNG, MESSAGES_REFUS_DEPOT.type],
  ];
  for (const [nom, cle, type, octets, erreur] of REFUS) {
    it(`${nom} ⇒ refusé`, () => expect(decider(cle, type, octets)).toEqual({ ok: false, erreur }));
  }
  it('objet vide ⇒ refusé « vide »', () => {
    expect(decider('1-ab-photo.png', 'image/png', new Uint8Array(0), 0)).toEqual({ ok: false, erreur: MESSAGES_REFUS_DEPOT.vide });
  });
  it('la taille jugée est la taille RELUE · une image au-delà de 64 Mo est refusée, une vidéo de même taille admise', () => {
    const lourde = PLAFONDS_DEPOT.image + 1;
    expect(decider('1-ab-photo.png', 'image/png', PNG, lourde)).toEqual({ ok: false, erreur: 'Image trop lourde (64 Mo au plus).' });
    expect(decider('1-ab-photo.png', 'image/png', PNG, PLAFONDS_DEPOT.image)).toMatchObject({ ok: true });
    expect(decider('1-ab-clip.mp4', 'video/mp4', MP4, lourde)).toMatchObject({ ok: true, taille: lourde });
  });
  it('taille illisible (négative, non entière) ⇒ refusé', () => {
    expect(decider('1-ab-photo.png', 'image/png', PNG, -1)).toEqual({ ok: false, erreur: MESSAGES_REFUS_DEPOT.invalide });
    expect(decider('1-ab-photo.png', 'image/png', PNG, 1.5)).toEqual({ ok: false, erreur: MESSAGES_REFUS_DEPOT.invalide });
  });
});

describe('OCTETS_RELUS_DEPOT · le plus petit préfixe qui suffit à typeMediaReel', () => {
  // `ftyp` de 256 octets : majeure `mif1`, 59 marques neutres, `avif` en DERNIER (octets 252..255).
  const ftyp256 = concat(ftyp('mif1', ...Array.from({ length: 59 }, () => 'miaf'), 'avif'), new Uint8Array(64));
  it('la boîte témoin fait bien 256 octets et finit par avif', () => {
    expect(new DataView(ftyp256.buffer).getUint32(0)).toBe(256);
    expect(Buffer.from(ftyp256.subarray(252, 256)).toString()).toBe('avif');
  });
  it('à N octets, le verdict est celui du fichier entier ; à N − 1, il change', () => {
    expect(typeMediaReel(ftyp256)).toBe('image/avif');
    expect(typeMediaReel(ftyp256.subarray(0, OCTETS_RELUS_DEPOT))).toBe('image/avif');
    expect(typeMediaReel(ftyp256.subarray(0, OCTETS_RELUS_DEPOT - 1))).toBe('image/heic');
  });
  it('au-delà de N, rien ne change · 2 000 débuts aléatoires (signatures en tête) donnent le même verdict tronqués à N', () => {
    const tetes = [PNG.subarray(0, 8), JPEG.subarray(0, 3), txt('GIF89a'), txt('RIFF\0\0\0\0WEBP'), txt('RIFF\0\0\0\0WAVE'), new Uint8Array([0, 0, 1, 0]), new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), txt('ID3')];
    let graine = 7;
    const hasard = () => { graine = (graine * 1103515245 + 12345) >>> 0; return graine >>> 24; };
    for (let k = 0; k < 2000; k++) {
      const o = new Uint8Array(OCTETS_RELUS_DEPOT + 1 + (k % 300));
      for (let i = 0; i < o.length; i++) o[i] = hasard();
      if (k % 2) o.set(tetes[k % tetes.length]!);
      if (k % 5 === 0) { o.set([0, 0, (k % 3) ? 1 : 0, k % 256]); o.set(te.encode('ftyp'), 4); }
      expect(typeMediaReel(o.subarray(0, OCTETS_RELUS_DEPOT)), `début n° ${k}`).toBe(typeMediaReel(o));
    }
  });
  it('lectureDepot ignore tout ce qui suit N · un SVG caché après 256 octets d’un PNG reste un PNG', () => {
    const o = concat(PNG, new Uint8Array(OCTETS_RELUS_DEPOT), SVG);
    expect(lectureDepot(o)).toBe('image/png');
  });
});
