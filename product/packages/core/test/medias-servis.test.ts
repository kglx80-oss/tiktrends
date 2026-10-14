import { describe, it, expect } from 'vitest';
import {
  typeMediaReel, typeMediaDeclare, typeMediaRetenu, decisionMediaServi,
  TYPES_MEDIA_SERVIS, ENTETES_MEDIA_FERMES, inspecterMedia, type TypeMediaServi,
} from '../src';
import { concat, boite, mp4StructurePlausible } from './l3-fixtures-media';

/**
 * Médias servis sur l'origine de l'application · le type se LIT dans les
 * octets, il appartient à une liste fermée de types non exécutables, et toute
 * décision de service porte les en-têtes fermés. On vérifie ce qui SORT
 * (type retenu, en-têtes), sur de vrais octets.
 */

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const txt = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const te = new TextEncoder();
const ftyp = (majeure: string, ...compat: string[]) => boite('ftyp', te.encode(majeure), new Uint8Array(4), ...compat.map((c) => te.encode(c)));

// Mêmes fixtures que la recette L3 (vrais fichiers, 6×4 pixels).
const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const JPEG = b64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=');
const WEBP = b64('UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoGAAQAAUAmJaACdAF1AAD+5IYsW/+5wP/9nA//2cD+JAAA');
const GIF = b64('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');
const MP4 = mp4StructurePlausible({ largeur: 288, hauteur: 512, echantillons: [100], donnees: 256 });

const SVG_SCRIPT = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>';

const POSITIFS: Array<[string, Uint8Array, TypeMediaServi]> = [
  ['PNG', PNG, 'image/png'],
  ['JPEG', JPEG, 'image/jpeg'],
  ['WebP', WEBP, 'image/webp'],
  ['GIF', GIF, 'image/gif'],
  ['AVIF', concat(ftyp('avif', 'mif1', 'miaf'), new Uint8Array(16)), 'image/avif'],
  ['AVIF (marque compatible)', concat(ftyp('mif1', 'miaf', 'avif'), new Uint8Array(16)), 'image/avif'],
  ['HEIC (iPhone)', concat(ftyp('heic', 'mif1', 'heic'), new Uint8Array(16)), 'image/heic'],
  ['MP4', MP4, 'video/mp4'],
  ['MOV', concat(ftyp('qt  ', 'qt  '), new Uint8Array(16)), 'video/quicktime'],
  ['MOV ancien (sans ftyp)', concat(boite('moov', new Uint8Array(8)), new Uint8Array(8)), 'video/quicktime'],
  ['WebM', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1]), 'video/webm'],
  ['MP3 (ID3)', concat(txt('ID3'), new Uint8Array([4, 0, 0, 0, 0, 0, 0])), 'audio/mpeg'],
  ['MP3 (trame)', new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]), 'audio/mpeg'],
  ['WAV', concat(txt('RIFF'), new Uint8Array([36, 0, 0, 0]), txt('WAVEfmt '), new Uint8Array(8)), 'audio/wav'],
  ['M4A', concat(ftyp('M4A ', 'isom'), new Uint8Array(16)), 'audio/mp4'],
];

const NEGATIFS: Array<[string, Uint8Array]> = [
  ['SVG avec script', txt(SVG_SCRIPT)],
  ['SVG précédé d’une déclaration XML', txt(`<?xml version="1.0"?>${SVG_SCRIPT}`)],
  ['SVG précédé d’un BOM UTF-8', concat(new Uint8Array([0xef, 0xbb, 0xbf]), txt(SVG_SCRIPT))],
  ['SVG précédé d’espaces', txt(`\n\n   ${SVG_SCRIPT}`)],
  ['HTML', txt('<!doctype html><html><script>fetch("/api")</script></html>')],
  ['HTML en UTF-16', new Uint8Array(Buffer.from('﻿<html><script>x</script></html>', 'utf16le'))],
  ['XML', txt('<?xml version="1.0"?><a/>')],
  ['PDF', txt('%PDF-1.7\n1 0 obj')],
  ['texte', txt('bonjour')],
  ['vide', new Uint8Array(0)],
  ['trois octets', new Uint8Array([0xff, 0xd8, 0xff])],
  ['RIFF quelconque (AVI)', concat(txt('RIFF'), new Uint8Array(4), txt('AVI LIST'))],
];

