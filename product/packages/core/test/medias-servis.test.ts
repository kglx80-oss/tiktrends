import { describe, it, expect } from 'vitest';
import {
  typeMediaReel, typeMediaDeclare, typeMediaRetenu, decisionMediaServi, nomFichierSur, entreeSynchroDrive,
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


describe('decisionMediaServi · type relu, en-têtes fermés, aucun média retiré', () => {
  it('un PNG sort inline en image/png, nosniff, CSP fermée, nom de fichier', () => {
    const d = decisionMediaServi(PNG, { id: 'abc-123', nom: 'photo.png' });
    expect(d.mode).toBe('inline');
    expect(d.entetes['content-type']).toBe('image/png');
    expect(d.entetes['x-content-type-options']).toBe('nosniff');
    expect(d.entetes['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(d.entetes['content-disposition']).toBe('inline; filename="abc-123.png"');
  });

  it('un SVG avec script ⇒ téléchargement seul : octet-stream en pièce jointe, jamais image/svg+xml ni inline', () => {
    const d = decisionMediaServi(txt(SVG_SCRIPT), { id: 'x', nom: 'logo.svg' });
    expect(d.mode).toBe('telechargement');
    expect(d.entetes['content-type']).toBe('application/octet-stream');
    expect(d.entetes['content-disposition']).toBe('attachment; filename="logo.svg"');
    expect(d.entetes['x-content-type-options']).toBe('nosniff');
    expect(d.entetes['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(JSON.stringify(d.entetes)).not.toMatch(/svg\+xml|inline/);
  });

  it('HTML, PDF, TIFF, inconnu ⇒ même téléchargement seul', () => {
    for (const o of [txt('<html><script>x</script></html>'), txt('%PDF-1.7'), new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]), txt('?')]) {
      const d = decisionMediaServi(o, { id: 'i' });
      expect(d.mode).toBe('telechargement');
      expect(d.entetes['content-type']).toBe('application/octet-stream');
      expect(d.entetes['content-disposition']).toMatch(/^attachment; /);
    }
  });

  it('le nom ne peut pas casser l’en-tête, inline comme en pièce jointe', () => {
    const inline = decisionMediaServi(PNG, { id: 'a"b\r\nset-cookie: x=1' });
    expect(inline.entetes['content-disposition']).toBe('inline; filename="abset-cookiex1.png"');
    const pj = decisionMediaServi(txt(SVG_SCRIPT), { id: 'id-1', nom: '../a"b\r\nset-cookie: x=1.svg' });
    expect(pj.entetes['content-disposition']).toBe('attachment; filename="a-b-set-cookie-x-1.svg"');
    expect(decisionMediaServi(txt('x'), { id: 'id-1', nom: '"\r\n' }).entetes['content-disposition']).toBe('attachment; filename="id-1"');
  });

  it('nomFichierSur · caractères sûrs, pas de point de tête, repli sur l’id', () => {
    expect(nomFichierSur('Été 2026 · photo.TIFF', 'r')).toBe('Ete-2026-photo.TIFF');
    expect(nomFichierSur('.htaccess', 'r')).toBe('htaccess');
    expect(nomFichierSur('', 'abc')).toBe('abc');
  });

  it('les en-têtes fermés sont ceux de la route Studios', () => {
    expect(ENTETES_MEDIA_FERMES['x-content-type-options']).toBe('nosniff');
    expect(ENTETES_MEDIA_FERMES['content-security-policy']).toBe("default-src 'none'; sandbox");
  });
});

describe('entreeSynchroDrive · ce que la synchro Drive importe', () => {
  it('liste servie : type des octets, déposé avec ce type', () => {
    expect(entreeSynchroDrive('image/jpeg', PNG)).toEqual({ type: 'image/png', kind: 'image', depot: 'image/png', extension: 'png' });
    expect(entreeSynchroDrive('video/mp4')).toEqual({ type: 'video/mp4', kind: 'video', depot: 'video/mp4', extension: 'mp4' });
  });
  it('média rare non exécutable (TIFF, Ogg, MKV) : importé en téléchargement seul', () => {
    expect(entreeSynchroDrive('image/tiff', new Uint8Array([0x49, 0x49, 0x2a, 0]))).toEqual({ type: 'image/tiff', kind: 'image', depot: 'application/octet-stream', extension: 'bin' });
    expect(entreeSynchroDrive('audio/ogg')).toEqual({ type: 'audio/ogg', kind: 'audio', depot: 'application/octet-stream', extension: 'bin' });
    expect(entreeSynchroDrive('Video/X-Matroska; x=1')?.depot).toBe('application/octet-stream');
  });
  it('fichier non média non exécutable (PDF, ZIP, texte) : importé en téléchargement seul, kind other', () => {
    for (const t of ['application/pdf', 'application/zip', 'text/plain', 'text/csv']) {
      expect(entreeSynchroDrive(t), t).toEqual({ type: t, kind: 'other', depot: 'application/octet-stream', extension: 'bin' });
    }
  });
  it.each(['image/svg+xml', 'IMAGE/SVG+XML', 'text/html', 'application/xhtml+xml', 'application/javascript', 'text/javascript', 'application/x-shockwave-flash', 'video/x-ms-asf+xml', 'image/', '', 'application/vnd.google-apps.document'])('%s ⇒ ignoré', (t) => {
    expect(entreeSynchroDrive(t)).toBeNull();
  });
  it('type listé mais octets d’autre nature (SVG déguisé en PNG) ⇒ ignoré', () => {
    expect(entreeSynchroDrive('image/png', txt(SVG_SCRIPT))).toBeNull();
  });
});
