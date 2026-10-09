import 'server-only';
import sharp from 'sharp';
import {
  planRendu, type DocumentStudio, type OperationRendu, type ViolationStudio, type PlanRendu,
} from '@tiktrends/core';
import { cheminGlyphe } from './police-ttf';
import { policeRendu } from './polices';

/**
 * Studios · L5-A · compositeur déterministe d'un `DocumentStudio` en PNG.
 *
 * Exécute le plan PUR du noyau (`planRendu`) : géométrie entière, ordre
 * d'empilement, mise en page du texte. `sharp` ne sert qu'à décoder, à
 * redimensionner une image à la taille posée, à tourner un calque et à
 * pixelliser les contours de glyphes ; l'assemblage (« source-over ») est fait
 * ici, en entiers, pour que les pixels d'un calque opaque soient COPIÉS tels
 * quels (Produit fidèle, IMG-02).
 *
 * Aucune dépense, aucun appel externe : les médias arrivent déjà lus (octets),
 * par l'appelant qui a vérifié leur portée (`medias.ts`).
 */

export interface ImageRvba { largeur: number; hauteur: number; donnees: Uint8Array }

export type ResultatRendu =
  | { ok: true; png: Buffer; pixels: ImageRvba; avertissements: string[]; plan: Extract<PlanRendu, { ok: true }> }
  | { ok: false; code: 'INVALID_SCHEMA' | 'MISSING_REFERENCE' | 'UNSUPPORTED_CAPABILITY'; violations: ViolationStudio[] };

/** Source-over en entiers, non prémultiplié. sa = 255 ⇒ copie exacte ; sa = 0 ⇒ rien. */
export function poserCalque(fond: ImageRvba, calque: ImageRvba, gauche: number, haut: number): void {
  const x0 = Math.max(0, gauche);
  const y0 = Math.max(0, haut);
  const x1 = Math.min(fond.largeur, gauche + calque.largeur);
  const y1 = Math.min(fond.hauteur, haut + calque.hauteur);
  const f = fond.donnees;
  const c = calque.donnees;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * fond.largeur + x) * 4;
      const j = ((y - haut) * calque.largeur + (x - gauche)) * 4;
      const sa = c[j + 3]!;
      if (sa === 0) continue;
      if (sa === 255) { f[i] = c[j]!; f[i + 1] = c[j + 1]!; f[i + 2] = c[j + 2]!; f[i + 3] = 255; continue; }
      const da = f[i + 3]!;
      const daEff = (da * (255 - sa)) / 255;
      const oa = sa + daEff;
      for (let k = 0; k < 3; k++) f[i + k] = Math.round((c[j + k]! * sa + f[i + k]! * daEff) / oa);
      f[i + 3] = Math.round(oa);
    }
  }
}

function appliquerOpacite(img: ImageRvba, opacite: number): void {
  if (opacite >= 1) return;
  for (let i = 3; i < img.donnees.length; i += 4) img.donnees[i] = Math.round(img.donnees[i]! * opacite);
}

