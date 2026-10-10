import { describe, it, expect } from 'vitest';
import {
  placerParFraction, rectPixels, ordreEmpilement, boiteEnglobante, etirementPx, ecranVersDocument, documentVersEcran,
  documentVersSource, hauteurProportionnelle,
} from '../src/studios/rendu/geometrie';
import { pub11 } from './l5a-fixtures';

describe('IMG-05 · « produit à 55 % de la largeur » ⇒ dimension exacte au pixel', () => {
  it('largeur = round(0,55 × L), hauteur proportionnelle à la source à moins d’un demi-pixel, pour plusieurs documents', () => {
    const produit = pub11().layers.produit as Extract<ReturnType<typeof pub11>['layers'][string], { kind: 'image' }>;
    const mesures = [1080, 1350, 1000, 777, 1920, 2160].map((L) => {
      const r = placerParFraction({ width: L, height: L }, produit, 0.55);
      return { L, largeur: r.width, attendue: Math.round(0.55 * L), ecartHauteur: Math.abs(r.height - (r.width * 1200) / 800), entiers: [r.x, r.y, r.width, r.height].every(Number.isInteger) };
    });
    for (const m of mesures) {
      expect(m.largeur, `document ${m.L}`).toBe(m.attendue);
      expect(m.ecartHauteur, `document ${m.L}`).toBeLessThanOrEqual(0.5);
      expect(m.entiers, `document ${m.L}`).toBe(true);
    }
    // 1080 → 594 × 891 : la valeur de la recette.
    expect(placerParFraction({ width: 1080, height: 1080 }, produit, 0.55)).toMatchObject({ width: 594, height: 891 });
  });

  it('la même demande donne toujours les mêmes pixels, et le centre est conservé', () => {
    const p = pub11().layers.produit as never;
    const a = placerParFraction({ width: 1080, height: 1080 }, p, 0.55);
    const b = placerParFraction({ width: 1080, height: 1080 }, p, 0.55);
    expect(a).toEqual(b);
    expect(Math.abs(a.x + a.width / 2 - (330 + 210))).toBeLessThanOrEqual(0.5);
  });

  it('ancrage en bas · le bord bas reste où il était', () => {
    const r = placerParFraction({ width: 1080, height: 1080 }, pub11().layers.produit as never, 0.3, 'bas');
    expect(r.y + r.height).toBe(260 + 630);
  });
});

describe('géométrie · grille, empilement, rotation', () => {
  it('les bords sont accrochés, pas la taille · deux calques bord à bord le restent', () => {
    const a = rectPixels({ x: 10.4, y: 0, width: 20.4, height: 5 });
    const b = rectPixels({ x: 30.8, y: 0, width: 5, height: 5 });
    expect(a.x + a.width).toBe(b.x);
  });

  it('ordre d’empilement par z, calques masqués exclus', () => {
    const d = pub11();
    d.layers.titre!.z = -5;
    d.layers.logo!.visible = false;
    expect(ordreEmpilement(d).map((l) => l.id)).toEqual(['titre', 'fond', 'produit', 'cta']);
  });

  it('boîte englobante d’un calque tourné de 90° autour de son centre', () => {
    expect(boiteEnglobante({ x: 0, y: 0, width: 100, height: 40, rotationDeg: 90 })).toEqual({ x: 30, y: -30, width: 40, height: 100 });
  });

  it('étirement mesuré en pixels', () => {
    expect(etirementPx({ width: 400, height: 600, sourceWidth: 800, sourceHeight: 1200 })).toBe(0);
    expect(etirementPx({ width: 400, height: 640, sourceWidth: 800, sourceHeight: 1200 })).toBe(40);
    expect(hauteurProportionnelle(333, 800, 1200)).toBe(500);
  });

  it('écran ↔ document ↔ source, quel que soit le zoom', () => {
    const calque = { x: 100, y: 50, width: 400, height: 240, rotationDeg: 0, sourceWidth: 200, sourceHeight: 120 };
    for (const v of [{ zoom: 0.25, panX: 13, panY: -7 }, { zoom: 3.7, panX: -812.5, panY: 44 }]) {
      const e = documentVersEcran({ x: 300, y: 170 }, v);
      const d = ecranVersDocument(e, v);
      expect(d.x).toBeCloseTo(300, 9);
      const s = documentVersSource(d, calque);
      expect(s.x).toBeCloseTo(100, 9);
      expect(s.y).toBeCloseTo(60, 9);
    }
  });
});
