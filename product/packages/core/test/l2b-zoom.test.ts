import { describe, it, expect } from 'vitest';
import {
  ajustementLePlusSerre, bornesZoom, deplacementVersDocument, dispositionZone, facteurMolette, libelleZoom,
  palierVoisin, raccourciZoom, vueZone, zoomAjuste, zoomAjusteBrut, zoomerAutour,
  MARGE_ZONE_EDITEUR, PALIERS_ZOOM_EDITEUR, ZONES_MESUREES, ZOOM_MAX_EDITEUR, ZOOM_MIN_EDITEUR, PAS_MOLETTE_MAX,
} from '../src/studios/calques/zoom';
import { FORMATS_DOCUMENT, type FormatDocument } from '../src/studios/calques/formats';
import { ajouterTexte, transformerCalque, INTERLIGNE_TEXTE, TEXTE_MIN_PX } from '../src/studios/calques/operations';
import { historiqueInitial } from '../src/studios/calques/historique';
import { documentVersEcran, ecranVersDocument } from '../src/studios/rendu/geometrie';
import { CIBLE_TACTILE_MIN } from '../src/cible-tactile';
import { jsonCanonique } from '../src/studios/version';
import { documentStudio } from './studios-fixtures';

/**
 * Lot 2b · zoom de l'éditeur de calques, noyau pur. On lit des VALEURS : le
 * point du document resté sous le pointeur, le déplacement en pixels du
 * document obtenu d'un geste à l'écran, les bornes recalculées depuis le
 * tableau mesuré.
 */

const DOC = { width: 1080, height: 1350 };
const ZONE = { largeur: 497, hauteur: 516 };
const formats = Object.keys(FORMATS_DOCUMENT) as FormatDocument[];

