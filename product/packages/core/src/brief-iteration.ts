/**
 * Le BRIEF D'ITÉRATION · le contrat partagé de la boucle Analyse → Itération →
 * Création (CDC v6 · R13, S18).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Aujourd'hui le contexte d'une itération est ÉPARPILLÉ · l'hypothèse et la
 * variable vivent dans l'essai Adsmap, le produit/audience/offre dans la recette
 * du studio, l'indicateur dans la config de verdict, les sources dans la veille.
 * Chaque studio repart d'un brief vide, et rien ne rattache une création à
 * l'exact contexte qui l'a produite. Résultat · on ne peut pas comparer une
 * sortie à son brief, ni relier sa version aux KPI.
 *
 * Ce module NOMME et STRUCTURE ce brief, une fois, au noyau · pur, testable. La
 * persistance versionnée et le câblage des studios s'appuient dessus (tranches
 * suivantes). Il ne touche ni base ni réseau.
 *
 * ── Deux règles qui protègent la boucle ──────────────────────────────────────
 *
 * 1. **Un changement d'INVARIANT est une nouvelle expérience.** Toucher au
 *    produit, à l'audience, à l'offre ou aux éléments tenus fixes change ce
 *    qu'on mesure · la comparaison d'avant ne vaut plus. Ça exige une nouvelle
 *    version de brief, pas une édition silencieuse (`exigeNouvelleVersion`).
 * 2. **Un brief lié à une création MESURÉE est immuable.** On ne réécrit jamais
 *    a posteriori le contexte d'un résultat déjà tombé (`briefFige`).
 */

export interface BriefIteration {
  /** D'où vient l'hypothèse · veille, mesure, inspiration (traçabilité). */
  sources: string[];
  /** Ce qu'on teste · « une accroche courte convertit mieux ». */
  hypothese: string;
  /** Le SEUL levier qui varie entre les variantes · isolé pour être lisible. */
  variable: string;
  /** Ce qui est TENU constant · sans quoi la comparaison ne veut rien dire. */
  invariants: string[];
  /** Le produit concerné. */
  produit: string;
  /** L'audience visée. */
  audience: string;
  /** L'offre. */
  offre: string;
  /** L'indicateur qui tranche · « CPA sous 15 € ». */
  kpiCible: string;
}

/** Une chaîne propre, ou '' · tolère tout (nombre, null, objet). */
function txt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
/** Un tableau de chaînes propres · tolère une chaîne seule ou une forme cassée. */
function liste(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(txt).filter(Boolean);
  const s = txt(v);
  return s ? [s] : [];
}

/**
 * Le brief nettoyé · chaque champ est une forme sûre. Existe parce que le brief
 * vient d'un jsonb et d'un modèle · sans ce filtre, un `.map`/`.trim` sur la
 * mauvaise forme casserait le studio comme la génération.
 */
export function normaliserBrief(b?: Partial<BriefIteration> | null): BriefIteration {
  const o = (b && typeof b === 'object') ? (b as Record<string, unknown>) : {};
  return {
    sources: liste(o.sources),
    hypothese: txt(o.hypothese),
    variable: txt(o.variable),
    invariants: liste(o.invariants),
    produit: txt(o.produit),
    audience: txt(o.audience),
    offre: txt(o.offre),
    kpiCible: txt(o.kpiCible),
  };
}

/**
 * Les champs requis pour qu'un brief soit « prêt à produire » (CDC S09) ·
 * hypothèse, variable, éléments fixes, produit, offre, destination et indicateur.
 * Les sources sont recommandées mais n'empêchent pas de produire.
 */
export const CHAMPS_REQUIS_BRIEF = [
  'hypothese', 'variable', 'invariants', 'produit', 'audience', 'offre', 'kpiCible',
] as const;

export type ChampRequisBrief = (typeof CHAMPS_REQUIS_BRIEF)[number];

/** Les champs requis encore manquants · dans l'ordre, pour guider la complétion. */
export function champsManquants(b?: Partial<BriefIteration> | null): ChampRequisBrief[] {
  const n = normaliserBrief(b);
  return CHAMPS_REQUIS_BRIEF.filter((c) => (c === 'invariants' ? n.invariants.length === 0 : !n[c]));
}

/** Vrai si le brief porte tout ce qu'il faut pour produire (rien ne manque). */
export function briefPret(b?: Partial<BriefIteration> | null): boolean {
  return champsManquants(b).length === 0;
}

/**
 * Ce qui, en changeant, fait d'une itération une NOUVELLE EXPÉRIENCE · les
 * éléments fixes du test. Toucher à l'un d'eux invalide la comparaison précédente.
 */
const CLES_INVARIANTES = ['produit', 'audience', 'offre'] as const;

/**
 * Vrai si passer de `avant` à `apres` exige une NOUVELLE version de brief · un
 * invariant a bougé (produit, audience, offre) ou les éléments tenus fixes ont
 * changé. Reformuler l'hypothèse ou ajuster la variable testée ne l'exige pas ·
 * c'est la même expérience qui s'affine.
 */
export function exigeNouvelleVersion(avant?: Partial<BriefIteration> | null, apres?: Partial<BriefIteration> | null): boolean {
  const a = normaliserBrief(avant), b = normaliserBrief(apres);
  if (CLES_INVARIANTES.some((k) => a[k] !== b[k])) return true;
  // Les éléments fixes, comparés comme un ensemble ordonné-insensible.
  const set = (xs: string[]) => JSON.stringify([...xs].map((s) => s.toLowerCase()).sort());
  return set(a.invariants) !== set(b.invariants);
}

/**
 * Un brief est FIGÉ dès qu'une création MESURÉE s'y rattache · on ne réécrit
 * jamais a posteriori le contexte d'un résultat déjà tombé (CDC · versions
 * mesurées immuables). Éditer un brief figé doit créer une nouvelle version.
 */
export function briefFige(opts: { aUneCreationMesuree: boolean }): boolean {
  return !!opts.aUneCreationMesuree;
}
