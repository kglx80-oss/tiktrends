/**
 * Studios · vue du canvas · ajuster, zoomer au pointeur, déplacer la vue,
 * centrer la sélection, et le réducteur des gestes (cahier 01 §127, UX-04).
 *
 * Pur. La vue est un état d'ÉCRAN : `écran = monde × k + (x, y)`. Elle n'est
 * jamais enregistrée · seuls deux gestes ÉCRIVENT (déplacer une carte,
 * réinitialiser la disposition), et le réducteur le dit en renvoyant la
 * disposition à enregistrer. Consulter, zoomer, ajuster, centrer, choisir une
 * carte ou basculer en liste n'écrit RIEN (`l8d-canvas-noyau`,
 * `l8d-canvas-rendu`).
 */

import type { ModeleCanvas } from './modele';
import {
  composerCanvas, deplacerCarte, positionCarte, reinitialiserDisposition,
  CARTE_CANVAS, type DispositionCanvas, type PointCanvas, type RectCanvas,
} from './disposition';

export interface VueCanvas { x: number; y: number; k: number }
export interface TailleCanvas { largeur: number; hauteur: number }

/**
 * Bornes du zoom · MESURÉES, pas posées. Ajuster une vidéo de N plans (deux
 * sur trois en voix off, un sur trois en lipsync, deux identités, produit,
 * style, mise en page) dans une zone canvas de 860 × 520 px, marge 24 :
 *
 * | Plans | Cartes | Liens | Bornes (monde) | k nécessaire |
 * |-------|--------|-------|----------------|--------------|
 * | 3     | 24     | 45    | 1992 × 860     | 0,408        |
 * | 6     | 36     | 84    | 1992 × 1500    | 0,315        |
 * | 10    | 52     | 136   | 1992 × 2524    | 0,187        |
 * | 20    | 92     | 264   | 1992 × 5084    | 0,093        |
 * | 50    | 212    | 649   | 1992 × 12764   | 0,037        |
 *
 * `ZOOM_MIN` = 0,085 laisse ajuster le projet de référence UX-06 (20 plans,
 * k = 0,093) avec une marge ; une carte y fait encore 18 px de large. En
 * dessous, plus rien ne se lit · au-delà de ~22 plans l'ajustement plafonne,
 * on navigue (pan, focus) et la vue liste reste l'équivalent complet.
 * `ZOOM_MAX` = 2 garde une carte entière dans la zone mobile
 * (358 px utiles ≥ 216 × 1,6 au focus).
 */
export const ZOOM_MIN_CANVAS = 0.085;
export const ZOOM_MAX_CANVAS = 2;
export const PAS_ZOOM_CANVAS = 1.2;
/** Marge autour du contenu ajusté, en pixels d'écran. */
export const MARGE_VUE_CANVAS = 24;
/** Pas d'un déplacement au clavier (unités du monde) · Maj : grand pas. */
export const PAS_CLAVIER_CANVAS = 16;
export const GRAND_PAS_CLAVIER_CANVAS = 64;

export const VUE_NEUTRE: VueCanvas = { x: 0, y: 0, k: 1 };

/**
 * Zoom d'ouverture · DÉRIVÉ de la plus petite écriture d'une carte (12 px,
 * l'état du média) : à 0,75 elle fait 9 px, le plancher lisible. Constaté sur
 * capture (1280 × 720, projet de 3 plans) : l'ajustement complet ouvrait à
 * 28 %, titres illisibles. On ouvre donc en haut à gauche à ce zoom, et
 * « Ajuster » montre tout.
 */
export const ZOOM_LISIBLE_CANVAS = 0.75;

const bornerZoom = (k: number) => Math.max(ZOOM_MIN_CANVAS, Math.min(ZOOM_MAX_CANVAS, k));

/** Ajuster · tout le contenu visible, centré, sans agrandir au-delà de 1. */
export function vueAjustee(bornes: RectCanvas, t: TailleCanvas, marge = MARGE_VUE_CANVAS): VueCanvas {
  if (bornes.w <= 0 || bornes.h <= 0 || t.largeur <= 0 || t.hauteur <= 0) return { ...VUE_NEUTRE, x: marge, y: marge };
  const k = bornerZoom(Math.min(1, (t.largeur - 2 * marge) / bornes.w, (t.hauteur - 2 * marge) / bornes.h));
  return {
    k,
    x: (t.largeur - bornes.w * k) / 2 - bornes.x * k,
    y: Math.max(marge, (t.hauteur - bornes.h * k) / 2) - bornes.y * k,
  };
}

/** Vue d'ouverture · l'ajustement s'il reste lisible, sinon le début du canvas (haut gauche) à un zoom lisible. */
export function vueInitiale(bornes: RectCanvas, t: TailleCanvas, marge = MARGE_VUE_CANVAS): VueCanvas {
  const f = vueAjustee(bornes, t, marge);
  if (f.k >= ZOOM_LISIBLE_CANVAS || bornes.w <= 0) return f;
  const k = ZOOM_LISIBLE_CANVAS;
  return { k, x: marge - bornes.x * k, y: marge - bornes.y * k };
}

/** Zoom centré sur le pointeur · le point du monde sous le pointeur ne bouge pas. */
export function zoomAuPointeur(v: VueCanvas, facteur: number, pointeur: PointCanvas): VueCanvas {
  if (!Number.isFinite(facteur) || facteur <= 0) return v;
  const k = bornerZoom(v.k * facteur);
  const r = k / v.k;
  return { k, x: pointeur.x - (pointeur.x - v.x) * r, y: pointeur.y - (pointeur.y - v.y) * r };
}

