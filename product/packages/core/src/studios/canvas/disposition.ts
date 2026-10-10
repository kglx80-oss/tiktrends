/**
 * Studios · disposition du canvas (cahier 01 §127, UX-04).
 *
 * Pur. Une disposition est une DONNÉE SÉPARÉE du projet : des positions
 * {x, y} par carte, propres à une personne et à un projet. Elle ne contient
 * que les cartes DÉPLACÉES · une carte absente reste à sa place automatique.
 * La déplacer ne change ni l'ordre des cartes, ni les liens, ni l'empreinte de
 * la version : `composerCanvas` reprend l'ordre et les liens du modèle tels
 * quels, seules les coordonnées changent.
 *
 * Disposition automatique · grille de colonnes (étapes) et de rangées. Les
 * liens sont routés à angle droit dans les GOUTTIÈRES (entre colonnes) et les
 * COULOIRS (entre rangées), où aucune carte ne se trouve : un lien de la
 * disposition automatique ne traverse jamais une carte (test de
 * non-intersection, `l8d-canvas-noyau`). Après un déplacement à la main, le
 * lien suit la carte au plus court ; « Réinitialiser la disposition » rend le
 * routage garanti.
 */

import type { ModeleCanvas } from './modele';

export interface PointCanvas { x: number; y: number }
export interface RectCanvas { x: number; y: number; w: number; h: number }

/** Taille d'une carte et espacements de la grille, en unités du monde (px à zoom 1). */
export const CARTE_CANVAS = { largeur: 216, hauteur: 92 } as const;
export const GOUTTIERE_CANVAS = 80;
export const COULOIR_CANVAS = 36;

/** Plafond de positions stockées · 200 plans parlants (UX-06) ≈ 4 × 200 + 10 cartes, avec marge. */
export const POSITIONS_CANVAS_MAX = 2000;
/** Coordonnées bornées · au-delà, la carte serait hors de toute vue raisonnable. */
export const COORDONNEE_CANVAS_MAX = 1_000_000;

export interface DispositionCanvas {
  /** Positions des cartes déplacées à la main · coin haut gauche, unités du monde. */
  positions: Record<string, PointCanvas>;
}

export const dispositionVide = (): DispositionCanvas => ({ positions: {} });

/* ─────────────────────────── Grille ──────────────────────────────────────── */

const pasX = CARTE_CANVAS.largeur + GOUTTIERE_CANVAS;
const pasY = CARTE_CANVAS.hauteur + COULOIR_CANVAS;

/** Position automatique d'une carte (coin haut gauche). */
export function positionAuto(m: ModeleCanvas, id: string): PointCanvas | null {
  const g = m.grille[id];
  return g ? { x: g.colonne * pasX, y: g.rangee * pasY } : null;
}

/* ─────────────────────────── Validation ──────────────────────────────────── */

const ID_CARTE = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,199}$/;
const INTERDITS = new Set(['__proto__', 'constructor', 'prototype']);

export type ResultatDispositionCanvas = { ok: true; disposition: DispositionCanvas } | { ok: false; raison: string };

/** Lit une disposition venue du client ou de la base · refuse tout ce qui n'est pas {id: {x, y}} fini et borné. */
export function validerDispositionCanvas(x: unknown): ResultatDispositionCanvas {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return { ok: false, raison: 'disposition attendue' };
  const p = (x as { positions?: unknown }).positions;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return { ok: false, raison: 'positions indexées par carte attendues' };
  const entrees = Object.entries(p);
  if (entrees.length > POSITIONS_CANVAS_MAX) return { ok: false, raison: `${POSITIONS_CANVAS_MAX} positions au plus` };
  const positions: Record<string, PointCanvas> = {};
  for (const [id, v] of entrees) {
    if (!ID_CARTE.test(id) || INTERDITS.has(id)) return { ok: false, raison: 'identifiant de carte illisible' };
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, raison: 'position {x, y} attendue' };
    const { x: px, y: py, ...reste } = v as Record<string, unknown>;
    if (Object.keys(reste).length > 0) return { ok: false, raison: 'position {x, y} sans autre champ' };
    if (typeof px !== 'number' || typeof py !== 'number' || !Number.isFinite(px) || !Number.isFinite(py)) return { ok: false, raison: 'position finie attendue' };
    if (Math.abs(px) > COORDONNEE_CANVAS_MAX || Math.abs(py) > COORDONNEE_CANVAS_MAX) return { ok: false, raison: 'position hors bornes' };
    positions[id] = { x: Math.round(px), y: Math.round(py) };
  }
  return { ok: true, disposition: { positions } };
}

