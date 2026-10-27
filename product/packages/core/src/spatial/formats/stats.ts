import type { AnnonceFormat } from '../../formats-creatifs';
import { MIN_N_WINDOW } from '../../adsmap/trend';
import { STYLES_CREA, styleCorrespond, styleDuFormat, type CleStyle, type FamilleStyle, type StyleCrea } from './catalogue';
import { ecartTendance, type Tendance } from './tendances';

/**
 * Les chiffres RÉELS d'un style · ceux des sauvegardes classées dans son format
 * normatif (`catalogue.ts`). Pur.
 *
 * Un groupe n'a le droit de parler qu'à partir de l'effectif minimal du dépôt
 * (`MIN_N_WINDOW`, `adsmap/trend.ts`) · en dessous, le nombre d'annonces est
 * dit, mais ni moyenne ni part · deux annonces ne font pas une durée typique.
 */

export const EFFECTIF_MIN_STYLE = MIN_N_WINDOW;
/** « Tournent +30 j » · le palier de la maquette, qui est aussi la fenêtre des tendances. */
export const JOURS_LONGUE_DIFFUSION = 30;

export interface StatsStyle {
  /** Le style a un format de classement · sinon aucun chiffre n'existe. */
  mesure: boolean;
  /** Sauvegardes classées dans ce format. */
  n: number;
  /** Diffusion moyenne (jours) · `null` sous l'effectif minimal ou sans durée. */
  joursMoyens: number | null;
  /** Part (0 à 100) des annonces diffusées 30 jours ou plus · `null` sous l'effectif minimal. */
  partLongue: number | null;
}

export function statsParStyle(annonces: readonly Pick<AnnonceFormat, 'daysRunning' | 'format'>[]): Record<CleStyle, StatsStyle> {
  const jours = new Map<CleStyle, number[]>();
  const n = new Map<CleStyle, number>();
  for (const a of annonces) {
    if (a.format.etat !== 'classe') continue;
    const cle = styleDuFormat(a.format.id);
    if (!cle) continue;
    n.set(cle, (n.get(cle) ?? 0) + 1);
    if (typeof a.daysRunning === 'number' && Number.isFinite(a.daysRunning) && a.daysRunning >= 0) jours.set(cle, [...(jours.get(cle) ?? []), a.daysRunning]);
  }
  const out = {} as Record<CleStyle, StatsStyle>;
  for (const s of STYLES_CREA) {
    const k = n.get(s.cle) ?? 0;
    const j = jours.get(s.cle) ?? [];
    const parle = j.length >= EFFECTIF_MIN_STYLE;
    out[s.cle] = {
      mesure: s.formatNormatif !== null, n: k,
      joursMoyens: parle ? Math.round(j.reduce((a, b) => a + b, 0) / j.length) : null,
      partLongue: parle ? Math.round((j.filter((x) => x >= JOURS_LONGUE_DIFFUSION).length / j.length) * 100) : null,
    };
  }
  return out;
}

/* ── La galerie · tri, filtre, pastille ───────────────────────────────────── */

export type TriStyles = 'pop' | 'up' | 'long' | 'az';
export const TRIS_STYLES: ReadonlyArray<{ id: TriStyles; libelle: string; sous: string }> = [
  { id: 'pop', libelle: 'Les plus sauvegardés', sous: 'Le plus d’annonces classées dans tes sauvegardes' },
  { id: 'up', libelle: 'En hausse', sous: 'Part qui monte sur 30 jours, mesurée' },
  { id: 'long', libelle: 'Les plus durables', sous: 'Part des annonces diffusées 30 jours ou plus' },
  { id: 'az', libelle: 'De A à Z', sous: 'Ordre alphabétique' },
];
export const estTriStyles = (v: unknown): v is TriStyles => TRIS_STYLES.some((t) => t.id === v);

/** Une carte de la galerie · le style, ses chiffres, sa tendance mesurée (ou rien). */
export interface CarteStyle {
  style: StyleCrea;
  stats: StatsStyle;
  /** Écart de part en points quand la tendance est mesurée À LA HAUSSE · sinon `null`. */
  hausse: number | null;
}

export function cartesStyles(stats: Record<CleStyle, StatsStyle>, tendances: readonly Tendance[]): CarteStyle[] {
  const up = new Map<string, number>();
  for (const t of tendances) if (t.type === 'format' && (t.etape === 'croissance' || t.etape === 'emergente')) up.set(t.groupe, t.ecartPoints);
  return STYLES_CREA.map((style) => ({ style, stats: stats[style.cle], hausse: up.get(style.cle) ?? null }));
}

const ORDRE = new Map(STYLES_CREA.map((s, i) => [s.cle, i]));

/** Tri de la galerie · à égalité, l'ordre du catalogue. Ne filtre rien. */
export function trierStyles(cartes: readonly CarteStyle[], tri: TriStyles): CarteStyle[] {
  const o = (a: CarteStyle, b: CarteStyle) => ORDRE.get(a.style.cle)! - ORDRE.get(b.style.cle)!;
  const cmp: Record<TriStyles, (a: CarteStyle, b: CarteStyle) => number> = {
    pop: (a, b) => b.stats.n - a.stats.n || o(a, b),
    up: (a, b) => (b.hausse ?? -Infinity) - (a.hausse ?? -Infinity) || b.stats.n - a.stats.n || o(a, b),
    long: (a, b) => (b.stats.partLongue ?? -1) - (a.stats.partLongue ?? -1) || b.stats.n - a.stats.n || o(a, b),
    az: (a, b) => a.style.nom.localeCompare(b.style.nom, 'fr') || o(a, b),
  };
  return [...cartes].sort(cmp[tri]);
}

