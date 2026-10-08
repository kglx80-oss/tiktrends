import { describe, it, expect } from 'vitest';
import {
  masqueDepuisPolygone, masqueDepuisTrait, zoneAutorisee, alphaAvecFondu, distanceAuSupport, composerParMasque,
  controlerHorsZone, encodageAutorise, validerMasqueBrut, unirMasques, type PixelsBruts, type MasqueBrut,
} from '../src/studios/rendu/masque';
import { traceEcranVersSource, documentVersEcran, type Vue } from '../src/studios/rendu/geometrie';

/** Générateur pseudo-aléatoire déterministe. */
function alea(graine: number) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function image(l: number, h: number, c: number, graine: number): PixelsBruts {
  const r = alea(graine);
  const d = new Uint8Array(l * h * c);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(r() * 256);
  return { largeur: l, hauteur: h, canaux: c, donnees: d };
}

/** Distance au support par force brute · indépendante de la transformée du module. */
function zoneBruteForce(m: MasqueBrut, f: number): Uint8Array {
  const sup: Array<[number, number]> = [];
  for (let y = 0; y < m.hauteur; y++) for (let x = 0; x < m.largeur; x++) if (m.donnees[y * m.largeur + x]! > 0) sup.push([x, y]);
  const z = new Uint8Array(m.largeur * m.hauteur);
  for (let y = 0; y < m.hauteur; y++) for (let x = 0; x < m.largeur; x++) {
    z[y * m.largeur + x] = sup.some(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 <= f * f) ? 1 : 0;
  }
  return z;
}

// Calque image : source 200 × 120 posée en 400 × 240 à (100, 50) · le masque vit en pixels SOURCE.
const CALQUE = { x: 100, y: 50, width: 400, height: 240, rotationDeg: 0, sourceWidth: 200, sourceHeight: 120 };
// « Zone gauche » voulue, en pixels du document : x 120 → 240, y 90 → 250 (source : x 10 → 70, y 20 → 100).
const ZONE_DOC = [{ x: 120, y: 90 }, { x: 240, y: 90 }, { x: 240, y: 250 }, { x: 120, y: 250 }];
const VUES: Vue[] = [
  { zoom: 0.25, panX: 0, panY: 0 }, { zoom: 0.5, panX: 37.5, panY: -12 }, { zoom: 1, panX: -300, panY: 80 },
  { zoom: 2, panX: 11, panY: 7 }, { zoom: 3.7, panX: -812.3, panY: 444.9 }, { zoom: 1 / 3, panX: 0.1, panY: 0.2 },
];

