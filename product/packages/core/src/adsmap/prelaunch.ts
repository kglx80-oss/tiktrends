/**
 * Ce qu'on peut dire d'un concept AVANT de dépenser.
 *
 * ── Le manque que ce fichier comble ─────────────────────────────────────────
 *
 * `prelaunchScore` situait un concept sur les statistiques par DIMENSION :
 * mécanisme, format, type d'accroche. C'est utile et c'est abstrait. Il ignorait
 * les deux mémoires les plus concrètes qu'on ait accumulées :
 *
 *  - la bibliothèque d'accroches, qui sait qu'une phrase précise a déjà perdu ;
 *  - le marché, qui sait ce que font les concurrents qui tiennent.
 *
 * Or « ce concept a un profil défavorable » ne fait rien changer à personne,
 * quand « son accroche est celle qui a perdu deux fois ici » fait réécrire la
 * ligne. Le premier est un score, le second est une prise.
 *
 * ── Trois règles d'autorité, dans cet ordre ─────────────────────────────────
 *
 * 1. **Une accroche déjà réfutée l'emporte sur tout.** Un seul test perdu suffit
 *    à le dire · ce n'est pas une statistique, c'est un souvenir. Aucun profil
 *    favorable ne rachète le fait de reproposer ce qui vient d'échouer.
 * 2. **Les chiffres de la marque priment sur le marché.** Le marché ne déplace
 *    jamais la bande · il ajoute une remarque, jamais un verdict. Ce qu'on a payé
 *    pour apprendre vaut mieux que ce qu'on devine des autres (D25).
 * 3. **Ce qui manque se dit.** Un score calculé sur rien est plus dangereux qu'une
 *    absence de score, parce qu'il a l'air d'un score.
 *
 * Pur : ni base, ni horloge.
 */

import { prelaunchScore, type PrelaunchInput, type PrelaunchScore, type StatRow } from './brand-stats';
import { hookFingerprint, type HookEntry } from './hook-library';
import { significantRows, type MarketRow } from './market-stats';

export type FlagKind =
  | 'hook_refuted' | 'hook_proven' | 'hook_reused'
  | 'market_contradicts' | 'market_unexploited' | 'market_confirms';

export type FlagTone = 'stop' | 'warn' | 'good' | 'info';

export interface PrelaunchFlag {
  kind: FlagKind;
  tone: FlagTone;
  /** Phrase affichable telle quelle · dit le fait, pas l'étiquette. */
  message: string;
}

export interface PrelaunchBrief {
  score: PrelaunchScore;
  flags: PrelaunchFlag[];
  /**
   * Verdict d'ensemble. `stop` n'est pas un blocage technique · c'est une
   * position claire, et une position claire est ce qu'on attend d'un outil qui
   * a le droit de dire non.
   */
  recommendation: 'stop' | 'rework' | 'go' | 'unknown';
  summary: string;
}

/* -------------------------------------------------------------------------- */
/*  Rapprochement d'accroches                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Proximité entre deux accroches · indice de Jaccard sur les mots.
 *
 * Volontairement grossier. On ne cherche pas la similarité sémantique — un
 * modèle ferait mieux et coûterait un appel — mais à repérer qu'on repropose
 * une phrase déjà écrite avec deux mots changés.
 */
