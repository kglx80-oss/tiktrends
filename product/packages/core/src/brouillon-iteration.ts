/**
 * Les saisies d'un brief d'itération survivent à la navigation · lot I2.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Le Studio sème son formulaire depuis ses props UNE fois, au montage. Mesuré
 * en recette réelle (head 94d659b, clics et historique du navigateur) :
 *   - angle et audience modifiés, « Retour au test » puis retour navigateur →
 *     formulaire revenu au prérempli, saisies perdues sans un mot ;
 *   - même perte en rouvrant « Préparer l'itération » depuis le tiroir ;
 *   - Studio monté, navigation ?iter=A → ?iter=B → brief de B affiché, mais le
 *     formulaire gardait les saisies de A · un brief et des champs qui ne
 *     parlent pas du même test.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * 1. Le Studio se REMONTE quand le test demandé change (`cleMontageStudio`) ·
 *    le formulaire suit toujours le brief affiché.
 * 2. Les saisies d'un brief sont gardées DANS L'ONGLET, par marque et par test
 *    (`cleBrouillonIteration`) · jamais envoyées au serveur, jamais une donnée
 *    métier. Une saisie revenue au prérempli n'est pas gardée.
 * 3. Au retour sur le même brief, elles sont reprises ET c'est dit · une
 *    audience qui n'existe plus dans la marque n'est pas reprise.
 *
 * Pur : ni base, ni horloge, ni stockage · le Studio lit et écrit, ce module
 * décide quoi.
 */

/** Les deux seuls champs qu'un brief d'itération préremplit. */
export interface ChampsIteration {
  angle: string;
  /** Persona choisi · '' = automatique. */
  personaId: string;
}

const VERSION = 1;

/** La clé d'onglet d'un brief · par marque ET par test (jamais partagée entre marques). */
export function cleBrouillonIteration(brandId: string, adId: string): string {
  return `tiktrends:brief-iteration:v${VERSION}:${brandId}:${adId}`;
}

/**
 * La clé de montage du Studio · change avec la marque ET avec le test demandé.
 * Même clé = même formulaire ; une autre = on repart du brief affiché.
 */
export function cleMontageStudio(brandId: string | null, iterAdId: string | null): string {
  return `${brandId ?? 'aucune-marque'}:${iterAdId ?? 'sans-iteration'}`;
}

const memes = (a: ChampsIteration, b: ChampsIteration) => a.angle === b.angle && a.personaId === b.personaId;

/**
 * Ce qu'il faut garder dans l'onglet · le texte à écrire, ou `null` pour
 * effacer (saisie revenue au prérempli · rien à reprendre).
 */
export function brouillonAEcrire(courant: ChampsIteration, prefill: ChampsIteration): string | null {
  if (memes(courant, prefill)) return null;
  return JSON.stringify({ v: VERSION, angle: courant.angle, personaId: courant.personaId });
}

export interface Reprise {
  champs: ChampsIteration;
  /** Vrai quand des saisies antérieures remplacent le prérempli · à DIRE à l'écran. */
  repris: boolean;
}

/**
 * Les champs de départ d'un brief · le prérempli, ou les saisies gardées dans
 * l'onglet quand elles sont lisibles. Un contenu illisible, d'une autre version
 * ou identique au prérempli ne reprend rien ; une audience absente de la marque
 * retombe sur celle du prérempli.
 */
export function reprendreBrouillon(brut: string | null, prefill: ChampsIteration, personasValides: readonly string[]): Reprise {
  const rien: Reprise = { champs: prefill, repris: false };
  if (!brut) return rien;
  let lu: unknown;
  try { lu = JSON.parse(brut); } catch { return rien; }
  if (!lu || typeof lu !== 'object') return rien;
  const o = lu as { v?: unknown; angle?: unknown; personaId?: unknown };
  if (o.v !== VERSION || typeof o.angle !== 'string' || typeof o.personaId !== 'string') return rien;
  const personaId = o.personaId === '' || personasValides.includes(o.personaId) ? o.personaId : prefill.personaId;
  const champs = { angle: o.angle, personaId };
  return memes(champs, prefill) ? rien : { champs, repris: true };
}

/** L'événement qu'émet « Modifier l'angle et l'audience » · le Studio ouvre ses réglages et place le focus. */
export const EVT_MODIFIER_BRIEF = 'tiktrends:modifier-brief-iteration';