describe('IMG-06 · masque strict, zone gauche, plusieurs zooms et déplacements', () => {
  const masques = VUES.map((v) => {
    const ecran = ZONE_DOC.map((p) => documentVersEcran(p, v));
    return masqueDepuisPolygone(200, 120, traceEcranVersSource(ecran, v, CALQUE));
  });

  it('le masque est à la résolution SOURCE et identique octet pour octet à chaque zoom', () => {
    for (const m of masques) {
      expect([m.largeur, m.hauteur]).toEqual([200, 120]);
      expect(Buffer.from(m.donnees).equals(Buffer.from(masques[0]!.donnees))).toBe(true);
    }
    const n = masques[0]!.donnees.reduce((s, v) => s + (v === 255 ? 1 : 0), 0);
    expect(n).toBe(60 * 80);
    // Coin attendu : pixel source (10, 20) dedans, (9, 20) et (70, 20) dehors.
    expect(masques[0]!.donnees[20 * 200 + 10]).toBe(255);
    expect(masques[0]!.donnees[20 * 200 + 9]).toBe(0);
    expect(masques[0]!.donnees[20 * 200 + 70]).toBe(0);
  });

  it('génération qui touche TOUTE l’image + étoile à gauche : zéro pixel modifié hors zone + fondu, l’étoile est là', () => {
    const feather = 6;
    const original = image(200, 120, 4, 7);
    // Le fournisseur rend une image entière : bruit partout (il ne respecte rien) + une étoile dans la zone.
    const generation: PixelsBruts = { ...original, donnees: new Uint8Array(original.donnees) };
    const r = alea(99);
    for (let i = 0; i < generation.donnees.length; i++) generation.donnees[i] = (generation.donnees[i]! + 1 + Math.floor(r() * 50)) & 255;
    for (let y = 50; y < 70; y++) for (let x = 30; x < 50; x++) generation.donnees.set([255, 215, 0, 255], (y * 200 + x) * 4);

    // Contrôle indépendant de la formule : zone par force brute (les masques sont identiques, prouvé ci-dessus).
    const zone = zoneBruteForce(masques[0]!, feather);
    for (const m of masques) {
      const res = composerParMasque(original, generation, alphaAvecFondu(m, feather));
      let horsZone = 0;
      for (let p = 0; p < 200 * 120; p++) {
        if (zone[p]) continue;
        for (let k = 0; k < 4; k++) if (res.donnees[p * 4 + k] !== original.donnees[p * 4 + k]) { horsZone++; break; }
      }
      expect(horsZone, 'pixels modifiés hors zone + fondu').toBe(0);
      const c = controlerHorsZone(original, res, zoneAutorisee(m, feather));
      expect(c).toMatchObject({ pixelsHorsZone: 0, conforme: true });
      expect(c.pixelsModifies).toBeGreaterThan(4800);
      expect(encodageAutorise(c)).toBe(true);
      // L'étoile, au cœur de la zone, est rendue telle que générée.
      expect([...res.donnees.subarray((60 * 200 + 40) * 4, (60 * 200 + 40) * 4 + 4)]).toEqual([255, 215, 0, 255]);
    }
  });

  it('le contrôle compte UN pixel qui fuit hors zone, et l’encodage avec perte est alors interdit', () => {
    const m = masques[0]!;
    const original = image(200, 120, 3, 3);
    const res = composerParMasque(original, image(200, 120, 3, 4), alphaAvecFondu(m, 4));
    res.donnees[(110 * 200 + 190) * 3] = (res.donnees[(110 * 200 + 190) * 3]! + 1) & 255;
    const c = controlerHorsZone(original, res, zoneAutorisee(m, 4));
    expect(c).toMatchObject({ pixelsHorsZone: 1, conforme: false, premierHorsZone: { x: 190, y: 110 } });
    expect(encodageAutorise(c)).toBe(false);
    expect(encodageAutorise(null)).toBe(false);
  });

  it('alpha > 0 seulement dans la zone autorisée ; a = 0 rend l’original, a = 255 la génération', () => {
    const m = masques[0]!;
    const a = alphaAvecFondu(m, 9);
    const z = zoneAutorisee(m, 9);
    for (let i = 0; i < a.length; i++) if (a[i]! > 0) expect(z[i], `pixel ${i}`).toBe(1);
    const o = image(4, 1, 1, 1);
    const g = image(4, 1, 1, 2);
    const r = composerParMasque(o, g, Uint8Array.from([0, 255, 128, 0]));
    expect(r.donnees[0]).toBe(o.donnees[0]);
    expect(r.donnees[1]).toBe(g.donnees[1]);
    expect(r.donnees[3]).toBe(o.donnees[3]);
  });
});

describe('masque canonique · validation, sélections, distance', () => {
  it('dimensions différentes de la source refusées, fondu borné', () => {
    const m = masqueDepuisPolygone(10, 10, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]);
    expect(validerMasqueBrut(m, { largeur: 10, hauteur: 10 }, 4)).toEqual([]);
    expect(validerMasqueBrut(m, { largeur: 11, hauteur: 10 }, 4).join()).toMatch(/dimensions de la source/);
    expect(validerMasqueBrut(m, { largeur: 10, hauteur: 10 }, 513).join()).toMatch(/fondu/);
    expect(() => composerParMasque(image(10, 10, 3, 1), image(11, 10, 3, 1), m.donnees)).toThrow(/dimensions/);
  });

  it('la transformée de distance est exacte (comparée à la force brute)', () => {
    const r = alea(5);
    for (let essai = 0; essai < 5; essai++) {
      const m = masqueDepuisTrait(37, 23, [{ x: r() * 37, y: r() * 23 }, { x: r() * 37, y: r() * 23 }], 1 + r() * 3);
      const d2 = distanceAuSupport(m);
      for (const f of [0, 1, 3, 7]) {
        const brut = zoneBruteForce(m, f);
        const z = zoneAutorisee(m, f);
        expect(Buffer.from(z).equals(Buffer.from(brut)), `essai ${essai} fondu ${f}`).toBe(true);
      }
      expect(d2.some((v) => v === 0)).toBe(true);
    }
  });

  it('pinceau et union', () => {
    const a = masqueDepuisTrait(20, 20, [{ x: 2, y: 2 }, { x: 18, y: 2 }], 1.5);
    const b = masqueDepuisTrait(20, 20, [{ x: 10, y: 10 }], 2);
    const u = unirMasques(a, b);
    expect(u.donnees[2 * 20 + 10]).toBe(255);
    expect(u.donnees[10 * 20 + 10]).toBe(255);
    expect(u.donnees[19 * 20 + 19]).toBe(0);
  });
});
