import { SECTIONS_SPATIALES, type EcranSpatial, type SectionSpatiale } from './types';
import { ECRANS_ACCUEIL } from './ecrans/accueil';
import { ECRANS_STUDIOS } from './ecrans/studios';
import { ECRANS_VEILLE } from './ecrans/veille';
import { ECRANS_RESULTATS } from './ecrans/resultats';
import { ECRANS_BIBLIOTHEQUE } from './ecrans/bibliotheque';
import { ECRANS_JARVIS } from './ecrans/jarvis';
import { ECRANS_MCP } from './ecrans/mcp';
import { ECRANS_MARQUE } from './ecrans/marque';
import { ECRANS_REGLAGES } from './ecrans/reglages';
import { ECRANS_ADMIN } from './ecrans/admin';

/**
 * Spatial · le routage des adresses publiques vers l'arbre Spatial (nouvelle
 * DA, mandat Kevin du 27/10). Pur · ni base, ni réseau, ni dépendance · le
 * middleware (paquet Edge) l'importe tel quel.
 *
 * L'ancienne interface (V5) est RETIRÉE · plus de cookie `tt_ui` ni de
 * paramètre `?ui=`. Toute adresse PORTÉE (listée dans `ecrans/`) est servie par
 * l'arbre Spatial · une adresse absente n'a pas de page (404 normale), sauf les
 * pages publiques hors coquille (connexion, inscription, mentions…).
 */

/** L'arbre Spatial vit sous ce préfixe interne (jamais vu du navigateur). */
export const PREFIXE_SPATIAL = '/sp';

export const ECRANS_SPATIAUX: readonly EcranSpatial[] = [
  ...ECRANS_ACCUEIL, ...ECRANS_STUDIOS, ...ECRANS_VEILLE, ...ECRANS_RESULTATS, ...ECRANS_BIBLIOTHEQUE,
  ...ECRANS_JARVIS, ...ECRANS_MCP, ...ECRANS_MARQUE, ...ECRANS_REGLAGES, ...ECRANS_ADMIN,
];

const segments = (c: string) => c.split('/').filter(Boolean);

function correspond(motif: string, chemin: string): boolean {
  const m = segments(motif), c = segments(chemin);
  if (m.length !== c.length) return false;
  return m.every((s, i) => (s.startsWith('[') && s.endsWith(']') ? c[i]!.length > 0 : s === c[i]));
}

/**
 * Le chemin public est-il porté ? → le chemin INTERNE à servir et sa section.
 * `null` · le chemin n'est pas un écran Spatial (page publique, route, 404).
 * Les chemins déjà internes (`/sp/…`) ne sont jamais réécrits une seconde fois.
 */
export function ecranSpatial(chemin: string): { interne: string; section: SectionSpatiale } | null {
  return ecranSpatialDans(ECRANS_SPATIAUX, chemin);
}

/** `ecranSpatial` sur une liste donnée · testable sans toucher aux déclarations. */
export function ecranSpatialDans(liste: readonly EcranSpatial[], chemin: string): { interne: string; section: SectionSpatiale } | null {
  if (chemin === PREFIXE_SPATIAL || chemin.startsWith(PREFIXE_SPATIAL + '/')) return null;
  const propre = chemin.length > 1 ? chemin.replace(/\/+$/, '') : chemin;
  const e = liste.find((x) => correspond(x.chemin, propre));
  return e ? { interne: PREFIXE_SPATIAL + (propre === '/' ? '' : propre), section: e.section } : null;
}

/** Un lien de l'interface Spatial vers ce chemin reste-t-il dans l'arbre Spatial ? */
export function cheminPorte(href: string): boolean {
  const chemin = href.split(/[?#]/)[0] || '/';
  return ecranSpatial(chemin) !== null;
}

/** En-tête posé par le middleware sur une requête réécrite · lu par le layout racine. */
export const ENTETE_SECTION = 'x-tt-section';

/**
 * En-tête posé par le middleware sur une requête réécrite · le chemin PUBLIC
 * servi. Le layout Spatial ne connaît pas l'adresse affichée · la coquille en a
 * besoin pour ne pas renvoyer au parcours d'accueil… le parcours d'accueil
 * lui-même (`/onboarding`, servi sous le même layout).
 */
export const ENTETE_CHEMIN = 'x-tt-chemin';

export function sectionValide(v: string | null | undefined): SectionSpatiale | null {
  return v && (SECTIONS_SPATIALES as readonly string[]).includes(v) ? (v as SectionSpatiale) : null;
}

/**
 * La section d'accent d'une adresse publique, portée ou non · l'entrée active
 * du rail et `body[data-sec]` (maquette : `sectionOf`). Préfixe le plus long
 * d'abord · `null` hors des rubriques.
 */
const PREFIXES_SECTION: ReadonlyArray<[string, SectionSpatiale]> = [
  ['/dashboard', 'accueil'], ['/onboarding', 'accueil'],
  ['/studio', 'studios'],
  ['/veille', 'veille'], ['/saved', 'veille'], ['/radar', 'veille'], ['/tags', 'veille'],
  ['/adsmap', 'resultats'],
  ['/assets', 'bibliotheque'],
  ['/jarvis', 'jarvis'],
  ['/mcp', 'mcp'],
  ['/brands', 'marque'],
  ['/settings', 'reglages'], ['/team', 'reglages'], ['/connections', 'reglages'], ['/usage', 'reglages'], ['/billing', 'reglages'], ['/profile', 'reglages'], ['/support', 'reglages'],
  ['/admin', 'admin'], ['/console', 'admin'], ['/credits', 'admin'],
];

export function sectionDuChemin(chemin: string): SectionSpatiale | null {
  const c = chemin.split(/[?#]/)[0] || '/';
  for (const [p, s] of PREFIXES_SECTION) if (c === p || c.startsWith(p + '/')) return s;
  return null;
}
