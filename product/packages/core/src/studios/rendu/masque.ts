/**
 * Studios · L5-A · masque canonique et composition stricte (cahier 01 §7, §11.1 ;
 * recette IMG-06).
 *
 * Pur. Travaille sur des pixels DÉCODÉS (tableaux d'octets), jamais sur une
 * empreinte ni sur un fichier encodé.
 *
 * ── Le masque canonique ──────────────────────────────────────────────────────
 *
 *   grayscale8, un octet par pixel, MÊMES dimensions que la source ;
 *   255 = modifier, 0 = préserver, valeurs intermédiaires = mélange ;
 *   `featherPx` = largeur de la BANDE DE FONDU autorisée autour du support
 *   (pixels non nuls), distance euclidienne exacte.
 *
 * ── La composition, et le contrôle qui ne lui fait pas confiance ─────────────
 *
 *   résultat = masque × génération + (1 − masque) × original      (par canal)
 *
 * en entiers : `(a·g + (255 − a)·o + 127) / 255` tronqué. a = 0 rend EXACTEMENT
 * l'original, a = 255 exactement la génération.
 *
 * Le contrôle (`controlerHorsZone`) ne relit ni le masque ni la formule : il
 * compare le résultat à l'original pixel par pixel et compte ceux qui ont bougé
 * HORS de la zone autorisée (support + bande de fondu), calculée à part. Il
 * doit valoir ZÉRO avant tout encodage avec perte (`encodageAutorise`) : un
 * JPEG ou un WebP déplacerait sinon des pixels partout et la preuve serait
 * perdue.
 */

import type { Point2 } from './geometrie';

export interface MasqueBrut {
  format: 'grayscale8';
  largeur: number;
  hauteur: number;
  donnees: Uint8Array;
}

export interface DimensionsPixels { largeur: number; hauteur: number }

export const FONDU_MAX_PX = 512;

export function masqueVide(largeur: number, hauteur: number): MasqueBrut {
  return { format: 'grayscale8', largeur, hauteur, donnees: new Uint8Array(largeur * hauteur) };
}

/** Raisons de refus · liste vide = masque utilisable pour cette source. */
export function validerMasqueBrut(m: MasqueBrut, source: DimensionsPixels, featherPx: number): string[] {
  const r: string[] = [];
  if (m.format !== 'grayscale8') r.push('masque grayscale8 attendu');
  if (m.largeur !== source.largeur || m.hauteur !== source.hauteur) {
    r.push(`le masque (${m.largeur}×${m.hauteur}) doit avoir les dimensions de la source (${source.largeur}×${source.hauteur})`);
  }
  if (m.donnees.length !== m.largeur * m.hauteur) r.push('taille des données du masque incohérente (un octet par pixel)');
  if (!(Number.isInteger(featherPx) && featherPx >= 0 && featherPx <= FONDU_MAX_PX)) r.push(`fondu entier entre 0 et ${FONDU_MAX_PX} pixels`);
  return r;
}

/* ───────────────────────────── Sélections ─────────────────────────────── */

function dansPolygone(x: number, y: number, pts: readonly Point2[]): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Rectangle ou lasso (polygone, règle pair-impair) en pixels SOURCE → masque.
 * Un pixel est dans la sélection si son CENTRE y est : un bord à 10 ou à
 * 9,9999999 (erreur d'arrondi d'un zoom) sélectionne les mêmes pixels.
 */