/** Déplacer la vue (pan) · en pixels d'écran. */
export function panoramique(v: VueCanvas, dx: number, dy: number): VueCanvas {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return v;
  return { ...v, x: v.x + dx, y: v.y + dy };
}

/** Centrer la sélection · la carte au centre, à un zoom lisible (au moins 1 si elle tient). */
export function vueFocus(v: VueCanvas, rect: RectCanvas, t: TailleCanvas, marge = MARGE_VUE_CANVAS): VueCanvas {
  const tient = Math.min((t.largeur - 2 * marge) / rect.w, (t.hauteur - 2 * marge) / rect.h);
  const k = bornerZoom(Math.min(Math.max(v.k, 1), tient > 0 ? tient : 1));
  return { k, x: t.largeur / 2 - (rect.x + rect.w / 2) * k, y: t.hauteur / 2 - (rect.y + rect.h / 2) * k };
}

/** Écran → monde (pour un glisser). */
export function versMonde(v: VueCanvas, p: PointCanvas): PointCanvas {
  return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k };
}

/* ─────────────────────────── Réducteur des gestes ────────────────────────── */

export type ModeCanvas = 'liste' | 'canvas';

export interface EtatCanvas {
  mode: ModeCanvas;
  vue: VueCanvas;
  disposition: DispositionCanvas;
  selection: string | null;
}

export type GesteCanvas =
  | { type: 'basculer'; mode: ModeCanvas; taille: TailleCanvas }
  | { type: 'ouvrir'; taille: TailleCanvas }
  | { type: 'selectionner'; id: string | null }
  | { type: 'ajuster'; taille: TailleCanvas }
  | { type: 'zoomer'; facteur: number; pointeur: PointCanvas }
  | { type: 'panoramiquer'; dx: number; dy: number }
  | { type: 'focaliser'; id: string; taille: TailleCanvas }
  | { type: 'deplacer'; id: string; dx: number; dy: number }
  | { type: 'reinitialiser'; taille: TailleCanvas }
  | { type: 'remplacer'; disposition: DispositionCanvas };

/** Les gestes qui ÉCRIVENT la disposition · tous les autres n'écrivent rien. */
export const GESTES_ECRITS_CANVAS: ReadonlySet<GesteCanvas['type']> = new Set(['deplacer', 'reinitialiser']);

export interface ResultatGesteCanvas {
  etat: EtatCanvas;
  /** Disposition à enregistrer · `null` pour tout geste de consultation. */
  aEnregistrer: DispositionCanvas | null;
}

export function etatInitialCanvas(d: DispositionCanvas, mode: ModeCanvas = 'liste'): EtatCanvas {
  // La disposition est gardée ENTIÈRE · les positions de cartes absentes de cette
  // version (une version antérieure) ne sont pas effacées au prochain geste.
  return { mode, vue: VUE_NEUTRE, disposition: d, selection: null };
}

function rectCarte(m: ModeleCanvas, d: DispositionCanvas, id: string): RectCanvas | null {
  const p = positionCarte(m, d, id);
  return p ? { x: p.x, y: p.y, w: CARTE_CANVAS.largeur, h: CARTE_CANVAS.hauteur } : null;
}

/**
 * Applique un geste · renvoie le nouvel état ET, pour un geste qui écrit, la
 * disposition à enregistrer. Un glisser en cours n'est qu'un décalage
 * d'affichage côté écran · c'est le `deplacer` final (relâcher, flèche) qui
 * écrit, une seule fois.
 */
export function reduireCanvas(m: ModeleCanvas, e: EtatCanvas, g: GesteCanvas): ResultatGesteCanvas {
  const lecture = (etat: EtatCanvas): ResultatGesteCanvas => ({ etat, aEnregistrer: null });
  switch (g.type) {
    case 'basculer': {
      const etat = { ...e, mode: g.mode };
      if (g.mode === 'canvas') {
        const r = e.selection ? rectCarte(m, e.disposition, e.selection) : null;
        etat.vue = r ? vueFocus(e.vue, r, g.taille) : vueInitiale(composerCanvas(m, e.disposition).bornes, g.taille);
      }
      return lecture(etat);
    }
    case 'ouvrir': {
      const r = e.selection ? rectCarte(m, e.disposition, e.selection) : null;
      return lecture({ ...e, vue: r ? vueFocus(e.vue, r, g.taille) : vueInitiale(composerCanvas(m, e.disposition).bornes, g.taille) });
    }
    case 'selectionner':
      return lecture({ ...e, selection: g.id !== null && m.grille[g.id] ? g.id : null });
    case 'ajuster':
      return lecture({ ...e, vue: vueAjustee(composerCanvas(m, e.disposition).bornes, g.taille) });
    case 'zoomer':
      return lecture({ ...e, vue: zoomAuPointeur(e.vue, g.facteur, g.pointeur) });
    case 'panoramiquer':
      return lecture({ ...e, vue: panoramique(e.vue, g.dx, g.dy) });
    case 'focaliser': {
      const r = rectCarte(m, e.disposition, g.id);
      return lecture(r ? { ...e, selection: g.id, vue: vueFocus(e.vue, r, g.taille) } : e);
    }
    case 'deplacer': {
      if (!m.grille[g.id] || (g.dx === 0 && g.dy === 0)) return lecture(e);
      const disposition = deplacerCarte(m, e.disposition, g.id, g.dx, g.dy);
      return { etat: { ...e, disposition, selection: g.id }, aEnregistrer: disposition };
    }
    case 'reinitialiser': {
      const disposition = reinitialiserDisposition();
      return { etat: { ...e, disposition, vue: vueAjustee(composerCanvas(m, disposition).bornes, g.taille) }, aEnregistrer: disposition };
    }
    case 'remplacer':
      return lecture({ ...e, disposition: g.disposition });
  }
}
