/**
 * Studios · L5-A · géométrie du rendu (cahier 01 §7 « schéma géométrique »).
 *
 * Pur. Coordonnées en pixels du document SOURCE, origine en haut à gauche,
 * angle en degrés (sens horaire à l'écran, l'axe Y descendant), ordre
 * d'empilement EXPLICITE (`z`). Le zoom et le déplacement de l'écran (`Vue`)
 * n'appartiennent pas au document : ils se convertissent ici, et un masque
 * dessiné à n'importe quel zoom tombe sur les mêmes pixels source.
 *
 * ── Accrochage à la grille ───────────────────────────────────────────────────
 *
 * Le document accepte des positions fractionnaires (une transformation reste
 * réversible). Le rendu accroche les BORDS, pas la taille : `x0 = round(x)`,
 * `x1 = round(x + width)`. Deux calques bord à bord restent bord à bord, et une
 * dimension entière posée sur une position entière est rendue telle quelle.
 */

import type { CalqueBase, CalqueImage, DocumentStudio, CalqueStudio } from '../document';

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point2 { x: number; y: number }

/** Rectangle entier d'un calque (bords accrochés), largeur et hauteur ≥ 1. */
export function rectPixels(c: Pick<CalqueBase, 'x' | 'y' | 'width' | 'height'>): Rect {
  const x0 = Math.round(c.x);
  const y0 = Math.round(c.y);
  return { x: x0, y: y0, width: Math.max(1, Math.round(c.x + c.width) - x0), height: Math.max(1, Math.round(c.y + c.height) - y0) };
}

/** Calques visibles, du fond vers le dessus (`z` croissant, l'identifiant départage). */
export function ordreEmpilement(doc: Pick<DocumentStudio, 'layers'>): CalqueStudio[] {
  return Object.values(doc.layers)
    .filter((l) => l.visible)
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const RAD = Math.PI / 180;

/** Rotation d'un point autour d'un centre, angle en degrés (sens horaire à l'écran). */
export function tourner(p: Point2, centre: Point2, deg: number): Point2 {
  const a = deg * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
}

/** Coins d'un calque dans le document, rotation comprise (autour de son centre). */
export function coinsCalque(c: Pick<CalqueBase, 'x' | 'y' | 'width' | 'height' | 'rotationDeg'>): Point2[] {
  const centre = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  return [
    { x: c.x, y: c.y }, { x: c.x + c.width, y: c.y },
    { x: c.x + c.width, y: c.y + c.height }, { x: c.x, y: c.y + c.height },
  ].map((p) => tourner(p, centre, c.rotationDeg));
}

/** Boîte englobante (entière, bords accrochés) d'un calque tourné. */
export function boiteEnglobante(c: Pick<CalqueBase, 'x' | 'y' | 'width' | 'height' | 'rotationDeg'>): Rect {
  const pts = coinsCalque(c);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs) + 1e-9);
  const y0 = Math.floor(Math.min(...ys) + 1e-9);
  return { x: x0, y: y0, width: Math.max(1, Math.ceil(Math.max(...xs) - 1e-9) - x0), height: Math.max(1, Math.ceil(Math.max(...ys) - 1e-9) - y0) };
}

export function intersection(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

export function contient(ext: Rect, int: Rect): boolean {
  return int.x >= ext.x && int.y >= ext.y && int.x + int.width <= ext.x + ext.width && int.y + int.height <= ext.y + ext.height;
}

/* ─────────────────────── Proportions et fraction ──────────────────────── */

/**
 * Hauteur qui conserve les proportions de la source pour une largeur donnée,
 * arrondie au pixel. Écart d'étirement mesuré par `etirementPx`.
 */
export function hauteurProportionnelle(largeur: number, sourceWidth: number, sourceHeight: number): number {
  return Math.max(1, Math.round((largeur * sourceHeight) / sourceWidth));
}

/**
 * Étirement d'un calque image, en pixels : écart entre la hauteur posée et la
 * hauteur proportionnelle à la largeur posée. 0 ou moins d'un pixel d'arrondi =
 * non étiré.
 */
export function etirementPx(c: Pick<CalqueImage, 'width' | 'height' | 'sourceWidth' | 'sourceHeight'>): number {
  return Math.abs(c.height - (c.width * c.sourceHeight) / c.sourceWidth);
}

export type Ancrage = 'centre' | 'haut' | 'bas' | 'gauche' | 'droite';

/**
 * « Le produit à 55 % de la largeur du document » · largeur ENTIÈRE =
 * `round(fraction × largeur du document)`, hauteur proportionnelle à la source,
 * position entière centrée sur le centre actuel du calque (ou ancrée). Une
 * même demande donne toujours les mêmes pixels (IMG-05).
 */
export function placerParFraction(
  doc: Pick<DocumentStudio, 'width' | 'height'>,
  c: Pick<CalqueImage, 'x' | 'y' | 'width' | 'height' | 'sourceWidth' | 'sourceHeight'>,
  fraction: number,
  ancrage: Ancrage = 'centre',
): { x: number; y: number; width: number; height: number } {
  if (!(Number.isFinite(fraction) && fraction > 0 && fraction <= 4)) throw new Error('fraction de largeur entre 0 et 4 attendue');
  const width = Math.max(1, Math.round(fraction * doc.width));
  const height = hauteurProportionnelle(width, c.sourceWidth, c.sourceHeight);
  const cx = c.x + c.width / 2;
  const cy = c.y + c.height / 2;
  let x = Math.round(cx - width / 2);
  let y = Math.round(cy - height / 2);
  if (ancrage === 'haut') y = Math.round(c.y);
  if (ancrage === 'bas') y = Math.round(c.y + c.height) - height;
  if (ancrage === 'gauche') x = Math.round(c.x);
  if (ancrage === 'droite') x = Math.round(c.x + c.width) - width;
  return { x, y, width, height };
}

/* ─────────────────────────── Écran ↔ document ─────────────────────────── */

/** Vue de l'éditeur · écran = document × zoom + déplacement. Jamais stockée dans le document. */
export interface Vue { zoom: number; panX: number; panY: number }

export function ecranVersDocument(p: Point2, v: Vue): Point2 {
  if (!(v.zoom > 0 && Number.isFinite(v.zoom))) throw new Error('zoom strictement positif attendu');
  return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
}

export function documentVersEcran(p: Point2, v: Vue): Point2 {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

/**
 * Point du document → pixel de la SOURCE d'un calque image (rotation et mise à
 * l'échelle inversées). Le masque canonique vit dans cet espace : mêmes
 * dimensions que la source, quel que soit le zoom de l'écran ou la taille posée.
 */
export function documentVersSource(p: Point2, c: Pick<CalqueImage, 'x' | 'y' | 'width' | 'height' | 'rotationDeg' | 'sourceWidth' | 'sourceHeight'>): Point2 {
  const centre = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  const q = tourner(p, centre, -c.rotationDeg);
  return { x: ((q.x - c.x) * c.sourceWidth) / c.width, y: ((q.y - c.y) * c.sourceHeight) / c.height };
}

/** Tracé à l'écran (sous une vue) → tracé en pixels source du calque. */
export function traceEcranVersSource(points: readonly Point2[], v: Vue, c: Parameters<typeof documentVersSource>[1]): Point2[] {
  return points.map((p) => documentVersSource(ecranVersDocument(p, v), c));
}
