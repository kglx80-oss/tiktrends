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

// ── Du test au brief (lot I2) ────────────────────────────────────────────────
//
// Un test arbitré GAGNANT, avec ce que l'équipe en a appris, ouvre le Studio sur
// un brief d'itération prérempli. Rien n'est généré ni enregistré à l'ouverture ·
// le brief pré-remplit le formulaire, et « Créer des pubs » reste le geste.
//
// Trois natures, jamais confondues à l'écran :
//   - MESURÉ · le verdict arbitré et ses chiffres (la régie a tranché) ;
//   - CONSIGNÉ · l'apprentissage écrit par l'équipe à l'arbitrage, et ce que le
//     test faisait varier (repris tel quel) ;
//   - SUGGÉRÉ · ce que l'outil propose pour la suite (hypothèse), à valider.
//
// Seuls l'angle et l'audience ont un champ de génération dans le Studio · ils
// sont préremplis, modifiables. L'hypothèse et la variable restent du contexte
// affiché (le Studio ne les transmet pas encore à la génération ni au suivi).

import { estGagnanteValidee, LIBELLE_VERDICT } from './adsmap/verdict-libelle';
import type { VerdictValue } from './adsmap/types';

/** Ce que le panneau d'un test sait déjà · lu par l'action existante, sans écrire. */
export interface TestSource {
  adId: string;
  variantCode: string;
  concept: string;
  angle: string | null;
  persona: string | null;
  personaId: string | null;
  verdictStatus: 'computed' | 'validated' | null;
  validated: VerdictValue | null;
  comparable: boolean;
  testedVariable: string | null;
  variableValue: string | null;
  metrics: { cpa: number | null; hookRate: number | null; ctr: number | null };
  learnings: Array<{ statement: string; confidence: number; scope: string }>;
}

export type NatureChamp = 'mesure' | 'consigne' | 'suggestion' | 'a_choisir';

export type BriefDepuisTest =
  | { eligible: false; motif: string }
  | {
      eligible: true;
      /** D'où vient le brief · lisible tel quel. */
      provenance: { titre: string; verdict: string; chiffres: string[] };
      apprentissages: Array<{ texte: string; confiance: number; portee: string }>;
      /** Les champs, chacun avec sa nature. */
      champs: {
        angle: { valeur: string; nature: 'consigne' };
        audience: { valeur: string; nature: 'consigne' } | null;
        variableTestee: { valeur: string; nature: 'consigne' } | null;
        hypothese: { valeur: string; nature: 'suggestion' };
        variableSuivante: { valeur: string; nature: 'a_choisir' };
      };
      /** Ce qui pré-remplit le formulaire du Studio (champs de génération existants). */
      prefill: { angle: string; personaId: string | null };
      /** Le brief au contrat commun · ce qui reste à compléter se lit par `champsManquants`. */
      brief: BriefIteration;
    };

/** Les variables testables d'Adsmap, en clair (mêmes mots que le panneau du test). */
export const LIBELLE_VARIABLE_TEST: Record<string, string> = {
  hook: 'Hook', opening_visual: 'Visuel d’ouverture', body: 'Corps', length: 'Durée', cta: 'CTA',
  format: 'Format', offer: 'Offre', landing: 'Landing', avatar_on_screen: 'Personne à l’écran',
  proof: 'Preuve', audio: 'Audio', angle: 'Angle', desire: 'Désir', none_control: 'Témoin',
};

const pct = (v: number | null) => (v === null ? null : `${(v * 100).toFixed(1)} %`);
const eur = (v: number | null) => (v === null ? null : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`);

/**
 * Le brief d'itération qu'un test ouvre dans le Studio, ou le motif pour lequel
 * il n'en ouvre pas. On n'itère que sur une gagnante ARBITRÉE et comparable
 * (règle d'itération d'Adsmap), et seulement si l'équipe a consigné ce qu'elle
 * en a appris · sans apprentissage, une « itération » ne partirait de rien.
 */
export function briefDepuisTest(t: TestSource): BriefDepuisTest {
  if (t.verdictStatus !== 'validated' || !t.validated) {
    return { eligible: false, motif: 'Ce test n’a pas de verdict arbitré · l’itération se décide sur le verdict.' };
  }
  if (!estGagnanteValidee(t.validated, t.comparable)) {
    return { eligible: false, motif: 'On n’itère que sur une gagnante arbitrée au protocole · ce test repart en nouveau concept, sans descendance.' };
  }
  const apprentissages = t.learnings
    .map((l) => ({ texte: (l.statement ?? '').trim(), confiance: l.confidence, portee: l.scope }))
    .filter((l) => l.texte);
  if (!apprentissages.length) {
    return { eligible: false, motif: 'Aucun apprentissage consigné sur ce test · l’itération part de ce qu’il a appris.' };
  }

  const angle = (t.angle ?? '').trim() || t.concept.trim();
  const chiffres = [
    eur(t.metrics.cpa) && `CPA ${eur(t.metrics.cpa)}`,
    pct(t.metrics.hookRate) && `accroche ${pct(t.metrics.hookRate)}`,
    pct(t.metrics.ctr) && `clic ${pct(t.metrics.ctr)}`,
  ].filter((x): x is string => !!x);
  const variableTestee = t.testedVariable
    ? `${LIBELLE_VARIABLE_TEST[t.testedVariable] ?? t.testedVariable}${t.variableValue?.trim() ? ` = « ${t.variableValue.trim()} »` : ''}`
    : null;
  const hypothese = `Garder ce qui a gagné (« ${apprentissages[0]!.texte} ») et ne faire varier qu’une seule variable.`;
  const titre = `Itération de ${t.variantCode} · ${t.concept}`;

  return {
    eligible: true,
    provenance: { titre, verdict: `${LIBELLE_VERDICT[t.validated].court} · verdict arbitré`, chiffres },
    apprentissages,
    champs: {
      angle: { valeur: angle, nature: 'consigne' },
      audience: t.persona ? { valeur: t.persona, nature: 'consigne' } : null,
      variableTestee: variableTestee ? { valeur: variableTestee, nature: 'consigne' } : null,
      hypothese: { valeur: hypothese, nature: 'suggestion' },
      variableSuivante: { valeur: 'À choisir · une seule, les autres restent fixes', nature: 'a_choisir' },
    },
    prefill: { angle, personaId: t.personaId },
    brief: normaliserBrief({
      sources: [titre],
      hypothese,
      variable: '',
      audience: t.persona ?? '',
    }),
  };
}

/** Paramètre d'URL du Studio qui ouvre un brief d'itération. */
export const PARAM_ITERATION = 'iter';

const UUID_ITER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** L'identifiant de test demandé par `?iter=` · retenu seulement bien formé. */
export function lireIterationDemandee(sp: Record<string, string | string[] | undefined>): string | null {
  const v = sp[PARAM_ITERATION];
  const brut = (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  return UUID_ITER.test(brut) ? brut.toLowerCase() : null;
}

/** Le lien du panneau d'un test vers le Studio, brief d'itération prérempli. */
export function lienIterationStudio(adId: string): string {
  return `/studio/ads?${PARAM_ITERATION}=${encodeURIComponent(adId)}`;
}
