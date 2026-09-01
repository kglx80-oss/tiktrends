/**
 * Est-ce que la mémoire de Jarvis améliore vraiment les résultats ?
 *
 * ── La question, et pourquoi elle est mal posée d'habitude ───────────────────
 *
 * On pourrait vouloir savoir QUELLE accroche injectée a produit la gagnante. On
 * ne peut pas : on tend huit exemples au modèle, il en sort une créa, et rien ne
 * dit lequel l'a inspirée. Prétendre attribuer serait fabriquer une causalité.
 *
 * La question honnête est celle-ci : **les créas générées AVEC la mémoire
 * gagnent-elles plus souvent que celles générées sans ?** C'est une comparaison
 * de deux groupes, elle se mesure, et elle répond exactement à « est-ce que
 * notre IA est meilleure ».
 *
 * ── Ce qui est mesuré, et ce qui ne l'est pas ────────────────────────────────
 *
 * Ce n'est pas une expérience contrôlée. Le groupe « sans mémoire » est
 * historiquement plus ancien : au début, la marque n'avait pas de verdicts, donc
 * pas de mémoire. Une marque qui progresse progresserait de toute façon.
 *
 * Le fichier refuse donc de conclure trop vite, et de deux manières : un
 * effectif minimal par groupe, et un intervalle de Wilson · si les deux
 * intervalles se chevauchent, l'écart observé ne prouve rien et on le dit.
 *
 * Pur : ni base, ni horloge.
 */

import { wilsonInterval } from './stats';

/** Ce qui a été injecté dans une génération · consigné au moment de générer. */
export interface MemoryUse {
  /** Mémoire mesurée (verdicts de la marque). */
  measured: boolean;
  /** Mémoire marché (créas concurrentes décrites). */
  market: boolean;
  /** Nombre d'accroches d'exemple injectées. */
  hooks: number;
}

/**
 * D'où vient la mémoire qu'on attribue à une ad.
 *
 * - `ad` · la génération est notée sur l'ad elle-même, le lien est certain ;
 * - `concept` · elle n'est notée que sur le concept, mais **une seule** ad y
 *   pend · le lien reste sans ambiguïté ;
 * - `ambiguous` · elle n'est notée que sur le concept et PLUSIEURS ads y pendent
 *   · on sait qu'une génération existe, pas laquelle a produit cette ad ;
 * - `none` · aucune génération · l'ad a été importée ou saisie à la main, elle
 *   n'a bénéficié d'aucune mémoire, et c'est un témoin légitime.
 */
export type MemoryOrigin = 'ad' | 'concept' | 'ambiguous' | 'none';

export interface AttributedAd {
  /** Ce dont la génération a bénéficié · `null` quand rien n'a été consigné. */
  memory: MemoryUse | null;
  /** Verdict arbitré de l'ad qui en est issue. */
  verdict: string | null;
  /** Solidité du lien génération → ad · voir `MemoryOrigin`. */
  origin: MemoryOrigin;
}

/**
 * Quelle génération a produit cette ad ?
 *
 * ── Pourquoi cette fonction existe ───────────────────────────────────────────
 *
 * Le lien a longtemps vécu sur le CONCEPT (`concepts.source_ref`). Or plusieurs
 * ads pendent au même concept · c'est même la règle, les variantes v1, v2, v3
 * sont exactement ça. Et la passerelle Studio réutilise un concept existant
 * quand le titre coïncide, sans toucher à son `source_ref`.
 *
 * Deux créas générées à six semaines d'écart, l'une sans mémoire et l'autre avec,
 * étaient donc attribuées à la MÊME génération · celle de la première.
 *
 * **Et l'erreur n'était pas neutre.** Les concepts anciens sont ceux d'avant la
 * mémoire : toute variante récente ajoutée sous l'un d'eux tombait dans le
 * groupe témoin. La mesure censée dire « est-ce que la mémoire aide » était
 * biaisée contre la réponse qu'elle cherchait.
 *
 * ── Ce qu'on refuse de faire ─────────────────────────────────────────────────
 *
 * Devant une ad qu'on ne sait pas rattacher, la tentation est de la compter
 * comme « sans mémoire ». C'est faux : on ignore ce qu'elle a reçu. Elle est
 * donc écartée des DEUX groupes · une inconnue rangée dans le témoin gonfle le
 * témoin d'exactement ce qu'on essaie de mesurer.
 */