export function hookSimilarity(a: string, b: string): number {
  const A = new Set(hookFingerprint(a).split(' ').filter((w) => w.length > 2));
  const B = new Set(hookFingerprint(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Au-delà, deux formulations disent la même chose. */
export const SIMILAR_ENOUGH = 0.6;

export interface HookMatch { entry: HookEntry; similarity: number; exact: boolean }

/** La correspondance la plus forte, en privilégiant la preuve la plus lourde. */
export function findHookMatch(candidate: string, library: HookEntry[]): HookMatch | null {
  if (!candidate?.trim()) return null;
  const fp = hookFingerprint(candidate);
  if (!fp) return null;

  let best: HookMatch | null = null;
  for (const entry of library) {
    const exact = hookFingerprint(entry.text) === fp;
    const similarity = exact ? 1 : hookSimilarity(candidate, entry.text);
    if (similarity < SIMILAR_ENOUGH) continue;
    // À proximité comparable, une accroche réfutée l'emporte : c'est
    // l'information la plus coûteuse à ignorer.
    const mieux = !best
      || (entry.evidence === 'refuted' && best.entry.evidence !== 'refuted')
      || (entry.evidence === best.entry.evidence && similarity > best.similarity);
    if (mieux) best = { entry, similarity, exact };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  Brief                                                                     */
/* -------------------------------------------------------------------------- */

export interface PrelaunchContext {
  stats: StatRow[];
  globalRate: number | null;
  /** Bibliothèque d'accroches · sert le rapprochement le plus concret. */
  hooks?: HookEntry[];
  /** Parts d'usage du marché · ne déplacent jamais la bande. */
  market?: MarketRow[];
}

const DIM_FIELD: Record<string, keyof PrelaunchInput> = {
  hook_type: 'hookType', opening_type: 'openingType', format: 'format', length_bucket: 'lengthBucket',
};

/**
 * Compose l'avis complet.
 *
 * `candidateHook` est le texte de l'accroche envisagée · c'est lui qui porte le
 * signal le plus fort, et son absence est la principale raison pour laquelle
 * l'avis reste vague.
 */
export function prelaunchBrief(
  input: PrelaunchInput & { candidateHook?: string | null },
  ctx: PrelaunchContext,
): PrelaunchBrief {
  const score = prelaunchScore(input, ctx.stats, ctx.globalRate);
  const flags: PrelaunchFlag[] = [];

  // 1 · L'accroche envisagée, confrontée à ce qu'on a déjà écrit.
  const match = input.candidateHook ? findHookMatch(input.candidateHook, ctx.hooks ?? []) : null;
  if (match) {
    const proximite = match.exact ? 'exactement' : 'à peu de mots près';
    if (match.entry.evidence === 'refuted') {
      flags.push({
        kind: 'hook_refuted', tone: 'stop',
        message: `Cette accroche est ${proximite} celle qui a déjà perdu ici : « ${match.entry.text} ». La réécrire coûte moins cher que la retester.`,
      });
    } else if (match.entry.evidence === 'proven') {
      flags.push({
        kind: 'hook_proven', tone: 'good',
        message: `Cette accroche reprend ${proximite} une gagnante de la marque : « ${match.entry.text} ».`,
      });
    } else if (match.entry.evidence === 'market') {
      flags.push({
        kind: 'hook_reused', tone: 'warn',
        message: `Cette accroche est ${proximite} celle d’un concurrent : « ${match.entry.text} ». Reprends-en la mécanique, pas les mots.`,
      });
    }
  }

  // 2 · Le marché · une remarque, jamais un verdict.
  for (const row of significantRows(ctx.market ?? [])) {
    if (row.shareOfProven < 0.4) continue;
    const champ = DIM_FIELD[row.dimension];
    if (!champ) continue;
    const valeur = input[champ];
    const suit = typeof valeur === 'string' && valeur === row.key;

    const chiffre = `${Math.round(row.shareOfProven * 100)} % des créas qui tiennent sur ce marché`;
    const notre = ctx.stats.find((s) => s.dimension === row.dimension && s.key === row.key);

    if (suit && notre && notre.hitRate !== null && ctx.globalRate !== null && notre.hitRate < ctx.globalRate) {
      flags.push({
        kind: 'market_contradicts', tone: 'warn',
        message: `Ce concept suit le marché sur « ${row.key} » (${chiffre}), mais chez toi cette voie réussit moins que la moyenne. Le marché n’est pas tes chiffres.`,
      });
    } else if (!suit && (!notre || notre.nConclusive < 3)) {
      flags.push({
        kind: 'market_unexploited', tone: 'info',
        message: `« ${row.key} » représente ${chiffre} et tu ne l’as jamais assez testé · piste dont d’autres ont déjà payé l’entrée.`,
      });
    } else if (suit && notre && notre.hitRate !== null && ctx.globalRate !== null && notre.hitRate >= ctx.globalRate) {
      flags.push({
        kind: 'market_confirms', tone: 'good',
        message: `« ${row.key} » : ${chiffre}, et chez toi ça marche aussi.`,
      });
    }
  }

  return finalize(score, flags, !!input.candidateHook);
}

function finalize(score: PrelaunchScore, flags: PrelaunchFlag[], hadHook: boolean): PrelaunchBrief {
  // L'ordre d'affichage suit le coût de l'ignorer.
  const rang: Record<FlagTone, number> = { stop: 0, warn: 1, good: 2, info: 3 };
  flags.sort((a, b) => rang[a.tone] - rang[b.tone]);

  const stop = flags.find((f) => f.tone === 'stop');
  if (stop) {
    return {
      score, flags, recommendation: 'stop',
      summary: `Ne lance pas en l’état · ${stop.message}`,
    };
  }

  if (score.thin) {
    // Un profil sans historique n'est pas un mauvais profil · c'est un inconnu,
    // et un inconnu se teste. Le dire évite de bloquer une marque qui démarre.
    return {
      score, flags, recommendation: 'unknown',
      summary: hadHook
        ? 'Pas assez d’historique pour se prononcer · à traiter comme une piste neuve, ce qui est une raison de la tester, pas de l’écarter.'
        : 'Pas assez d’historique, et aucune accroche fournie · colle le texte envisagé pour un avis utile.',
    };
  }

  const alerte = flags.find((f) => f.tone === 'warn');
  if (score.band === 'low') {
    return {
      score, flags, recommendation: 'rework',
      summary: `À retravailler avant de dépenser · ${Math.round(score.pConclusiveWin * 100)} % de réussite attendue, sous ta moyenne.${alerte ? ` ${alerte.message}` : ''}`,
    };
  }
  if (alerte) {
    return {
      score, flags, recommendation: 'rework',
      summary: `Profil correct mais un point à corriger · ${alerte.message}`,
    };
  }

  const bon = flags.find((f) => f.tone === 'good');
  const chiffre = `${Math.round(score.pConclusiveWin * 100)} % de réussite attendue`;
  if (score.band === 'high') {
    return {
      score, flags, recommendation: 'go',
      summary: `Profil favorable · ${chiffre}.${bon ? ` ${bon.message}` : ''}`,
    };
  }
  return {
    score, flags, recommendation: 'go',
    summary: hadHook
      ? `Rien ne s’y oppose · ${chiffre}, dans ta moyenne.`
      : `Rien ne s’y oppose · ${chiffre}. Colle l’accroche envisagée pour un avis plus précis.`,
  };
}

export const RECOMMENDATION_LABEL: Record<PrelaunchBrief['recommendation'], string> = {
  stop: 'Ne pas lancer en l’état',
  rework: 'À retravailler',
  go: 'Rien ne s’y oppose',
  unknown: 'Piste neuve',
};
