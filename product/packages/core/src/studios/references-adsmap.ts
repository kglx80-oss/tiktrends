/**
 * Studios · références de PORTÉE vers le graphe Adsmap (persona, désir, angle,
 * concept), citées par le brief V5.
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Ce que ce module tient ───────────────────────────────────────────────────
 *
 * La LECTURE des lignes Adsmap vit dans un résolveur INJECTÉ (une lib serveur,
 * en lecture seule, hors de ce module). Ici ne vit que la RÈGLE : une référence
 * citée par le brief doit se résoudre ET tomber dans la portée workspace+marque
 * du projet, sinon refus.
 *
 * Le refus est INDISTINCT (absente ou hors portée · même raison, même chemin),
 * exactement comme le `NOT_FOUND` de `portee.ts` : il ne dit jamais pourquoi,
 * pour ne rien révéler d'une autre marque. Un résolveur lui-même cantonné à la
 * session rend donc « inconnue » et « d'une autre marque » indiscernables, ce
 * qui est le but.
 *
 * Le libellé d'une `ReferenceAdsmap` est FIGÉ au moment du choix (un instantané
 * stocké dans le brief) : il n'est JAMAIS comparé à la ligne vivante, qui a pu
 * être renommée depuis. On valide l'existence et la portée, pas le libellé.
 *
 * Aucune écriture : résoudre une référence ne touche à rien.
 */

export type KindReferenceAdsmap = 'persona' | 'desir' | 'angle' | 'concept';

export const KINDS_REFERENCE_ADSMAP: readonly KindReferenceAdsmap[] = ['persona', 'desir', 'angle', 'concept'];

/** Référence de portée · identifiant de la ligne Adsmap + libellé figé au choix. */
export interface ReferenceAdsmap {
  id: string;
  label: string;
}

/** Portée effective d'une ligne Adsmap (ou du projet citant). */
export interface PorteeAdsmap {
  workspaceId: string;
  brandId: string;
}

/**
 * Lecture seule, injectée · rend la portée effective de la ligne Adsmap, ou
 * `null` si elle est inconnue du résolveur. Le résolveur côté serveur remonte la
 * chaîne (désir → persona, angle → désir → persona, concept → angle → …) pour
 * livrer la marque effective ; ce module ne fait que comparer.
 */
export interface ResolveurReferencesAdsmap {
  resoudre(kind: KindReferenceAdsmap, id: string): PorteeAdsmap | null;
}

export interface ViolationReferenceAdsmap {
  chemin: string;
  raison: string;
}

const ID_MAX = 160;
const LABEL_MAX = 12_000;
const estId = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= ID_MAX;

export const RAISON_REF_FORME = 'référence Adsmap attendue (identifiant et libellé)';
export const RAISON_REF_HORS_PORTEE = 'référence Adsmap absente ou hors de la portée de marque';

/** FORME d'une référence · `{ id, label }`, rien d'autre. Pur, sans résolveur. */
export function violationsFormeReferenceAdsmap(x: unknown, chemin: string): ViolationReferenceAdsmap[] {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return [{ chemin, raison: RAISON_REF_FORME }];
  const r = x as Record<string, unknown>;
  const v: ViolationReferenceAdsmap[] = [];
  for (const k of Object.keys(r)) if (k !== 'id' && k !== 'label') v.push({ chemin: `${chemin}/${k}`, raison: 'champ inconnu' });
  if (!estId(r.id)) v.push({ chemin: `${chemin}/id`, raison: 'identifiant attendu' });
  if (typeof r.label !== 'string' || r.label.length > LABEL_MAX) v.push({ chemin: `${chemin}/label`, raison: `libellé attendu (${LABEL_MAX} caractères au plus)` });
  return v;
}

/**
 * PORTÉE d'une référence résolue · absente du résolveur OU hors de la portée du
 * projet = le MÊME refus. Suppose la forme déjà valide.
 */
export function violationPorteeReferenceAdsmap(
  kind: KindReferenceAdsmap,
  ref: ReferenceAdsmap,
  chemin: string,
  scope: PorteeAdsmap,
  resolveur: ResolveurReferencesAdsmap,
): ViolationReferenceAdsmap | null {
  const ligne = resolveur.resoudre(kind, ref.id);
  if (!ligne || ligne.workspaceId !== scope.workspaceId || ligne.brandId !== scope.brandId) {
    return { chemin, raison: RAISON_REF_HORS_PORTEE };
  }
  return null;
}