export function memoryOrigin(input: {
  /** Génération notée sur l'ad · le lien direct. */
  adGenerationId: string | null;
  /** Génération notée sur le concept · le lien historique. */
  conceptGenerationId: string | null;
  /** Combien d'ads pendent à ce concept · décide si le lien historique tient. */
  adsUnderConcept: number;
}): { generationId: string | null; origin: MemoryOrigin } {
  if (input.adGenerationId) return { generationId: input.adGenerationId, origin: 'ad' };
  if (!input.conceptGenerationId) return { generationId: null, origin: 'none' };
  if (input.adsUnderConcept <= 1) return { generationId: input.conceptGenerationId, origin: 'concept' };
  return { generationId: null, origin: 'ambiguous' };
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const NON_CONCLUANTS = new Set(['inconclusive', 'insufficient_delivery']);

/**
 * Effectif minimal par groupe.
 *
 * Sous ce seuil, deux taux ne se comparent pas · ils se ressemblent ou pas, au
 * hasard. Plus haut que le seuil des statistiques par dimension (3) parce qu'on
 * compare ici DEUX taux, ce qui demande deux fois plus de matière.
 */
export const MIN_N_GROUP = 6;

export interface Group {
  n: number;
  wins: number;
  rate: number | null;
  /** Intervalle de confiance unilatéral bas · à quel point le taux est sûr. */
  lo: number;
  hi: number;
}

export interface AttributionResult {
  withMemory: Group;
  without: Group;
  /** Écart de taux, en points · null quand un groupe est trop mince. */
  liftPoints: number | null;
  /**
   * Vrai seulement si les deux intervalles ne se chevauchent PAS · c'est la
   * seule situation où l'écart observé vaut mieux qu'une impression.
   */
  conclusive: boolean;
  /**
   * Ads conclues qu'on n'a pas su rattacher à une génération précise · écartées
   * des deux groupes. Se dit, sinon la comparaison paraît porter sur tout.
   */
  excluded: number;
  summary: string;
}

/** Ce qui entre dans la comparaison · une inconnue n'est pas un témoin. */
const attribuable = (a: AttributedAd) => a.origin !== 'ambiguous';

function group(ads: AttributedAd[]): Group {
  // Une ad non concluante n'apprend rien et ne compte nulle part · même règle
  // que dans le tableau de Jarvis.
  const concluantes = ads.filter((a) => a.verdict && !NON_CONCLUANTS.has(a.verdict));
  const wins = concluantes.filter((a) => GAGNANTS.has(a.verdict!)).length;
  const n = concluantes.length;
  if (!n) return { n: 0, wins: 0, rate: null, lo: 0, hi: 1 };
  const ci = wilsonInterval(wins, n, 0.8);
  return { n, wins, rate: wins / n, lo: ci.lo, hi: ci.hi };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const pts = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} point(s)`;

/**
 * Compare les deux groupes.
 *
 * `hasMemory` définit l'appartenance : une génération compte comme « avec
 * mémoire » dès qu'elle a reçu quelque chose de mesuré ou d'exemples. Le marché
 * seul ne suffit pas · il ne dit rien de ce qui marche ICI, et l'inclure
 * diluerait ce qu'on cherche à mesurer.
 */
export function attributionStats(ads: AttributedAd[]): AttributionResult {
  const hasMemory = (a: AttributedAd) => !!a.memory && (a.memory.measured || a.memory.hooks > 0);

  const retenues = ads.filter(attribuable);
  const withMemory = group(retenues.filter(hasMemory));
  const without = group(retenues.filter((a) => !hasMemory(a)));

  // Ce qu'on a écarté se compte sur les mêmes ads que les groupes · une ad non
  // concluante n'aurait compté nulle part de toute façon, l'annoncer comme
  // « écartée faute de lien » ferait porter le chapeau à la mauvaise cause.
  const excluded = group(ads.filter((a) => !attribuable(a))).n;

  const assez = withMemory.n >= MIN_N_GROUP && without.n >= MIN_N_GROUP;
  const liftPoints = assez && withMemory.rate !== null && without.rate !== null
    ? withMemory.rate - without.rate
    : null;

  // Chevauchement des intervalles · c'est le test, et il est volontairement
  // sévère. Deux taux qui se touchent ne se départagent pas.
  const conclusive = assez && (withMemory.lo > without.hi || without.lo > withMemory.hi);

  return { withMemory, without, liftPoints, conclusive, excluded, summary: summarize(withMemory, without, liftPoints, conclusive) };
}

function summarize(a: Group, b: Group, lift: number | null, conclusive: boolean): string {
  if (a.n < MIN_N_GROUP && b.n < MIN_N_GROUP) {
    return `Pas encore de quoi comparer · il faut au moins ${MIN_N_GROUP} tests conclus dans chaque groupe, on en a ${a.n} et ${b.n}.`;
  }
  if (a.n < MIN_N_GROUP) {
    return `${a.n} créa(s) générées avec la mémoire ont été jusqu'au verdict · il en faut ${MIN_N_GROUP} pour comparer.`;
  }
  if (b.n < MIN_N_GROUP) {
    return `Toutes les créas récentes profitent de la mémoire · il n'y a plus assez de témoins (${b.n}) pour mesurer l'écart. C'est bon signe pour l'outil, ennuyeux pour la mesure.`;
  }

  const chiffres = `${pct(a.rate!)} avec mémoire (${a.wins}/${a.n}) contre ${pct(b.rate!)} sans (${b.wins}/${b.n})`;
  if (!conclusive) {
    return `${chiffres} · ${pts(lift!)}, mais les intervalles se chevauchent : l'écart ne prouve rien encore.`;
  }
  return lift! > 0
    ? `La mémoire fait gagner ${pts(lift!)} · ${chiffres}. L'écart tient hors des intervalles.`
    : `Attention · la mémoire fait PERDRE ${pts(-lift!)} : ${chiffres}. À creuser avant de continuer à s'en servir.`;
}