export function masqueDepuisPolygone(largeur: number, hauteur: number, pts: readonly Point2[], valeur = 255): MasqueBrut {
  const m = masqueVide(largeur, hauteur);
  if (pts.length < 3) return m;
  const ys = pts.map((p) => p.y);
  const xs = pts.map((p) => p.x);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(hauteur - 1, Math.ceil(Math.max(...ys)));
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(largeur - 1, Math.ceil(Math.max(...xs)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (dansPolygone(x + 0.5, y + 0.5, pts)) m.donnees[y * largeur + x] = valeur;
  }
  return m;
}

/** Pinceau · trait de rayon donné (capsules entre points successifs), en pixels source. */
export function masqueDepuisTrait(largeur: number, hauteur: number, pts: readonly Point2[], rayon: number, valeur = 255): MasqueBrut {
  const m = masqueVide(largeur, hauteur);
  if (pts.length === 0 || !(rayon > 0)) return m;
  const r2 = rayon * rayon;
  const segs = pts.length === 1 ? [[pts[0]!, pts[0]!] as const] : pts.slice(1).map((p, i) => [pts[i]!, p] as const);
  for (const [a, b] of segs) {
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - rayon));
    const x1 = Math.min(largeur - 1, Math.ceil(Math.max(a.x, b.x) + rayon));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - rayon));
    const y1 = Math.min(hauteur - 1, Math.ceil(Math.max(a.y, b.y) + rayon));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
        const ex = px - (a.x + t * dx);
        const ey = py - (a.y + t * dy);
        if (ex * ex + ey * ey <= r2) m.donnees[y * largeur + x] = valeur;
      }
    }
  }
  return m;
}

/** Union (maximum pixel à pixel) · mêmes dimensions exigées. */
export function unirMasques(a: MasqueBrut, b: MasqueBrut): MasqueBrut {
  if (a.largeur !== b.largeur || a.hauteur !== b.hauteur) throw new Error('masques de dimensions différentes');
  const m = masqueVide(a.largeur, a.hauteur);
  for (let i = 0; i < m.donnees.length; i++) m.donnees[i] = Math.max(a.donnees[i]!, b.donnees[i]!);
  return m;
}

/* ─────────────────────── Distance et bande de fondu ───────────────────── */

const INF = 1e20;

/** Transformée de distance 1D exacte (Felzenszwalb & Huttenlocher), carré des distances. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    d[q] = dq * dq + f[v[k]!]!;
  }
}

/** Carré de la distance euclidienne de chaque pixel au pixel non nul le plus proche. */
export function distanceAuSupport(m: Pick<MasqueBrut, 'largeur' | 'hauteur' | 'donnees'>): Float64Array {
  const { largeur: w, hauteur: h } = m;
  const out = new Float64Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = m.donnees[i]! > 0 ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x]!;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x]!;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x]!;
  }
  return out;
}

/**
 * Zone AUTORISÉE à changer : support du masque (pixels non nuls) plus la bande
 * de fondu (distance ≤ `featherPx`). 1 = autorisé, 0 = doit rester identique.
 */
export function zoneAutorisee(m: MasqueBrut, featherPx: number): Uint8Array {
  const z = new Uint8Array(m.largeur * m.hauteur);
  if (featherPx === 0) {
    for (let i = 0; i < z.length; i++) z[i] = m.donnees[i]! > 0 ? 1 : 0;
    return z;
  }
  const d2 = distanceAuSupport(m);
  const f2 = featherPx * featherPx;
  for (let i = 0; i < z.length; i++) z[i] = d2[i]! <= f2 ? 1 : 0;
  return z;
}

/**
 * Alpha effectif de la composition : le masque, plus une rampe linéaire dans
 * la bande de fondu (255 au bord du support, > 0 jusqu'à `featherPx`, 0 au-delà).
 * Par construction, alpha > 0 seulement dans `zoneAutorisee`.
 */
export function alphaAvecFondu(m: MasqueBrut, featherPx: number): Uint8Array {
  const a = new Uint8Array(m.donnees);
  if (featherPx === 0) return a;
  const d2 = distanceAuSupport(m);
  const f2 = featherPx * featherPx;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! > 0 || d2[i]! > f2) continue;
    a[i] = Math.max(1, Math.round((255 * (featherPx + 1 - Math.sqrt(d2[i]!))) / (featherPx + 1)));
  }
  return a;
}

/* ───────────────────────── Composition et contrôle ────────────────────── */

