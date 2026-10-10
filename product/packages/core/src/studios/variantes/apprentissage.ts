import { libelleCoutTexteEstime } from '../../depense-prudente';
/**
 * Studios · L4-C · boucle d'apprentissage (cahier 01 §4.8, recette FLOW-09).
 *
 * Pur. Lit le résultat d'un test À PARTIR DES RÈGLES ADSMAP EXISTANTES, sans en
 * écrire de nouvelles :
 *
 *  · le verdict vient du moteur Adsmap (`computeVerdict`, stocké dans
 *    `adsmap_verdicts`) · c'est lui qui applique le minimum d'effectif (dépense
 *    ≥ n × CPA cible OU impressions ≥ seuil) et l'intervalle unilatéral qui doit
 *    tenir la cible · « comparer à la référence, jamais à zéro » ;
 *  · un verdict non comparable est ramené à « prometteuse relative » par
 *    `verdictEffectif` ;
 *  · la variable suivante vient de `proposeIterations` (gel des étapes acquises,
 *    deux essais au plus par variable).
 *
 * Ce module ajoute seulement ce que la variante apporte : la RÉFÉRENCE est la
 * variante parente quand il y en a une (son verdict au protocole), et une
 * variable n'est jamais créditée si plusieurs champs créatifs ont changé.
 *
 * Données insuffisantes, non comparables, sans référence, variable non isolée
 * ⇒ « inconclusif », dit comme tel. Le silence est une conclusion valable.
 * Une association avant/après n'est jamais présentée comme une cause certaine.
 */

import { verdictEffectif, type VerdictValue, type FunnelStage, type KillReason, type TestedVariable } from '../../adsmap/types';
import { proposeIterations } from '../../adsmap/iterate';
import { LIBELLE_VERDICT } from '../../adsmap/verdict-libelle';
import { libelleVariable, type StatutIsolation } from './test';
import { costOfTokens } from '../../spend-guard';

export interface VerdictLu {
  computed: VerdictValue | null;
  validated: VerdictValue | null;
  comparable: boolean;
  failedStage: FunnelStage | null;
  killFlag: KillReason | null;
  /** Fraîcheur · date du dernier calcul (ISO). */
  computedAt: string | null;
}

export type Conclusion = 'inconclusif' | 'soutenue' | 'non_soutenue';
export type MotifLecture =
  | 'aucun_resultat' | 'donnees_insuffisantes' | 'non_comparable' | 'variable_non_isolee'
  | 'reference_absente' | 'meme_niveau' | 'meilleure_que_parente' | 'moins_bonne_que_parente'
  | 'tient_les_reperes' | 'sous_les_reperes';

export interface EntreeLecture {
  variable: TestedVariable;
  isolation: StatutIsolation;
  verdict: VerdictLu | null;
  /** Verdict de la variante parente, s'il y a une parente (même avec `null` = pas encore mesurée). */
  parent: { verdict: VerdictLu | null } | null;
  lignee?: { profondeur: number; variablesChangees: TestedVariable[] };
}

export interface Lecture {
  conclusion: Conclusion;
  motif: MotifLecture;
  phrase: string;
  /** Verdict Adsmap effectif de la variante (après prise en compte de la comparabilité). */
  verdictEffectif: VerdictValue | null;
  reference: 'parente' | 'reperes_marque';
  /** Variable du prochain brief · la même tant que le test n'a rien tranché. */
  variableSuivante: TestedVariable;
  garderVariable: boolean;
  /** Toujours dit · une association mesurée n'est pas une preuve causale. */
  prudence: string;
}

/** Ordre de force des verdicts absolus · le seul usage de la comparaison à la parente. */
const FORCE: Partial<Record<VerdictValue, number>> = { winner: 3, baby_winner: 2, loser: 0 };
const NON_CONCLUANTS: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['inconclusive', 'insufficient_delivery']);

export const PRUDENCE_CAUSALE = 'Résultat mesuré sur une période et une diffusion précises · une association, pas une preuve de cause.';

function effectif(v: VerdictLu | null): VerdictValue | null {
  if (!v) return null;
  return verdictEffectif(v.validated ?? v.computed, v.comparable);
}