/* -------------------------------------------------------------------------- */
/*  Détail par composant                                                      */
/* -------------------------------------------------------------------------- */

export type MemoryPart = 'measured' | 'hooks' | 'market';

export interface PartResult { part: MemoryPart; withIt: Group; withoutIt: Group; liftPoints: number | null; conclusive: boolean }

/**
 * Le même test, composant par composant.
 *
 * Sert à répondre à « qu'est-ce qui aide vraiment » plutôt qu'à « est-ce que ça
 * aide ». Les groupes se recouvrent (une génération peut avoir les trois), donc
 * ces résultats ne s'additionnent pas · ce sont trois comparaisons distinctes,
 * chacune valable pour elle-même.
 */
export function attributionByPart(ads: AttributedAd[]): PartResult[] {
  const tests: Array<{ part: MemoryPart; has: (a: AttributedAd) => boolean }> = [
    { part: 'measured', has: (a) => !!a.memory?.measured },
    { part: 'hooks', has: (a) => (a.memory?.hooks ?? 0) > 0 },
    { part: 'market', has: (a) => !!a.memory?.market },
  ];

  const retenues = ads.filter(attribuable);

  return tests.map(({ part, has }) => {
    const withIt = group(retenues.filter(has));
    const withoutIt = group(retenues.filter((a) => !has(a)));
    const assez = withIt.n >= MIN_N_GROUP && withoutIt.n >= MIN_N_GROUP;
    return {
      part, withIt, withoutIt,
      liftPoints: assez && withIt.rate !== null && withoutIt.rate !== null ? withIt.rate - withoutIt.rate : null,
      conclusive: assez && (withIt.lo > withoutIt.hi || withoutIt.lo > withIt.hi),
    };
  });
}

export const PART_LABEL: Record<MemoryPart, string> = {
  measured: 'Verdicts de la marque',
  hooks: 'Accroches en exemple',
  market: 'Pratiques du marché',
};