describe('typeMediaReel · le type se lit dans les octets', () => {
  for (const [nom, o, attendu] of POSITIFS) {
    it(`${nom} ⇒ ${attendu}`, () => expect(typeMediaReel(o)).toBe(attendu));
  }
  for (const [nom, o] of NEGATIFS) {
    it(`${nom} ⇒ refusé`, () => expect(typeMediaReel(o)).toBeNull());
  }

  it('concorde avec `inspecterMedia` (Studios) sur les formats qu’il connaît', () => {
    for (const o of [PNG, JPEG, WEBP, MP4]) {
      const strict = inspecterMedia(o);
      expect(strict, 'fixture complète').not.toBeNull();
      expect(typeMediaReel(o)).toBe(strict!.mime);
    }
  });

  it('une photo suivie de données après la fin d’image reste une image (pas la rigueur de Studios)', () => {
    const avecQueue = concat(JPEG, txt('données constructeur'));
    expect(inspecterMedia(avecQueue)).toBeNull();
    expect(typeMediaReel(avecQueue)).toBe('image/jpeg');
  });
});

describe('la liste servie ne contient que des types que le navigateur n’exécute pas', () => {
  it('ni SVG, ni HTML, ni XML, ni script, ni PDF', () => {
    for (const t of Object.keys(TYPES_MEDIA_SERVIS)) {
      expect(t).toMatch(/^(image|video|audio)\//);
      expect(t).not.toMatch(/svg|html|xml|script|pdf|text/);
    }
  });
});

describe('typeMediaDeclare · filtre d’entrée, casse et paramètres ignorés', () => {
  it.each([
    ['IMAGE/PNG; charset=binary', 'image/png'],
    ['image/jpg', 'image/jpeg'],
    ['Video/MP4', 'video/mp4'],
    ['audio/x-wav', 'audio/wav'],
  ])('%s ⇒ %s', (d, t) => expect(typeMediaDeclare(d)).toBe(t));
  it.each(['image/svg+xml', 'IMAGE/SVG+XML', 'text/html', 'application/xhtml+xml', 'application/pdf', 'image/', '', 'image/png\u0000'])('%s ⇒ refusé', (d) => {
    expect(typeMediaDeclare(d)).toBeNull();
  });
  it('null et undefined ⇒ refusé', () => {
    expect(typeMediaDeclare(null)).toBeNull();
    expect(typeMediaDeclare(undefined)).toBeNull();
  });
});

describe('typeMediaRetenu · import et synchro', () => {
  it('déclaré image/png, octets SVG ⇒ refusé (SVG déguisé)', () => {
    expect(typeMediaRetenu('image/png', txt(SVG_SCRIPT))).toBeNull();
  });
  it('déclaré image/jpeg, octets PNG ⇒ retenu en image/png (les octets gagnent)', () => {
    expect(typeMediaRetenu('image/jpeg', PNG)).toEqual({ type: 'image/png', kind: 'image' });
  });
  it('déclaré image/png, octets vidéo ⇒ refusé (famille différente)', () => {
    expect(typeMediaRetenu('image/png', MP4)).toBeNull();
  });
  it('déclaré text/html ⇒ refusé, même sans octets', () => {
    expect(typeMediaRetenu('text/html')).toBeNull();
  });
  it('vidéo déclarée sans octets ⇒ premier filtre seul', () => {
    expect(typeMediaRetenu('video/quicktime')).toEqual({ type: 'video/quicktime', kind: 'video' });
  });
});

describe('decisionMediaServi · type relu et en-têtes fermés', () => {
  it('un PNG sort en image/png, nosniff, CSP fermée, nom de fichier', () => {
    const d = decisionMediaServi(PNG, 'abc-123');
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.entetes['content-type']).toBe('image/png');
    expect(d.entetes['x-content-type-options']).toBe('nosniff');
    expect(d.entetes['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(d.entetes['content-disposition']).toBe('inline; filename="abc-123.png"');
  });

  it('un SVG avec script ⇒ refus (l’appelant rend 404)', () => {
    expect(decisionMediaServi(txt(SVG_SCRIPT), 'x')).toEqual({ ok: false });
  });

  it('le nom ne peut pas casser l’en-tête', () => {
    const d = decisionMediaServi(PNG, 'a"b\r\nset-cookie: x=1');
    expect(d.ok && d.entetes['content-disposition']).toBe('inline; filename="abset-cookiex1.png"');
  });

  it('les en-têtes fermés sont ceux de la route Studios', () => {
    expect(ENTETES_MEDIA_FERMES['x-content-type-options']).toBe('nosniff');
    expect(ENTETES_MEDIA_FERMES['content-security-policy']).toBe("default-src 'none'; sandbox");
  });
});