/** Les cartes d'une famille (`tous` = toutes), dans l'ordre reçu. */
export function filtrerFamille(cartes: readonly CarteStyle[], famille: FamilleStyle | 'tous'): CarteStyle[] {
  return famille === 'tous' ? [...cartes] : cartes.filter((c) => c.style.famille === famille);
}

/** Combien de cartes restent visibles après la recherche libre. */
export function visiblesRecherche(cartes: readonly CarteStyle[], q: string): number {
  return cartes.filter((c) => styleCorrespond(c.style, q)).length;
}

export interface PastilleStyle { classe: '' | 'up'; texte: string }

/**
 * La pastille d'une carte · le rang (3 premiers) quand la galerie est triée par
 * nombre, sans filtre ni recherche, et que le style a au moins une annonce ;
 * sinon « En hausse » quand la hausse est MESURÉE. Rien sinon.
 */
export function pastilleStyle(c: CarteStyle, rang: number, ctx: { tri: TriStyles; famille: FamilleStyle | 'tous'; q: string }): PastilleStyle | null {
  if (ctx.tri === 'pop' && rang < 3 && ctx.famille === 'tous' && !ctx.q.trim() && c.stats.n > 0) return { classe: '', texte: `N° ${rang + 1} · tes sauvegardes` };
  if (c.hausse !== null) return { classe: 'up', texte: `En hausse · ${ecartTendance(c.hausse)}` };
  return null;
}

/** Les chiffres d'une carte, en clair · jamais un chiffre sous l'effectif minimal. */
export function chiffresStyle(s: StatsStyle): { pubs: { b: string; texte: string }; longue: { b: string; texte: string } } {
  const longue = { b: s.partLongue === null ? 'n/c' : `${s.partLongue} %`, texte: ' tournent +30 j' };
  if (!s.mesure) return { pubs: { b: 'Aucun', texte: ' format de classement' }, longue };
  return { pubs: { b: String(s.n), texte: s.n > 1 ? ' pubs classées' : ' pub classée' }, longue };
}

/** Les chiffres de la page d'un style (tuiles) · « n/c » sous l'effectif minimal. */
export function tuilesStyle(s: StatsStyle, tests: number): Array<[libelle: string, valeur: string]> {
  return [
    ['Pubs classées', s.mesure ? String(s.n) : 'n/c'],
    ['Diffusion moyenne', s.joursMoyens === null ? 'n/c' : `${s.joursMoyens} j`],
    ['Tournent +30 j', s.partLongue === null ? 'n/c' : `${s.partLongue} %`],
    ['Tes tests', String(tests)],
  ];
}

/** La ligne de diffusion d'une annonce · « Active · 63 j » (statut de la source). */
export function ligneDiffusion(statut: string | null | undefined, jours: number | null | undefined): string {
  const j = typeof jours === 'number' && Number.isFinite(jours) && jours >= 0 ? `${Math.round(jours)} j` : 'durée inconnue';
  const s = (statut ?? '').toLowerCase();
  if (s === 'active') return `Active · ${j}`;
  if (s === 'inactive' || s === 'stopped' || s === 'ended') return `Arrêtée · ${j}`;
  return `Diffusée · ${j}`;
}

/** Les teintes de pastille d'annonceur de la maquette · une par nom, stable (hachage du nom). */
export const TEINTES_ANNONCEUR = ['#ffb3c7', '#b8e1ff', '#c9f2d8', '#ffe1a8', '#ffc2b0', '#e3d4ff', '#9fe3d9', '#ffd2e6', '#cfe8ff', '#f7c8ff', '#fff0a8', '#bcd2ff'] as const;

export function pastilleAnnonceur(nom: string | null | undefined): { initiale: string; couleur: string; nom: string } {
  const n = (nom ?? '').trim() || 'Annonceur inconnu';
  const h = [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return { initiale: (n.match(/\p{L}|\p{N}/u)?.[0] ?? '?').toUpperCase(), couleur: TEINTES_ANNONCEUR[h % TEINTES_ANNONCEUR.length]!, nom: n };
}

/** La ligne de périmètre de la galerie · d'où viennent les chiffres, et ce qui reste à classer. */
export function perimetreFormats(c: { classees: number; nonClassees: number }, marque: string | null): string {
  const base = c.classees === 0
    ? 'Aucune sauvegarde classée · les chiffres se remplissent quand tu classes tes sauvegardes'
    : `Compté sur ${c.classees > 1 ? `tes ${c.classees} sauvegardes classées` : 'ta sauvegarde classée'}`;
  const m = marque ? ` · marque ${marque}` : '';
  const reste = c.nonClassees > 0 ? ` · ${c.nonClassees} à classer dans Sauvegardes` : '';
  return base + m + reste;
}
