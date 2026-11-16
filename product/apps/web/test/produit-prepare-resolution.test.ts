import { describe, it, expect } from 'vitest';
import {
  COTES_MESURES, COTE_PHOTO_MAX, DATA_URI_CHROMIUM_TEXTUREE_1280, DATA_URI_PHOTO_MAX, MESURE_DATA_URI, MESURE_ETIQUETTE, TOLERANCE_MESURE, etapesCompression,
} from '@tiktrends/core';
import { FUTS_PAR_LIGNE, PHOTOS_SYNTHETIQUES, genererPhoto, mesurerCote, type MesureCote } from './produit-prepare-mesure-outils';

/**
 * Mesure REPRODUCTIBLE de ce que la compression coûte à l'étiquette du
 * produit · rejoue les trois photos synthétiques (graine fixe, aucun fichier,
 * aucun réseau) à chaque côté mesuré, et compare au tableau ÉCRIT dans le
 * module (`import-photo.ts` · `MESURE_ETIQUETTE`, `MESURE_DATA_URI`). Puis
 * vérifie que le seuil retenu (`COTE_PHOTO_MAX`) découle de cette mesure,
 * pas d'une valeur posée de tête. 0 $.
 */

const mesures = new Map<string, MesureCote>();
async function mesure(cle: string, cote: number): Promise<MesureCote> {
  const k = `${cle}|${cote}`;
  if (!mesures.has(k)) {
    const p = PHOTOS_SYNTHETIQUES.find((x) => x.cle === cle)!;
    const brut = genererPhoto(p);
    for (const c of COTES_MESURES) mesures.set(`${cle}|${c}`, await mesurerCote(p, brut, c));
  }
  return mesures.get(k)!;
}

describe('résolution · le tableau du module est celui que la mesure rejoue', () => {
  it(`hauteur de capitale réelle (± ${TOLERANCE_MESURE.px} px) et fûts séparés (± ${TOLERANCE_MESURE.futs}), pour chaque ligne et chaque côté`, async () => {
    for (const l of MESURE_ETIQUETTE) {
      for (const c of COTES_MESURES) {
        const m = (await mesure(l.source, c)).lignes.find((x) => x.nom === l.ligne)!;
        const [px, futs] = l.parCote[c]!;
        const ici = `${l.source} · ${l.ligne} · ${c} px · mesuré ${m.capitalePx} px ${m.futsSepares}/12, écrit ${px} px ${futs}/12`;
        expect(m.capitaleSource, ici).toBe(l.capitaleSource);
        expect(Math.abs(m.capitalePx - px), ici).toBeLessThanOrEqual(TOLERANCE_MESURE.px);
        expect(Math.abs(m.futsSepares - futs), ici).toBeLessThanOrEqual(TOLERANCE_MESURE.futs);
      }
    }
  }, 120_000);

  it(`longueur de la data URI JPEG 0,85 à ± ${TOLERANCE_MESURE.dataUri * 100} % du tableau`, async () => {
    for (const [cle, parCote] of Object.entries(MESURE_DATA_URI)) {
      for (const c of COTES_MESURES) {
        const n = (await mesure(cle, c)).dataUri;
        expect(Math.abs(n - parCote[c]!) / parCote[c]!, `${cle} · ${c} px · mesuré ${n}, écrit ${parCote[c]}`).toBeLessThanOrEqual(TOLERANCE_MESURE.dataUri);
      }
    }
  }, 120_000);
});

describe('résolution · le seuil retenu découle de la mesure', () => {
  const mentions = MESURE_ETIQUETTE.find((l) => l.source === 'telephone' && l.ligne.startsWith('mentions'))!;

  it('l’ancien côté (1280) rendait illisibles les mentions d’une photo de téléphone · le défaut réparé', () => {
    expect(mentions.parCote[1280]![1]).toBeLessThan(FUTS_PAR_LIGNE);
  });

  it(`${COTE_PHOTO_MAX} px · le plus petit côté mesuré où ces mentions gardent tous leurs fûts`, () => {
    const lisible = COTES_MESURES.filter((c) => mentions.parCote[c]![1] === FUTS_PAR_LIGNE);
    expect(Math.min(...lisible)).toBe(COTE_PHOTO_MAX);
  });

  it('à ce côté, la photo de téléphone tient sous la borne · 74 % mesuré avec sharp, ≈ 82 % rapporté à Chromium (18 % de marge) · et c’est le premier essai de l’échelle', () => {
    expect(MESURE_DATA_URI.telephone[COTE_PHOTO_MAX]! / DATA_URI_PHOTO_MAX).toBeLessThan(0.75);
    const chromium = MESURE_DATA_URI.telephone[COTE_PHOTO_MAX]! * (DATA_URI_CHROMIUM_TEXTUREE_1280 / MESURE_DATA_URI.telephone[1280]!);
    expect(Math.round((chromium / DATA_URI_PHOTO_MAX) * 100)).toBe(82);
    expect(etapesCompression('image/jpeg')[0]).toEqual({ cote: COTE_PHOTO_MAX, format: 'image/jpeg', qualite: 0.85 });
    // Le côté au-dessus n'apporte rien sur cette ligne et sort le packshot de la borne.
    expect(mentions.parCote[2048]![0]).toBe(mentions.parCote[COTE_PHOTO_MAX]![0]);
    expect(MESURE_DATA_URI.packshot[2048]!).toBeGreaterThan(DATA_URI_PHOTO_MAX);
  });

  it('la borne de transport ne bouge pas · une photo plus lourde retombe d’elle-même sur un côté plus petit', () => {
    expect(DATA_URI_PHOTO_MAX).toBe(900_000);
    expect(etapesCompression('image/jpeg').map((e) => e.cote)).toEqual([1920, 1600, 1280, 1280, 1024]);
  });
});
