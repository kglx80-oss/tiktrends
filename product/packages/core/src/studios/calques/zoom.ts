/**
 * Studios · éditeur de calques · zoom de la zone de travail.
 *
 * Pur. Le zoom est un état d'AFFICHAGE : il ne touche jamais le document,
 * n'entre pas dans l'historique annuler/rétablir et ne crée aucune version.
 * Un zoom vaut « pixels d'écran par pixel du document » · 1 = taille réelle
 * (100 %), comme dans tout éditeur d'image.
 *
 * ── Géométrie ───────────────────────────────────────────────────────────────
 *
 * La zone de travail est une boîte défilante de `largeur × hauteur` px. Son
 * contenu fait au moins la taille de la zone, et au moins le document zoomé
 * plus une marge de chaque côté ; le document y est centré. La vue qui en
 * découle est la `Vue` du rendu (`écran = document × zoom + (panX, panY)`,
 * `rendu/geometrie.ts`) : la même conversion écran → document sert au
 * zoom à point fixe et au déplacement d'un calque.
 *
 * ── Bornes · mesurées, puis dérivées ────────────────────────────────────────
 *
 * Zone de travail MESURÉE le 11/10/2026 dans Chromium, sur le banc local
 * (éditeur réel, `clientWidth × clientHeight` de la zone, coquille et panneaux
 * compris) aux trois largeurs de la recette (spec UX V2 § 9 · 1440, 1280 et
 * 390 × 720). Le zoom d'ajustement lu à l'écran pour le 4:5 (36 %, 33 %,
 * 29 %) est celui que donne la formule ci-dessous :
 *
 * | Fenêtre    | Zone (px)  | 1:1 (1080²) | 4:5 (1080×1350) | 9:16 (1080×1920) |
 * |------------|------------|-------------|-----------------|------------------|
 * | 1440 × 720 | 497 × 516  | 0,431       | 0,359           | 0,252            |
 * | 1280 × 720 | 393 × 516  | 0,334       | 0,334           | 0,252            |
 * | 390 × 720  | 341 × 430  | 0,286       | 0,286           | 0,207            |
 *
 * (zoom d'ajustement = min((L − 2·marge) / largeur, (H − 2·marge) / hauteur),
 * marge 16 ; recalculé par `l2b-zoom.test.ts` à partir de `ZONES_MESUREES`.)
 *
 * `ZOOM_MIN_EDITEUR` = le palier le plus haut qui reste ≤ la MOITIÉ de
 * l'ajustement le plus serré mesuré (0,207 → 0,104 → palier 0,1) : « Ajuster »
 * n'est jamais rogné par la borne, et on peut encore reculer d'un facteur 2
 * au-delà pour voir le document entouré de vide.
 *
 * `ZOOM_MAX_EDITEUR` = le premier palier où la ligne du plus petit texte que
 * l'éditeur pose (12 px × interligne 1,2 = 14,4 px du document) atteint la
 * cible tactile de 44 px (44 / 14,4 = 3,06 → palier 4) : au maximum, on attrape
 * au doigt n'importe quel texte posé par l'éditeur, et un pixel du document
 * couvre 4 × 4 pixels d'écran (placement au pixel près). Au-delà, sur
 * téléphone, la zone ne montre plus que 85 px de large du document.
 *
 * Un document hors format (import de 16 384 px) s'ajuste quand même : la
 * borne basse descend alors à SON ajustement (`bornesZoom`), jamais en dessous.
 */

import { CIBLE_TACTILE_MIN } from '../../cible-tactile';
import { ecranVersDocument, type Point2, type Vue } from '../rendu/geometrie';
import { FORMATS_DOCUMENT, type FormatDocument } from './formats';
import { INTERLIGNE_TEXTE, TEXTE_MIN_PX } from './operations';

export interface TailleZone { largeur: number; hauteur: number }
export interface DimensionsDocument { width: number; height: number }

/** Marge autour du document dans la zone, px d'écran · la gouttière latérale d'une page sur téléphone. */
export const MARGE_ZONE_EDITEUR = 16;

