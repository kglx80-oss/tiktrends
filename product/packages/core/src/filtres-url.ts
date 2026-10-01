import { CRITERES_DEFAUT, type CriteresGalerie, type CritereQualite, type CriterePerf, type CritereTri } from './galerie-filtres';

/**
 * Les filtres d'une liste survivent au bouton Retour · ils vivent dans l'URL
 * (recette #106 · Assets et galerie Pubs IA perdaient recherche et filtres en
 * revenant d'un autre écran, l'état n'étant que local au composant).
 *
 * L'écran REMPLACE l'entrée courante à chaque changement (aucune entrée
 * empilée par frappe) et relit l'URL au montage. Seuls les écarts au défaut
 * sont écrits · une liste non filtrée garde une URL nue. Les autres
 * paramètres de la page sont conservés, dans leur ordre.
 *
 * Pur · ni navigateur ni réseau.
 */
type Valeurs = Record<string, string | null>;

function fusionner(recherche: string, valeurs: Valeurs): string {
  const p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  for (const [k, v] of Object.entries(valeurs)) { if (v) p.set(k, v); else p.delete(k); }
  const s = p.toString();
  return s ? `?${s}` : '';
}
const lire = (recherche: string) => new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
const parmi = <T extends string>(v: string | null, admis: readonly T[], defaut: T): T => (v && (admis as readonly string[]).includes(v) ? (v as T) : defaut);

const QUALITES: readonly CritereQualite[] = ['toutes', 'prete', 'a_verifier', 'a_revoir', 'non_verifiee'];
const PERFS: readonly CriterePerf[] = ['toutes', 'gagnante', 'en_mesure', 'a_lancer', 'inconnue'];
const TRIS: readonly CritereTri[] = ['recent', 'ancien', 'titre'];

/** La galerie de Pubs IA · critères lus depuis l'URL (valeur inconnue → défaut). */
export function lireCriteresGalerie(recherche: string): CriteresGalerie {
  const p = lire(recherche);
  return {
    recherche: p.get('q') ?? CRITERES_DEFAUT.recherche,
    format: p.get('format') || CRITERES_DEFAUT.format,
    qualite: parmi(p.get('qualite'), QUALITES, CRITERES_DEFAUT.qualite),
    performance: parmi(p.get('perf'), PERFS, CRITERES_DEFAUT.performance),
    tri: parmi(p.get('tri'), TRIS, CRITERES_DEFAUT.tri),
  };
}

export function ecrireCriteresGalerie(recherche: string, c: CriteresGalerie): string {
  const d = CRITERES_DEFAUT;
  return fusionner(recherche, {
    q: c.recherche.trim() ? c.recherche : null,
    format: c.format !== d.format ? c.format : null,
    qualite: c.qualite !== d.qualite ? c.qualite : null,
    perf: c.performance !== d.performance ? c.performance : null,
    tri: c.tri !== d.tri ? c.tri : null,
  });
}

export type TypeAssetFiltre = 'all' | 'image' | 'video' | 'audio' | 'other';
export interface FiltreAssets { type: TypeAssetFiltre; recherche: string }
export const FILTRE_ASSETS_DEFAUT: FiltreAssets = { type: 'all', recherche: '' };
const TYPES_ASSETS: readonly TypeAssetFiltre[] = ['all', 'image', 'video', 'audio', 'other'];

/** La bibliothèque Assets · type et recherche lus depuis l'URL. */
export function lireFiltreAssets(recherche: string): FiltreAssets {
  const p = lire(recherche);
  return { type: parmi(p.get('type'), TYPES_ASSETS, 'all'), recherche: p.get('q') ?? '' };
}

export function ecrireFiltreAssets(recherche: string, f: FiltreAssets): string {
  return fusionner(recherche, { type: f.type !== 'all' ? f.type : null, q: f.recherche.trim() ? f.recherche : null });
}

/**
 * Sauvegardes · Créations · la recherche et le board choisi (recette #106,
 * point 6 · revenir du Studio ou d'un autre écran les perdait). `board` vaut
 * le nom du board, `sans` pour « Sans dossier », absent pour « Toutes ».
 */
export const BOARD_TOUS = '__all';
export const BOARD_SANS = '__none';
export interface CriteresSauvegardes { board: string; recherche: string }

export function lireCriteresSauvegardes(recherche: string): CriteresSauvegardes {
  const p = lire(recherche);
  const b = p.get('board');
  return { board: !b ? BOARD_TOUS : b === 'sans' ? BOARD_SANS : b, recherche: p.get('q') ?? '' };
}

export function ecrireCriteresSauvegardes(recherche: string, c: CriteresSauvegardes): string {
  const board = c.board === BOARD_TOUS ? null : c.board === BOARD_SANS ? 'sans' : c.board;
  return fusionner(recherche, { board, q: c.recherche.trim() ? c.recherche : null });
}