/** Générateur pseudo-aléatoire déterministe (mulberry32) · la suite est rejouable. */
function alea(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('bornes · dérivées du tableau mesuré, jamais posées de tête', () => {
  it('l’ajustement de chaque format, sur chaque zone mesurée, est celui de l’en-tête (lu à l’écran : 36 %, 33 %, 29 % en 4:5)', () => {
    const t = ZONES_MESUREES.map(({ fenetre, zone }) => [fenetre, ...formats.map((f) => Math.round(zoomAjusteBrut(FORMATS_DOCUMENT[f], zone) * 1000) / 1000)]);
    expect(t).toEqual([
      ['1440 × 720', 0.431, 0.359, 0.252],
      ['1280 × 720', 0.334, 0.334, 0.252],
      ['390 × 720', 0.286, 0.286, 0.207],
    ]);
    expect(formats).toEqual(['1:1', '4:5', '9:16']);
  });

  it('ZOOM_MIN = palier ≤ moitié de l’ajustement le plus serré ; « Ajuster » n’est jamais rogné sur une zone mesurée', () => {
    expect(Math.round(ajustementLePlusSerre() * 1000) / 1000).toBe(0.207);
    expect(ZOOM_MIN_EDITEUR).toBe(0.1);
    expect(ZOOM_MIN_EDITEUR).toBeLessThanOrEqual(ajustementLePlusSerre() / 2);
    for (const { zone } of ZONES_MESUREES) {
      for (const f of formats) expect(zoomAjuste(FORMATS_DOCUMENT[f], zone)).toBeCloseTo(zoomAjusteBrut(FORMATS_DOCUMENT[f], zone), 12);
    }
  });

  it('ZOOM_MAX = premier palier où la ligne du plus petit texte posé atteint la cible tactile', () => {
    const ligne = TEXTE_MIN_PX * INTERLIGNE_TEXTE;
    expect(ZOOM_MAX_EDITEUR).toBe(4);
    expect(ligne * ZOOM_MAX_EDITEUR).toBeGreaterThanOrEqual(CIBLE_TACTILE_MIN);
    const precedent = PALIERS_ZOOM_EDITEUR[PALIERS_ZOOM_EDITEUR.indexOf(ZOOM_MAX_EDITEUR) - 1]!;
    expect(ligne * precedent).toBeLessThan(CIBLE_TACTILE_MIN);
    // Le plus petit texte que l'éditeur pose de lui-même (document étroit) est bien de 12 px, interligne 1,2.
    const etroit = { width: 100, height: 100, colorSpace: 'sRGB' as const, layers: {}, fonts: {} };
    const r = ajouterTexte(etroit);
    if (!r.ok) throw new Error(r.message);
    const t = Object.values(r.document.layers)[0]!;
    expect(t.kind === 'text' && [t.fontSizePx, t.lineHeight]).toEqual([TEXTE_MIN_PX, INTERLIGNE_TEXTE]);
  });

  it('un document hors format s’ajuste quand même · la borne basse descend à SON ajustement', () => {
    const geant = { width: 16_384, height: 16_384 };
    const b = bornesZoom(geant, ZONE);
    expect(b.min).toBeLessThan(ZOOM_MIN_EDITEUR);
    expect(zoomAjuste(geant, ZONE)).toBeCloseTo((ZONE.largeur - 2 * MARGE_ZONE_EDITEUR) / 16_384, 12);
    // Un tout petit document ne dépasse pas le maximum.
    expect(zoomAjuste({ width: 10, height: 10 }, ZONE)).toBe(ZOOM_MAX_EDITEUR);
  });
});

describe('paliers et libellé', () => {
  it('+ et − passent au palier STRICTEMENT voisin, bornés', () => {
    const b = bornesZoom(DOC, ZONE);
    expect(palierVoisin(0.359, 1, b)).toBe(0.5);
    expect(palierVoisin(0.359, -1, b)).toBe(0.33);
    expect(palierVoisin(1, 1, b)).toBe(1.25);
    expect(palierVoisin(1, -1, b)).toBe(0.75);
    expect(palierVoisin(4, 1, b)).toBe(4);
    expect(palierVoisin(0.1, -1, b)).toBe(0.1);
    expect(libelleZoom(0.359)).toBe('36 %');
    expect(libelleZoom(1)).toBe('100 %');
  });
});

describe('zoom à POINT FIXE · le point du document sous le pointeur ne bouge pas', () => {
  it('molette autour d’un point, sur 2 000 tirages (zoom, défilement, point, facteur) sans bord de contenu atteint', () => {
    const r = alea(20261011);
    let essais = 0;
    for (let i = 0; i < 2000; i++) {
      const zoom = 0.5 + r() * 3;
      const zone = { largeur: 300 + Math.round(r() * 600), hauteur: 300 + Math.round(r() * 400) };
      const disp = dispositionZone(DOC, zone, zoom);
      const defilement = { x: r() * (disp.contenu.largeur - zone.largeur), y: r() * (disp.contenu.hauteur - zone.hauteur) };
      const point = { x: r() * zone.largeur, y: r() * zone.hauteur };
      const nouveauZoom = Math.min(ZOOM_MAX_EDITEUR, zoom * (0.6 + r() * 0.8));
      const v0 = vueZone(DOC, zone, zoom, defilement);
      const sous = ecranVersDocument(point, v0);
      const e = zoomerAutour({ doc: DOC, zone, zoom, defilement, nouveauZoom, point });
      const d1 = dispositionZone(DOC, zone, e.zoom);
      const brut = { x: d1.origine.x + sous.x * e.zoom - point.x, y: d1.origine.y + sous.y * e.zoom - point.y };
      // On ne juge que les tirages où le défilement voulu reste dans le contenu (sinon le bord gagne, c'est dit).
      if (brut.x < 0 || brut.y < 0 || brut.x > d1.contenu.largeur - zone.largeur || brut.y > d1.contenu.hauteur - zone.hauteur) continue;
      essais++;
      const apres = documentVersEcran(sous, vueZone(DOC, zone, e.zoom, e.defilement));
      expect(apres.x).toBeCloseTo(point.x, 9);
      expect(apres.y).toBeCloseTo(point.y, 9);
    }
    expect(essais).toBeGreaterThan(500);
  });

  it('cas lu sur le banc · 36 % → 50 % → 67 % au centre de la zone de 497 × 516 : le centre garde le même point du document', () => {
    const z0 = zoomAjuste(DOC, ZONE);
    const centre = { x: ZONE.largeur / 2, y: ZONE.hauteur / 2 };
    const sous = ecranVersDocument(centre, vueZone(DOC, ZONE, z0, { x: 0, y: 0 }));
    // Deux clics sur « + » (36 % → 50 % → 67 %), comme sur le banc.
    const e1 = zoomerAutour({ doc: DOC, zone: ZONE, zoom: z0, defilement: { x: 0, y: 0 }, nouveauZoom: palierVoisin(z0, 1, bornesZoom(DOC, ZONE)), point: centre });
    const e = zoomerAutour({ doc: DOC, zone: ZONE, zoom: e1.zoom, defilement: e1.defilement, nouveauZoom: palierVoisin(e1.zoom, 1, bornesZoom(DOC, ZONE)), point: centre });
    expect([e1.zoom, e.zoom]).toEqual([0.5, 0.67]);
    const apres = ecranVersDocument(centre, vueZone(DOC, ZONE, e.zoom, e.defilement));
    expect(apres.x).toBeCloseTo(sous.x, 9);
    expect(apres.y).toBeCloseTo(sous.y, 9);
    // Défilement relevé à l'écran sur le banc : 130 × 211 (le navigateur garde des entiers à chaque étape).
    expect(Math.abs(e.defilement.x - 130)).toBeLessThan(1.5);
    expect(Math.abs(e.defilement.y - 211)).toBeLessThan(1.5);
  });

  it('un document qui tient dans la zone s’y recentre (le bord gagne) et le zoom reste borné', () => {
    const e = zoomerAutour({ doc: DOC, zone: ZONE, zoom: 0.359, defilement: { x: 0, y: 0 }, nouveauZoom: 0.01, point: { x: 10, y: 10 } });
    expect(e.zoom).toBe(ZOOM_MIN_EDITEUR);
    expect(e.defilement).toEqual({ x: 0, y: 0 });
    const d = dispositionZone(DOC, ZONE, e.zoom);
    expect(d.origine.x).toBeCloseTo((ZONE.largeur - 108) / 2, 9);
    expect(zoomerAutour({ doc: DOC, zone: ZONE, zoom: 1, defilement: { x: 0, y: 0 }, nouveauZoom: 50, point: { x: 0, y: 0 } }).zoom).toBe(ZOOM_MAX_EDITEUR);
  });
});

describe('écran → document · un glisser déplace le calque de (écran / zoom) px du document, à TOUT zoom', () => {
  it('100 px d’écran = 100 / zoom px du document, pour chaque palier · relevé banc : +100 à 100 %, +133 à 75 %', () => {
    for (const z of PALIERS_ZOOM_EDITEUR) {
      const d = deplacementVersDocument(100, -40, 1080 * z, 1080);
      expect(d.x).toBeCloseTo(100 / z, 9);
      expect(d.y).toBeCloseTo(-40 / z, 9);
    }
    expect(Math.round(108 + deplacementVersDocument(100, 0, 1080, 1080).x)).toBe(208);
    expect(Math.round(108 + deplacementVersDocument(100, 0, 810, 1080).x)).toBe(241);
    // Cadre pas encore mesuré (0) · jamais une division par zéro ni un saut de mille pixels.
    expect(deplacementVersDocument(10, 10, 0, 1080)).toEqual({ x: 10, y: 10 });
  });

  it('le glisser converti donne au calque la même position que le point du document lu par la vue', () => {
    const r = alea(7);
    for (let i = 0; i < 200; i++) {
      const zoom = PALIERS_ZOOM_EDITEUR[Math.floor(r() * PALIERS_ZOOM_EDITEUR.length)]!;
      const v = vueZone(DOC, ZONE, zoom, { x: r() * 500, y: r() * 500 });
      const a = { x: r() * 400, y: r() * 400 };
      const b = { x: a.x + (r() - 0.5) * 300, y: a.y + (r() - 0.5) * 300 };
      const d = deplacementVersDocument(b.x - a.x, b.y - a.y, DOC.width * zoom, DOC.width);
      const pa = ecranVersDocument(a, v);
      const pb = ecranVersDocument(b, v);
      expect(d.x).toBeCloseTo(pb.x - pa.x, 9);
      expect(d.y).toBeCloseTo(pb.y - pa.y, 9);
    }
  });
});

describe('le zoom est un état d’AFFICHAGE · il ne touche ni le document ni l’historique', () => {
  it('zoomer, ajuster, convertir : document et historique identiques, octet pour octet', () => {
    const doc = documentStudio();
    const h = historiqueInitial(doc);
    const avant = jsonCanonique(h);
    zoomerAutour({ doc, zone: ZONE, zoom: 0.359, defilement: { x: 0, y: 0 }, nouveauZoom: 2, point: { x: 100, y: 100 } });
    zoomAjuste(doc, ZONE);
    deplacementVersDocument(50, 50, 400, doc.width);
    expect(jsonCanonique(h)).toBe(avant);
    // Seul le geste « déplacer » écrit · et il reçoit des pixels du document, pas de l'écran.
    const r = transformerCalque(doc, 'l_titre', { x: 60 + deplacementVersDocument(100, 0, 1080 * 0.5, 1080).x });
    expect(r.ok && r.document.layers.l_titre!.x).toBe(260);
  });
});

describe('molette et raccourcis', () => {
  it('un cran (100 px, 3 lignes) fait ×1,2 ; un pincement (petits deltas) zoome en continu ; jamais au-delà d’un palier par événement', () => {
    expect(facteurMolette(-100)).toBeCloseTo(1.2, 9);
    expect(facteurMolette(100)).toBeCloseTo(1 / 1.2, 9);
    expect(facteurMolette(-3, 1)).toBeCloseTo(1.2, 9);
    expect(facteurMolette(-4)).toBeGreaterThan(1);
    expect(facteurMolette(-4)).toBeLessThan(1.01);
    expect(facteurMolette(-5000)).toBe(PAS_MOLETTE_MAX);
    expect(facteurMolette(0)).toBe(1);
    expect(facteurMolette(Number.NaN)).toBe(1);
  });

  it('Ctrl/⌘ + − 0 · jamais pendant une saisie, jamais avec Alt, jamais sans modificateur', () => {
    const k = (key: string, o: Partial<{ code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; dansChamp: boolean }> = {}) =>
      raccourciZoom({ key, code: o.code, ctrlKey: o.ctrlKey ?? true, metaKey: o.metaKey ?? false, altKey: o.altKey ?? false, dansChamp: o.dansChamp ?? false });
    expect([k('+'), k('='), k('-'), k('0')]).toEqual(['plus', 'plus', 'moins', 'ajuster']);
    expect(k('à', { code: 'Digit0' })).toBe('ajuster'); // AZERTY
    expect(k('+', { code: 'NumpadAdd' })).toBe('plus');
    expect(k('-', { ctrlKey: false, metaKey: true })).toBe('moins');
    expect(k('-', { dansChamp: true })).toBeNull();
    expect(k('0', { dansChamp: true })).toBeNull();
    expect(k('+', { altKey: true })).toBeNull();
    expect(k('+', { ctrlKey: false })).toBeNull();
    expect(k('z')).toBeNull();
  });
});