/** Paliers des boutons − et + (et des raccourcis) · 1 = 100 %. */
export const PALIERS_ZOOM_EDITEUR: readonly number[] = [0.1, 0.125, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** Zones de travail mesurées (voir l'en-tête) · fenêtre → taille utile de la zone. */
export const ZONES_MESUREES: ReadonlyArray<{ fenetre: string; zone: TailleZone }> = [
  { fenetre: '1440 × 720', zone: { largeur: 497, hauteur: 516 } },
  { fenetre: '1280 × 720', zone: { largeur: 393, hauteur: 516 } },
  { fenetre: '390 × 720', zone: { largeur: 341, hauteur: 430 } },
];

/** Zoom qui fait tenir le document entier dans la zone, marge comprise · sans borne. */
export function zoomAjusteBrut(doc: DimensionsDocument, zone: TailleZone, marge = MARGE_ZONE_EDITEUR): number {
  if (!(doc.width > 0 && doc.height > 0 && zone.largeur > 0 && zone.hauteur > 0)) return 1;
  const k = Math.min((zone.largeur - 2 * marge) / doc.width, (zone.hauteur - 2 * marge) / doc.height);
  return k > 0 ? k : Math.min(zone.largeur / doc.width, zone.hauteur / doc.height);
}

/** L'ajustement le plus serré des formats de l'éditeur, sur les zones mesurées. */
export function ajustementLePlusSerre(): number {
  let min = Infinity;
  for (const { zone } of ZONES_MESUREES) {
    for (const f of Object.keys(FORMATS_DOCUMENT) as FormatDocument[]) min = Math.min(min, zoomAjusteBrut(FORMATS_DOCUMENT[f], zone));
  }
  return min;
}

/** Plus haut palier ≤ x (le plus bas sinon). */
const palierSous = (x: number) => [...PALIERS_ZOOM_EDITEUR].reverse().find((p) => p <= x + 1e-9) ?? PALIERS_ZOOM_EDITEUR[0]!;
/** Plus bas palier ≥ x (le plus haut sinon). */
const palierSur = (x: number) => PALIERS_ZOOM_EDITEUR.find((p) => p >= x - 1e-9) ?? PALIERS_ZOOM_EDITEUR[PALIERS_ZOOM_EDITEUR.length - 1]!;

/** Dérivé · voir l'en-tête (moitié de l'ajustement le plus serré, au palier inférieur). */
export const ZOOM_MIN_EDITEUR = palierSous(ajustementLePlusSerre() / 2);
/** Dérivé · voir l'en-tête (le plus petit texte posé atteint la cible tactile). */
export const ZOOM_MAX_EDITEUR = palierSur(CIBLE_TACTILE_MIN / (TEXTE_MIN_PX * INTERLIGNE_TEXTE));

export interface BornesZoom { min: number; max: number }

/** Bornes pour un document · la borne basse descend à son ajustement s'il est plus petit (document hors format). */
export function bornesZoom(doc: DimensionsDocument, zone: TailleZone | null): BornesZoom {
  const ajuste = zone ? zoomAjusteBrut(doc, zone) : ZOOM_MIN_EDITEUR;
  return { min: Math.min(ZOOM_MIN_EDITEUR, ajuste), max: ZOOM_MAX_EDITEUR };
}

export function bornerZoom(z: number, b: BornesZoom): number {
  if (!Number.isFinite(z)) return b.min;
  return Math.min(b.max, Math.max(b.min, z));
}

/** « Ajuster » · le document entier dans la zone, borné. */
export function zoomAjuste(doc: DimensionsDocument, zone: TailleZone): number {
  return bornerZoom(zoomAjusteBrut(doc, zone), bornesZoom(doc, zone));
}

/** Palier suivant (+1) ou précédent (−1) STRICTEMENT après `z`, borné. */
export function palierVoisin(z: number, sens: 1 | -1, b: BornesZoom): number {
  const p = sens > 0
    ? PALIERS_ZOOM_EDITEUR.find((x) => x > z * 1.001)
    : [...PALIERS_ZOOM_EDITEUR].reverse().find((x) => x < z / 1.001);
  return bornerZoom(p ?? (sens > 0 ? b.max : b.min), b);
}

/** « 42 % » · entier, espace insécable. */
export function libelleZoom(z: number): string {
  return `${Math.round(z * 100)} %`;
}

/* ─────────────────────────── Zone et vue ─────────────────────────────────── */

export interface DispositionZone {
  /** Taille du contenu défilant. */
  contenu: TailleZone;
  /** Coin haut gauche du document dans le contenu. */
  origine: Point2;
  /** Taille affichée du document. */
  document: TailleZone;
}

/** Où se pose le document dans la zone à ce zoom · centré, marge autour quand il déborde. */
export function dispositionZone(doc: DimensionsDocument, zone: TailleZone, zoom: number, marge = MARGE_ZONE_EDITEUR): DispositionZone {
  const largeur = doc.width * zoom;
  const hauteur = doc.height * zoom;
  const contenu = { largeur: Math.max(zone.largeur, largeur + 2 * marge), hauteur: Math.max(zone.hauteur, hauteur + 2 * marge) };
  return { contenu, origine: { x: (contenu.largeur - largeur) / 2, y: (contenu.hauteur - hauteur) / 2 }, document: { largeur, hauteur } };
}

/** Défilement possible · [0, contenu − zone]. */
function bornerDefilement(d: Point2, disp: DispositionZone, zone: TailleZone): Point2 {
  const mx = Math.max(0, disp.contenu.largeur - zone.largeur);
  const my = Math.max(0, disp.contenu.hauteur - zone.hauteur);
  return { x: Math.min(mx, Math.max(0, d.x)), y: Math.min(my, Math.max(0, d.y)) };
}

/** La vue (écran de la zone ↔ document) pour un zoom et un défilement. */
export function vueZone(doc: DimensionsDocument, zone: TailleZone, zoom: number, defilement: Point2, marge = MARGE_ZONE_EDITEUR): Vue {
  const disp = dispositionZone(doc, zone, zoom, marge);
  const d = bornerDefilement(defilement, disp, zone);
  return { zoom, panX: disp.origine.x - d.x, panY: disp.origine.y - d.y };
}

export interface EtatZoomZone { zoom: number; defilement: Point2 }

/**
 * Zoom à POINT FIXE · le point du document sous `point` (coordonnées de la
 * zone, px d'écran) reste sous `point` après le zoom. Seule exception : un
 * bord du contenu (le défilement ne peut pas être négatif ni dépasser la fin),
 * notamment quand le document zoomé tient dans la zone et s'y recentre.
 */
export function zoomerAutour(o: {
  doc: DimensionsDocument;
  zone: TailleZone;
  zoom: number;
  defilement: Point2;
  nouveauZoom: number;
  point: Point2;
  marge?: number;
}): EtatZoomZone {
  const marge = o.marge ?? MARGE_ZONE_EDITEUR;
  const b = bornesZoom(o.doc, o.zone);
  const z1 = bornerZoom(o.nouveauZoom, b);
  const p = ecranVersDocument(o.point, vueZone(o.doc, o.zone, o.zoom, o.defilement, marge));
  const disp = dispositionZone(o.doc, o.zone, z1, marge);
  const defilement = bornerDefilement({ x: disp.origine.x + p.x * z1 - o.point.x, y: disp.origine.y + p.y * z1 - o.point.y }, disp, o.zone);
  return { zoom: z1, defilement };
}

/** Centre de la zone · le point fixe des boutons − et +. */
export const centreZone = (zone: TailleZone): Point2 => ({ x: zone.largeur / 2, y: zone.hauteur / 2 });

/* ─────────────────────────── Gestes ──────────────────────────────────────── */

/**
 * Facteur d'un événement molette avec Ctrl/⌘ (et du pincement d'un pavé
 * tactile, que les navigateurs envoient ainsi). Proportionnel au défilement,
 * plafonné à un palier de `PAS_MOLETTE_MAX` par événement : un cran de souris
 * (100 px dans Chromium, 3 lignes dans Firefox · spécification UI Events,
 * `deltaMode`) fait ×1,2 ; un pincement, qui envoie beaucoup de petits
 * événements, zoome en continu.
 */
export const PAS_MOLETTE_MAX = 1.2;
const PX_PAR_CRAN = 100;
const PX_PAR_LIGNE = PX_PAR_CRAN / 3;
const PX_PAR_PAGE = 800;

export function facteurMolette(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const px = deltaY * (deltaMode === 1 ? PX_PAR_LIGNE : deltaMode === 2 ? PX_PAR_PAGE : 1);
  const f = Math.pow(PAS_MOLETTE_MAX, -px / PX_PAR_CRAN);
  return Math.min(PAS_MOLETTE_MAX, Math.max(1 / PAS_MOLETTE_MAX, f));
}

/**
 * Un déplacement à l'écran (px) en déplacement dans le document (px du
 * document) · `largeurAffichee` = largeur MESURÉE du cadre du document à
 * l'écran, donc juste à tout zoom (et pendant l'ajustement par CSS, avant
 * toute mesure de la zone).
 */
export function deplacementVersDocument(dxEcran: number, dyEcran: number, largeurAffichee: number, largeurDocument: number): Point2 {
  const zoom = largeurAffichee > 0 && largeurDocument > 0 ? largeurAffichee / largeurDocument : 1;
  return { x: dxEcran / zoom, y: dyEcran / zoom };
}

export type ActionZoom = 'plus' | 'moins' | 'ajuster';

/**
 * Raccourcis Ctrl/⌘ + · Ctrl/⌘ − · Ctrl/⌘ 0 (Ajuster). JAMAIS pendant une
 * saisie : dans un champ, la touche reste au navigateur (son propre zoom),
 * l'éditeur ne la prend pas. `code` couvre les claviers où le chiffre demande
 * Maj (AZERTY : « à » sur la touche 0) et le pavé numérique.
 */
export function raccourciZoom(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; dansChamp: boolean }): ActionZoom | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.dansChamp) return null;
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return 'plus';
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'moins';
  if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') return 'ajuster';
  return null;
}