function couleur(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

async function brut(s: sharp.Sharp): Promise<ImageRvba> {
  const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Forme pleine · ellipse par couverture 4 × 4 sous-pixels (anti-crénelage déterministe). */
function forme(op: Extract<OperationRendu, { kind: 'shape' }>): ImageRvba {
  const { width: w, height: h } = op.rect;
  const d = new Uint8Array(w * h * 4);
  const [r, g, b] = couleur(op.fill);
  // L8-C · mêmes nombres flottants, calculés une fois par colonne et par ligne
  // au lieu de seize fois par pixel, et plus de tableau alloué par pixel :
  // 17 % du temps de rendu d'un document de 1000 calques (profil mesuré).
  // Pixels identiques au bit près (`l8c-rendu-identique.test.ts`).
  let carresX: Float64Array | null = null;
  let carresY: Float64Array | null = null;
  if (op.forme === 'ellipse') {
    carresX = new Float64Array(w * 4);
    for (let x = 0; x < w; x++) for (let sx = 0; sx < 4; sx++) { const px = (x + (sx + 0.5) / 4) / w - 0.5; carresX[x * 4 + sx] = px * px; }
    carresY = new Float64Array(h * 4);
    for (let y = 0; y < h; y++) for (let sy = 0; sy < 4; sy++) { const py = (y + (sy + 0.5) / 4) / h - 0.5; carresY[y * 4 + sy] = py * py; }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 255;
      if (carresX && carresY) {
        let n = 0;
        for (let sy = 0; sy < 4; sy++) {
          const py2 = carresY[y * 4 + sy]!;
          for (let sx = 0; sx < 4; sx++) if (carresX[x * 4 + sx]! + py2 <= 0.25) n++;
        }
        a = Math.round((n * 255) / 16);
      }
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  return { largeur: w, hauteur: h, donnees: d };
}

/** SVG des glyphes placés par le noyau · un chemin par calque, couleur pleine. */
export function svgTexte(op: Extract<OperationRendu, { kind: 'text' }>): string {
  const police = policeRendu(op.fichier);
  const mep = op.miseEnPage;
  let d = '';
  for (const l of mep.lignes) {
    for (const g of l.glyphes) {
      const id = g.couvert ? police.glyphe(g.codePoint) : 0;
      d += cheminGlyphe(police.contours(id), g.x, l.ligneDeBase, mep.echelle);
    }
  }
  const { width: w, height: h } = op.rect;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path fill="${op.color}" d="${d}"/></svg>`;
}

async function rasterTexte(op: Extract<OperationRendu, { kind: 'text' }>): Promise<ImageRvba> {
  return brut(sharp(Buffer.from(svgTexte(op)), { density: 72 }).resize(op.rect.width, op.rect.height, { fit: 'fill' }));
}

/** Image source redimensionnée à la taille posée · sans resampling si la taille est celle de la source. */
async function rasterImage(octets: Uint8Array, w: number, h: number, attendue?: { largeur: number; hauteur: number }): Promise<ImageRvba | string> {
  let meta: sharp.Metadata;
  try { meta = await sharp(octets).metadata(); } catch { return 'média illisible'; }
  if (!meta.width || !meta.height) return 'média sans dimensions';
  if (attendue && (meta.width !== attendue.largeur || meta.height !== attendue.hauteur)) {
    return `dimensions du média (${meta.width}×${meta.height}) différentes de la source déclarée (${attendue.largeur}×${attendue.hauteur})`;
  }
  const s = sharp(octets);
  if (meta.width === w && meta.height === h) return brut(s);
  return brut(s.resize(w, h, { fit: 'fill', kernel: 'lanczos3' }));
}

async function tourner(img: ImageRvba, deg: number): Promise<ImageRvba> {
  return brut(sharp(Buffer.from(img.donnees), { raw: { width: img.largeur, height: img.hauteur, channels: 4 } })
    .rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }));
}

export async function encoderPng(img: ImageRvba): Promise<Buffer> {
  return sharp(Buffer.from(img.donnees), { raw: { width: img.largeur, height: img.hauteur, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

/**
 * Rend le document. `medias` : octets ENCODÉS par identifiant de média, déjà
 * vérifiés dans la portée par l'appelant. Un média manquant ou incohérent est
 * un refus (`MISSING_REFERENCE`), jamais un trou silencieux.
 */
export async function rendreDocument(doc: DocumentStudio, medias: ReadonlyMap<string, Uint8Array>): Promise<ResultatRendu> {
  const plan = planRendu(doc);
  if (!plan.ok) {
    const police = plan.violations.some((v) => v.chemin.endsWith('/fontId'));
    return { ok: false, code: police ? 'UNSUPPORTED_CAPABILITY' : 'INVALID_SCHEMA', violations: plan.violations };
  }
  const manquants = plan.assets.filter((a) => !medias.has(a));
  if (manquants.length) return { ok: false, code: 'MISSING_REFERENCE', violations: manquants.map((a) => ({ chemin: `/document/layers?assetId=${a}`, raison: 'média absent ou hors de portée' })) };

  const toile: ImageRvba = { largeur: plan.largeur, hauteur: plan.hauteur, donnees: new Uint8Array(plan.largeur * plan.hauteur * 4) };
  for (const op of plan.operations) {
    let calque: ImageRvba;
    if (op.kind === 'image' || op.kind === 'logo') {
      const r = await rasterImage(medias.get(op.assetId)!, op.rect.width, op.rect.height, op.kind === 'image' ? { largeur: op.sourceWidth, hauteur: op.sourceHeight } : undefined);
      if (typeof r === 'string') return { ok: false, code: 'MISSING_REFERENCE', violations: [{ chemin: `/document/layers/${op.id}`, raison: r }] };
      calque = r;
    } else if (op.kind === 'shape') calque = forme(op);
    else calque = await rasterTexte(op);
    appliquerOpacite(calque, op.opacity);
    let gauche = op.rect.x;
    let haut = op.rect.y;
    if (op.rotationDeg % 360 !== 0) {
      const t = await tourner(calque, op.rotationDeg);
      gauche = Math.round(op.rect.x + op.rect.width / 2 - t.largeur / 2);
      haut = Math.round(op.rect.y + op.rect.height / 2 - t.hauteur / 2);
      calque = t;
    }
    poserCalque(toile, calque, gauche, haut);
  }
  return { ok: true, png: await encoderPng(toile), pixels: toile, avertissements: plan.avertissements, plan };
}
