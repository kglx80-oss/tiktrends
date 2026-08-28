/**
 * Plafond de dépense RÉELLE en dollars.
 *
 * À ne pas confondre avec les crédits (`credits.ts`). Les crédits sont une
 * comptabilité INTERNE : ce qu'on facture au client. Ce fichier parle d'autre
 * chose · l'argent qui part vraiment chez Anthropic et chez fal, et qui arrive
 * sur une facture à la fin du mois.
 *
 * La distinction n'est pas théorique : un compte fondateur a des crédits
 * illimités, et ses appels coûtent exactement le même prix que les autres. Le
 * plafond de ce fichier s'applique donc À TOUT LE MONDE, sans exception.
 *
 * Trois principes.
 *
 *  1. **Le plafond bloque, il n'avertit pas.** Un avertissement qu'on peut
 *     ignorer n'est pas une barrière · c'est ce qui produit les factures dont on
 *     découvre le montant.
 *  2. **Un modèle inconnu est présumé cher.** On ne connaît pas le tarif d'un
 *     modèle qu'on n'a pas répertorié · supposer qu'il est bon marché ferait
 *     fuir le plafond précisément le jour où quelqu'un change de modèle.
 *  3. **On estime AVANT, on réconcilie APRÈS.** L'estimation autorise ou refuse
 *     l'appel ; le coût réel, lu dans la réponse, corrige le compteur. Sans le
 *     second temps, le compteur dérive et le plafond ne veut plus rien dire.
 *
 * Pur : ni base, ni réseau, ni horloge.
 */

/** Tarifs en dollars par MILLION de jetons. */
export interface ModelRate { inputPerMTok: number; outputPerMTok: number }

/**
 * Tarifs connus.
 *
 * Volontairement conservateurs quand un doute existe : sous-estimer un tarif
 * revient à percer le plafond, le surestimer ne coûte qu'un appel refusé un peu
 * tôt. Le déséquilibre entre les deux erreurs commande le choix.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-opus-5': { inputPerMTok: 15, outputPerMTok: 75 },
  'claude-sonnet-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-fable-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, outputPerMTok: 5 },
};

/** Tarif appliqué à un modèle non répertorié · le plus cher qu'on connaisse. */
export const UNKNOWN_MODEL_RATE: ModelRate = { inputPerMTok: 15, outputPerMTok: 75 };

export function rateFor(model: string): ModelRate {
  const exact = MODEL_RATES[model];
  if (exact) return exact;
  // Correspondance par préfixe · les identifiants datés (« -20251001 ») ne
  // doivent pas basculer d'office sur le tarif inconnu.
  const prefix = Object.keys(MODEL_RATES).find((k) => model.startsWith(k) || k.startsWith(model));
  return prefix ? MODEL_RATES[prefix]! : UNKNOWN_MODEL_RATE;
}

/** Coût en dollars d'un appel, à partir des jetons réellement consommés. */
export function costOfTokens(model: string, inputTokens: number, outputTokens: number): number {
  const r = rateFor(model);
  const inp = Math.max(0, inputTokens) / 1_000_000 * r.inputPerMTok;
  const out = Math.max(0, outputTokens) / 1_000_000 * r.outputPerMTok;
  return Math.round((inp + out) * 1e6) / 1e6;
}

/**
 * Coût MAXIMAL d'un appel avant de le lancer.
 *
 * On ne connaît pas encore les jetons d'entrée · on borne par la taille du
 * prompt annoncée, et on suppose que la sortie atteint `max_tokens` en entier.
 * C'est volontairement pessimiste : l'estimation sert à refuser, pas à facturer.
 */
export function estimateCallCost(opts: {
  model: string;
  /** Longueur du prompt en caractères · convertie en jetons à ~3,5 car/jeton. */
  promptChars?: number;
  maxTokens: number;
}): number {
  const inputTokens = Math.ceil((opts.promptChars ?? 0) / 3.5);
  return costOfTokens(opts.model, inputTokens, Math.max(0, opts.maxTokens));
}

/** Coûts fixes des appels qui ne se comptent pas en jetons, en dollars. */
export const FIXED_COSTS = {
  /** Génération d'image · borne haute observée sur les modèles utilisés. */
  fal_image: 0.08,
  /** Génération vidéo · c'est le poste qui peut faire déraper une facture. */
  fal_video: 0.60,
} as const;

export type FixedCostKind = keyof typeof FIXED_COSTS;

/* -------------------------------------------------------------------------- */
/*  Décision                                                                  */
/* -------------------------------------------------------------------------- */

export interface BudgetState {
  /** Dépense déjà engagée sur la période, en dollars. */
  spentUsd: number;
  /** Plafond dur · au-delà, plus rien ne part. */
  capUsd: number;
}

export interface BudgetDecision {
  allowed: boolean;
  /** Ce qui reste après cet appel s'il est autorisé. */
  remainingUsd: number;
  /** Message affichable · dit le chiffre, pas « quota dépassé ». */
  reason: string;
  /** Vrai au-delà de 80 % du plafond · bandeau, pas blocage. */
  warning: boolean;
}

const usd = (n: number) => `${n.toFixed(2)} $`;

/**
 * Autorise ou refuse une dépense.
 *
 * Le refus dit le montant restant et le plafond en vigueur · « quota dépassé »
 * n'apprend rien et ne dit pas quoi faire.
 */
export function checkBudget(state: BudgetState, estimatedUsd: number): BudgetDecision {
  const spent = Math.max(0, state.spentUsd);
  const cap = Math.max(0, state.capUsd);
  const apres = spent + Math.max(0, estimatedUsd);
  const restant = Math.max(0, cap - spent);

  if (cap <= 0) {
    return {
      allowed: false, remainingUsd: 0, warning: true,
      reason: 'Plafond de dépense IA à zéro · aucune requête payante n’est envoyée. Relève AI_SPEND_CAP_USD pour autoriser.',
    };
  }
  if (apres > cap) {
    return {
      allowed: false, remainingUsd: restant, warning: true,
      reason: `Plafond de dépense atteint · ${usd(spent)} engagés sur ${usd(cap)}, et cet appel coûterait jusqu’à ${usd(estimatedUsd)}. Rien n’est envoyé.`,
    };
  }
  return {
    allowed: true, remainingUsd: cap - apres,
    warning: apres > cap * 0.8,
    reason: `${usd(apres)} sur ${usd(cap)} après cet appel.`,
  };
}

/** Phrase d'état pour les écrans · dit toujours le plafond, jamais un pourcentage seul. */
export function summarizeBudget(state: BudgetState): string {
  const cap = Math.max(0, state.capUsd);
  const spent = Math.max(0, state.spentUsd);
  if (cap <= 0) return 'Dépense IA bloquée · plafond à zéro.';
  const pct = Math.round((spent / cap) * 100);
  if (spent >= cap) return `Plafond atteint · ${usd(spent)} sur ${usd(cap)}. Plus aucune requête payante ne part.`;
  if (pct >= 80) return `${usd(spent)} sur ${usd(cap)} (${pct} %) · il reste ${usd(cap - spent)}.`;
  return `${usd(spent)} dépensés sur un plafond de ${usd(cap)}.`;
}