function suivante(e: EntreeLecture, eff: VerdictValue, v: VerdictLu): TestedVariable {
  const p = proposeIterations({
    adId: 'variante', label: '', verdict: eff, comparable: v.comparable, failedStage: v.failedStage, killFlag: v.killFlag,
    testedVariable: e.variable, lineageDepth: e.lignee?.profondeur ?? 0, lineageChanged: e.lignee?.variablesChangees ?? [],
  });
  return p[0]?.changedVariable ?? e.variable;
}

export function lireResultat(e: EntreeLecture): Lecture {
  const nom = libelleVariable(e.variable);
  const reference: Lecture['reference'] = e.parent ? 'parente' : 'reperes_marque';
  const inconclusif = (motif: MotifLecture, phrase: string, eff: VerdictValue | null): Lecture => ({
    conclusion: 'inconclusif', motif, phrase, verdictEffectif: eff, reference,
    variableSuivante: e.variable, garderVariable: true, prudence: PRUDENCE_CAUSALE,
  });

  const v = e.verdict;
  const eff = effectif(v);
  if (!v || !eff) return inconclusif('aucun_resultat', 'Inconclusif · aucun résultat mesuré pour ce test. Le prochain brief garde la même variable.', null);
  if (NON_CONCLUANTS.has(eff)) {
    return inconclusif('donnees_insuffisantes', `Inconclusif · ${LIBELLE_VERDICT[eff].court.toLowerCase()} : pas assez de données au regard des seuils de la marque. Le prochain brief garde ${nom}.`, eff);
  }
  if (!v.comparable || eff === 'relative_winner') {
    return inconclusif('non_comparable', `Inconclusif · le protocole n’a pas été respecté, la comparaison n’est que relative. Le prochain brief garde ${nom}.`, eff);
  }
  if (e.isolation === 'plusieurs' || e.isolation === 'aucun') {
    return inconclusif('variable_non_isolee', e.isolation === 'plusieurs'
      ? `Inconclusif pour ${nom} · plusieurs champs ont changé depuis la parente, le résultat ne lui est pas attribuable.`
      : `Inconclusif pour ${nom} · rien n’a changé depuis la parente, l’écart viendrait du tirage.`, eff);
  }

  const vs = suivante(e, eff, v);
  const conclu = (conclusion: Exclude<Conclusion, 'inconclusif'>, motif: MotifLecture, phrase: string): Lecture => ({
    conclusion, motif, phrase, verdictEffectif: eff, reference, variableSuivante: vs, garderVariable: vs === e.variable, prudence: PRUDENCE_CAUSALE,
  });

  if (e.parent) {
    const pv = e.parent.verdict;
    const peff = effectif(pv);
    if (!pv || !peff || !pv.comparable || FORCE[peff] === undefined) {
      return inconclusif('reference_absente', `Inconclusif · la variante parente n’a pas de résultat comparable, il n’y a pas de référence pour juger ${nom}.`, eff);
    }
    const f = FORCE[eff];
    const fp = FORCE[peff]!;
    if (f === undefined || f === fp) {
      return inconclusif('meme_niveau', `Inconclusif · même niveau que la parente (${LIBELLE_VERDICT[peff].court.toLowerCase()}) : pas d’effet démontré de ${nom}.`, eff);
    }
    return f > fp
      ? conclu('soutenue', 'meilleure_que_parente', `Hypothèse soutenue · ${LIBELLE_VERDICT[eff].court.toLowerCase()} contre ${LIBELLE_VERDICT[peff].court.toLowerCase()} pour la parente, en changeant ${nom} seule.`)
      : conclu('non_soutenue', 'moins_bonne_que_parente', `Hypothèse non soutenue · ${LIBELLE_VERDICT[eff].court.toLowerCase()} contre ${LIBELLE_VERDICT[peff].court.toLowerCase()} pour la parente.`);
  }

  if (eff === 'winner' || eff === 'baby_winner') return conclu('soutenue', 'tient_les_reperes', `Hypothèse soutenue · ${LIBELLE_VERDICT[eff].court.toLowerCase()} au protocole, face aux seuils de la marque.`);
  return conclu('non_soutenue', 'sous_les_reperes', 'Hypothèse non soutenue · perdante au protocole, face aux seuils de la marque.');
}