/* ─────────────────────────── Gestes sur la disposition ───────────────────── */

/** Position effective d'une carte · la sienne si déplacée, sinon l'automatique. */
export function positionCarte(m: ModeleCanvas, d: DispositionCanvas, id: string): PointCanvas | null {
  const auto = positionAuto(m, id);
  if (!auto) return null;
  return Object.prototype.hasOwnProperty.call(d.positions, id) ? d.positions[id]! : auto;
}

/**
 * Déplace une carte · renvoie une NOUVELLE disposition. Ne touche que la
 * position de cette carte : ni l'ordre, ni les liens, ni le modèle.
 */
export function deplacerCarte(m: ModeleCanvas, d: DispositionCanvas, id: string, dx: number, dy: number): DispositionCanvas {
  const p = positionCarte(m, d, id);
  if (!p || !Number.isFinite(dx) || !Number.isFinite(dy)) return d;
  const borne = (v: number) => Math.max(-COORDONNEE_CANVAS_MAX, Math.min(COORDONNEE_CANVAS_MAX, Math.round(v)));
  return { positions: { ...d.positions, [id]: { x: borne(p.x + dx), y: borne(p.y + dy) } } };
}

/** Réinitialiser · on oublie toutes les positions, la grille automatique reprend. */
export function reinitialiserDisposition(): DispositionCanvas {
  return dispositionVide();
}

/** Positions utiles · on ne garde que les cartes du modèle (une carte disparue n'a plus de place). */
export function dispositionPourModele(m: ModeleCanvas, d: DispositionCanvas): DispositionCanvas {
  const positions: Record<string, PointCanvas> = {};
  for (const [id, p] of Object.entries(d.positions)) if (m.grille[id]) positions[id] = p;
  return { positions };
}

/* ─────────────────────────── Composition et routage ──────────────────────── */

export interface CartePlacee { id: string; x: number; y: number; w: number; h: number; deplacee: boolean }

export interface RouteCanvas {
  de: string;
  vers: string;
  /** Polyligne, unités du monde. */
  points: PointCanvas[];
  /** `true` si une extrémité a été déplacée à la main · le routage garanti ne s'applique plus. */
  libre: boolean;
}

export interface CanvasCompose {
  /** Même ordre que `modele.cartes` · jamais réordonné par une position. */
  cartes: CartePlacee[];
  liens: ModeleCanvas['liens'];
  routes: RouteCanvas[];
  bornes: RectCanvas;
  empreinte: string;
}

/** Décalage déterministe dans une gouttière ou un couloir · sépare les troncs voisins. */
const decale = (n: number, demi: number, pas: number) => {
  const crans = Math.max(1, Math.floor(demi / pas));
  return ((n % crans) + 1) * pas;
};

function routeAuto(m: ModeleCanvas, de: string, vers: string): PointCanvas[] {
  const a = m.grille[de]!;
  const b = m.grille[vers]!;
  const W = CARTE_CANVAS.largeur;
  const H = CARTE_CANVAS.hauteur;
  const xs = a.colonne * pasX + W;
  const ys = a.rangee * pasY + H / 2;
  const xt = b.colonne * pasX;
  const yt = b.rangee * pasY + H / 2;
  // Tronc de la source dans la moitié gauche de sa gouttière, tronc de la cible dans la moitié droite.
  const gxS = xs + decale(a.rangee, GOUTTIERE_CANVAS / 2 - 6, 8);
  if (b.colonne === a.colonne + 1) {
    return [{ x: xs, y: ys }, { x: gxS, y: ys }, { x: gxS, y: yt }, { x: xt, y: yt }];
  }
  const gxT = xt - decale(b.rangee + a.colonne, GOUTTIERE_CANVAS / 2 - 6, 8);
  // Couloir juste au-dessus de la rangée cible · aucune carte n'y est.
  const yc = b.rangee * pasY - COULOIR_CANVAS / 2 + (decale(a.colonne + a.rangee, COULOIR_CANVAS / 2 - 4, 4) - COULOIR_CANVAS / 4);
  return [{ x: xs, y: ys }, { x: gxS, y: ys }, { x: gxS, y: yc }, { x: gxT, y: yc }, { x: gxT, y: yt }, { x: xt, y: yt }];
}

