import { describe, expect, it } from 'vitest';
import {
  MESSAGES_REFUS_LOGO_RELU, MESSAGES_RELECTURE_DEPOT, POIDS_MAX_LOGO, TEXTES_REFUS_JETON_DEPOT,
  decisionLogoDeposeRelu, jetonDepotPour, type JetonDepot, type LectureLogoDepose,
} from '../src';
import { concat, boite } from './l3-fixtures-media';

/**
 * Un logo importé est une IMAGE · on lit la DÉCISION rendue (acceptée avec le
 * type relu, ou refusée avec son message et « à retirer »), sur de vrais
 * octets, jamais la présence d'un appel.
 */
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
const txt = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
const te = new TextEncoder();
const ftyp = (majeure: string, ...compat: string[]) => boite('ftyp', te.encode(majeure), new Uint8Array(4), ...compat.map((c) => te.encode(c)));

const PNG = b64('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=');
const JPEG = b64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAEAAYDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAwf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAFWX/9k=');
const WEBP = concat(te.encode('RIFF'), new Uint8Array([0x24, 0, 0, 0]), te.encode('WEBPVP8 '), new Uint8Array(28));
const GIF = concat(te.encode('GIF89a'), new Uint8Array(32));
const MP4 = concat(ftyp('isom', 'isom', 'iso2', 'avc1', 'mp41'), boite('free'), boite('mdat', new Uint8Array(64)));
const HTML = txt('<!doctype html><html><body><script>fetch("/api/vol?c="+document.cookie)</script></body></html>');
const SVG = txt('﻿  <svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = txt('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
const INCONNU = new Uint8Array(64).fill(7);

const jeton = (type: string, taille: number, j: Partial<JetonDepot> = {}): JetonDepot =>
  ({ ...jetonDepotPour({ espace: 'ws-a', cle: 'assets/ws-a/1-ab-logo.png', type, taille, maintenant: 0 }), ...j });
const lu = (octets: Uint8Array, taille = octets.length): LectureLogoDepose => ({ ok: true, octets, taille });
const decider = (j: JetonDepot | null | 'illisible', l: LectureLogoDepose) => decisionLogoDeposeRelu({ jeton: j, lecture: l });

describe('decisionLogoDeposeRelu · une image png, jpeg ou webp, du type et de la taille signés', () => {
  it('PNG, JPEG, WebP conformes au jeton · acceptés avec le type RELU', () => {
    expect(decider(jeton('image/png', PNG.length), lu(PNG))).toEqual({ ok: true, type: 'image/png', taille: PNG.length });
    expect(decider(jeton('image/jpeg', JPEG.length), lu(JPEG))).toEqual({ ok: true, type: 'image/jpeg', taille: JPEG.length });
    expect(decider(jeton('image/webp', WEBP.length), lu(WEBP))).toEqual({ ok: true, type: 'image/webp', taille: WEBP.length });
  });

  it('exactement 4 Mo · accepté ; un octet de plus · refusé et à retirer (taille RELUE)', () => {
    expect(decider(jeton('image/png', POIDS_MAX_LOGO), lu(PNG, POIDS_MAX_LOGO))).toEqual({ ok: true, type: 'image/png', taille: POIDS_MAX_LOGO });
    expect(decider(jeton('image/png', POIDS_MAX_LOGO + 1), lu(PNG, POIDS_MAX_LOGO + 1))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.lourd, retirer: true });
  });
});

describe('decisionLogoDeposeRelu · le contenu relu tranche, jamais le type annoncé', () => {
  it('PDF, MP4, GIF, octets inconnus déclarés image/png · refusés, à retirer', () => {
    for (const [nom, octets] of [['pdf', PDF], ['mp4', MP4], ['gif', GIF], ['inconnu', INCONNU]] as const) {
      expect(decider(jeton('image/png', octets.length), lu(octets)), nom).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.contenu, retirer: true });
    }
  });

  it('HTML, SVG (BOM et espaces) déclarés image · refusés comme balisage, à retirer', () => {
    expect(decider(jeton('image/png', HTML.length), lu(HTML))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.balisage, retirer: true });
    expect(decider(jeton('image/webp', SVG.length), lu(SVG))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.balisage, retirer: true });
  });

  it('objet vide · refusé, à retirer', () => {
    expect(decider(jeton('image/png', 1), lu(new Uint8Array(0), 0))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.vide, retirer: true });
  });
});

describe('decisionLogoDeposeRelu · l’objet relu face au jeton', () => {
  it('type relu différent du type signé · refusé, à retirer (PNG préparé en JPEG, image préparée en vidéo ou en neutre)', () => {
    for (const type of ['image/jpeg', 'image/webp', 'video/mp4', 'application/octet-stream']) {
      expect(decider(jeton(type, PNG.length), lu(PNG)), type).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.type_different, retirer: true });
    }
  });

  it('taille relue différente de la taille signée · refusée, à retirer', () => {
    expect(decider(jeton('image/png', PNG.length + 1), lu(PNG))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.taille_differente, retirer: true });
    expect(decider(jeton('image/png', 2048), lu(PNG, 2047))).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO_RELU.taille_differente, retirer: true });
  });

  it('lecture impossible · refusée, RIEN à retirer (l’envoi peut se relancer)', () => {
    for (const raison of ['absent', 'illisible', 'hors_espace'] as const) {
      expect(decider(jeton('image/png', PNG.length), { ok: false, raison }), raison).toEqual({ ok: false, erreur: MESSAGES_RELECTURE_DEPOT[raison], retirer: false });
    }
  });

  it('sans jeton lisible · refusée, rien à retirer (rien n’est prouvé)', () => {
    expect(decider(null, lu(PNG))).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.absent, retirer: false });
    expect(decider('illisible', lu(PNG))).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.illisible, retirer: false });
  });

  it('messages · en français, sans tiret cadratin', () => {
    for (const m of Object.values(MESSAGES_REFUS_LOGO_RELU)) expect(m).not.toMatch(/—/);
  });
});