export interface PixelsBruts {
  largeur: number;
  hauteur: number;
  /** 1 (gris), 3 (RVB) ou 4 (RVBA) octets par pixel, entrelacés. */
  canaux: number;
  donnees: Uint8Array;
}

function memeForme(a: PixelsBruts, b: PixelsBruts): string | null {
  if (a.largeur !== b.largeur || a.hauteur !== b.hauteur) return `dimensions différentes (${a.largeur}×${a.hauteur} et ${b.largeur}×${b.hauteur})`;
  if (a.canaux !== b.canaux) return `canaux différents (${a.canaux} et ${b.canaux})`;
  if (a.donnees.length !== a.largeur * a.hauteur * a.canaux || b.donnees.length !== b.largeur * b.hauteur * b.canaux) return 'taille des pixels incohérente';
  return null;
}

/** résultat = alpha × génération + (1 − alpha) × original, en entiers. */
export function composerParMasque(original: PixelsBruts, generation: PixelsBruts, alpha: Uint8Array): PixelsBruts {
  const refus = memeForme(original, generation);
  if (refus) throw new Error(`composition refusée · ${refus}`);
  if (alpha.length !== original.largeur * original.hauteur) throw new Error('composition refusée · masque aux dimensions de la source attendu');
  const c = original.canaux;
  const out = new Uint8Array(original.donnees.length);
  const o = original.donnees;
  const g = generation.donnees;
  for (let p = 0; p < alpha.length; p++) {
    const a = alpha[p]!;
    const base = p * c;
    if (a === 0) { for (let k = 0; k < c; k++) out[base + k] = o[base + k]!; continue; }
    if (a === 255) { for (let k = 0; k < c; k++) out[base + k] = g[base + k]!; continue; }
    for (let k = 0; k < c; k++) out[base + k] = ((a * g[base + k]! + (255 - a) * o[base + k]! + 127) / 255) | 0;
  }
  return { ...original, donnees: out };
}

export interface ControleMasque {
  /** Pixels modifiés hors de la zone autorisée · DOIT valoir 0. */
  pixelsHorsZone: number;
  pixelsModifies: number;
  pixelsZone: number;
  pixelsTotal: number;
  premierHorsZone: { x: number; y: number } | null;
  conforme: boolean;
}

/**
 * Compte, sur pixels décodés, ce qui a bougé hors de la zone autorisée.
 * Indépendant de la composition : seuls l'original, le résultat et la zone.
 */
export function controlerHorsZone(original: PixelsBruts, resultat: PixelsBruts, zone: Uint8Array): ControleMasque {
  const refus = memeForme(original, resultat);
  if (refus) throw new Error(`contrôle impossible · ${refus}`);
  if (zone.length !== original.largeur * original.hauteur) throw new Error('contrôle impossible · zone aux dimensions de la source attendue');
  const c = original.canaux;
  let horsZone = 0;
  let modifies = 0;
  let dansZone = 0;
  let premier: { x: number; y: number } | null = null;
  for (let p = 0; p < zone.length; p++) {
    if (zone[p]) dansZone++;
    let change = false;
    for (let k = 0; k < c; k++) if (original.donnees[p * c + k] !== resultat.donnees[p * c + k]) { change = true; break; }
    if (!change) continue;
    modifies++;
    if (!zone[p]) {
      horsZone++;
      premier ??= { x: p % original.largeur, y: Math.floor(p / original.largeur) };
    }
  }
  return { pixelsHorsZone: horsZone, pixelsModifies: modifies, pixelsZone: dansZone, pixelsTotal: zone.length, premierHorsZone: premier, conforme: horsZone === 0 };
}

/** Un encodage AVEC PERTE n'est permis qu'après un contrôle conforme. */
export function encodageAutorise(c: ControleMasque | null | undefined): boolean {
  return !!c && c.conforme && c.pixelsHorsZone === 0;
}