function routeLibre(s: CartePlacee, t: CartePlacee): PointCanvas[] {
  const xs = s.x + s.w;
  const ys = s.y + s.h / 2;
  const xt = t.x;
  const yt = t.y + t.h / 2;
  const mx = xt > xs ? (xs + xt) / 2 : xs + GOUTTIERE_CANVAS / 2;
  return [{ x: xs, y: ys }, { x: mx, y: ys }, { x: mx, y: yt }, { x: xt, y: yt }];
}

/**
 * Le canvas affiché · cartes placées (dans l'ordre du modèle), liens routés,
 * bornes. Le modèle n'est pas modifié ; l'empreinte reste celle du modèle.
 */
export function composerCanvas(m: ModeleCanvas, d: DispositionCanvas): CanvasCompose {
  const utile = dispositionPourModele(m, d);
  const cartes: CartePlacee[] = m.cartes.map((c) => {
    const p = positionCarte(m, utile, c.id)!;
    return { id: c.id, x: p.x, y: p.y, w: CARTE_CANVAS.largeur, h: CARTE_CANVAS.hauteur, deplacee: Object.prototype.hasOwnProperty.call(utile.positions, c.id) };
  });
  const parId = new Map(cartes.map((c) => [c.id, c]));
  const routes: RouteCanvas[] = m.liens.map((l) => {
    const s = parId.get(l.de)!;
    const t = parId.get(l.vers)!;
    const libre = s.deplacee || t.deplacee;
    return { de: l.de, vers: l.vers, points: libre ? routeLibre(s, t) : routeAuto(m, l.de, l.vers), libre };
  });
  return { cartes, liens: m.liens, routes, bornes: bornesCanvas(cartes), empreinte: m.empreinte };
}

export function bornesCanvas(cartes: readonly RectCanvas[]): RectCanvas {
  if (cartes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const c of cartes) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ─────────────────────────── Mesure ──────────────────────────────────────── */

/**
 * Un segment (horizontal ou vertical) entre-t-il dans l'INTÉRIEUR d'un
 * rectangle ? Toucher un bord (l'arrivée d'un lien sur sa carte) ne compte pas.
 */
export function segmentTraverse(a: PointCanvas, b: PointCanvas, r: RectCanvas, eps = 0.5): boolean {
  const x0 = r.x + eps; const x1 = r.x + r.w - eps; const y0 = r.y + eps; const y1 = r.y + r.h - eps;
  // Échantillonnage exact pour un segment axe-aligné, général sinon (Liang-Barsky).
  let t0 = 0; let t1 = 1;
  const dx = b.x - a.x; const dy = b.y - a.y;
  const bords: Array<[number, number]> = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of bords) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-9;
}

/** Les traversées d'une composition · `[]` attendu pour la disposition automatique. */
export function traverseesCanvas(c: CanvasCompose, o: { zonesInterdites?: Array<{ nom: string; rect: RectCanvas }> } = {}): Array<{ lien: string; traverse: string }> {
  const out: Array<{ lien: string; traverse: string }> = [];
  const zones = [...c.cartes.map((x) => ({ nom: x.id, rect: x as RectCanvas })), ...(o.zonesInterdites ?? [])];
  for (const r of c.routes) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      for (const z of zones) {
        if (segmentTraverse(r.points[i]!, r.points[i + 1]!, z.rect)) out.push({ lien: `${r.de} → ${r.vers}`, traverse: z.nom });
      }
    }
  }
  return out;
}