/* ─────────────────────── Arbitrage de la relecture IA ─────────────────────── */

export type VerdictRelecture = 'supported' | 'not_supported' | 'inconclusive';

export interface Arbitrage {
  conclusion: Conclusion;
  /** Vrai quand le modèle a été suivi · faux quand la règle l'a ramené à « inconclusif ». */
  modeleSuivi: boolean;
  ecart: string | null;
}

const DE_MODELE: Record<VerdictRelecture, Conclusion> = { supported: 'soutenue', not_supported: 'non_soutenue', inconclusive: 'inconclusif' };

/**
 * La règle pure prime sur le modèle. Le modèle peut être PLUS prudent (dire
 * inconclusif) ; il ne peut jamais conclure là où les données ne le permettent
 * pas, ni contredire la règle sans que la conclusion redevienne « inconclusif ».
 */
export function arbitrerRelecture(regle: Lecture, modele: VerdictRelecture): Arbitrage {
  const m = DE_MODELE[modele];
  if (regle.conclusion === 'inconclusif') {
    return { conclusion: 'inconclusif', modeleSuivi: m === 'inconclusif', ecart: m === 'inconclusif' ? null : 'La relecture concluait, mais les données ne le permettent pas · la conclusion reste « inconclusif ».' };
  }
  if (m === 'inconclusif') return { conclusion: 'inconclusif', modeleSuivi: true, ecart: null };
  if (m !== regle.conclusion) return { conclusion: 'inconclusif', modeleSuivi: false, ecart: 'La relecture et la règle de mesure divergent · la conclusion reste « inconclusif ».' };
  return { conclusion: m, modeleSuivi: true, ecart: null };
}

/* ───────────────────────────── Prochain brief ────────────────────────────── */

export type PreparationIteration =
  | { ok: true; brief: Record<string, unknown>; sourceIds: string[] }
  | { ok: false; raison: string };

const objet = (x: unknown): Record<string, unknown> | null => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : null);

/**
 * Le brief enfant · copie EXACTE du brief de la version de la variante (faits et
 * leurs sources, références, hypothèse, invariants, exclusions), dont seule la
 * variable testée est posée. Aucune génération : c'est un brief à relire.
 */
export function briefIteration(briefParent: unknown, variable: TestedVariable): PreparationIteration {
  const b = objet(briefParent);
  if (!b) return { ok: false, raison: 'La version de cette variante n’a pas de brief · écris-le avant d’itérer.' };
  const copie = JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
  copie.testedVariable = variable;
  if (Array.isArray(copie.variables) && !copie.variables.includes(variable)) copie.variables = [...copie.variables, variable];
  const sources = new Set<string>();
  if (Array.isArray(copie.facts)) {
    for (const f of copie.facts) {
      const o = objet(f);
      if (o && Array.isArray(o.sourceIds)) for (const s of o.sourceIds) if (typeof s === 'string' && s) sources.add(s);
    }
  }
  return { ok: true, brief: copie, sourceIds: [...sources].sort() };
}

/* ─────────────────────────── Coût d'une relecture ────────────────────────── */

/**
 * Plafond d'une relecture IA, AVANT le clic · même budget que le résolveur
 * (24 000 jetons de contexte, 4 000 de sortie) au tarif du modèle servi.
 * Pessimiste par construction (`estimateCallCost`) : il sert à annoncer et à
 * refuser, jamais à facturer. Arrondi au centime supérieur. Jamais zéro.
 */
export const BUDGET_RELECTURE = { jetonsEntree: 24_000, jetonsSortie: 4_000 } as const;

export function coutMaxRelectureUsd(modele: string): number {
  const brut = costOfTokens(modele, BUDGET_RELECTURE.jetonsEntree, BUDGET_RELECTURE.jetonsSortie);
  return Math.max(0.01, Math.ceil(brut * 100) / 100);
}

export function libelleCoutRelecture(usd: number): string {
  return `${libelleCoutTexteEstime(usd)} sur le plafond IA, aucun crédit`;
}
