/**
 * Économie des crédits · coût réel fournisseur -> prix de revente.
 *
 * Règle maison (v1) : on facture le client au COÛT API RÉEL × 3 (marge cible).
 * Le multiplicateur est réglable via la variable d'environnement CREDIT_MARKUP.
 *
 * 1 crédit ≈ 0,05 € de valeur de revente (aligné sur le plan Core : 99 € / 2000 crédits).
 * Les coûts réels ci-dessous sont des ESTIMATIONS de première passe (moyennes constatées
 * chez les fournisseurs), volontairement centralisées ici pour être ajustées facilement.
 */
import type { CreditAction } from './credits';
import { CREDIT_COSTS } from './credits';

/** Valeur de revente d'un crédit, en euros (référence : plan Core 99 € / 2000 crédits). */
export const CREDIT_EUR = 0.05;

/** Marge cible par défaut appliquée au coût réel (× coût API). */
export const DEFAULT_MARKUP = 3;

/** Frais de paiement (Stripe : ~2,9 % + 0,30 € par transaction). */
export const PAYMENT_FEE_PCT = 0.029;
export const PAYMENT_FEE_FIXED_EUR = 0.30;

/** Taux d'impôt sur les sociétés (SAS · France) · réglable via CORPORATE_TAX_RATE. */
export const IS_REDUCED = 0.15;   // jusqu'à 42 500 € de bénéfice (sous conditions)
export const IS_NORMAL = 0.25;    // au-delà
export function corporateTaxRate(): number {
  const v = Number(process.env.CORPORATE_TAX_RATE);
  if (Number.isFinite(v) && v > 0 && v < 1) return v;
  return IS_NORMAL;
}

/** Multiplicateur de marge effectif (réglable via CREDIT_MARKUP, borné à [1, 20]). */
export function creditMarkup(): number {
  const v = Number(process.env.CREDIT_MARKUP);
  if (Number.isFinite(v) && v > 0) return Math.min(20, Math.max(1, v));
  return DEFAULT_MARKUP;
}

export interface CostItem {
  action: CreditAction;
  label: string;        // libellé FR
  provider: string;     // fournisseur + modèle
  realEur: number;      // coût API réel estimé (€) par unité d'action
  unit: string;         // unité facturée (1 image, 1 vidéo 5 s, 1 min…)
  note?: string;        // précision éventuelle
}

/**
 * Coûts réels estimés par action (€ HT / unité). Première passe · à affiner avec les
 * factures réelles Fal / Anthropic. Modifiable ici sans toucher au reste du code.
 */
export const COST_MODEL: CostItem[] = [
  { action: 'video',            label: 'Vidéo IA',            provider: 'Fal · Kling 2.5 turbo pro',       realEur: 0.35,  unit: 'vidéo 5 s', note: 'Coût constaté : ~0,35 € par clip de 5 s.' },
  { action: 'image',            label: 'Image / scène IA',    provider: 'Fal · Nano Banana 2 (Gemini)',    realEur: 0.039, unit: 'image',     note: 'Modèle d’édition produit le plus fidèle.' },
  { action: 'clone_image',      label: 'Clone de pub',        provider: 'Anthropic vision + Fal · Nano',   realEur: 0.06,  unit: 'variation', note: 'Analyse de la pub source + regénération.' },
  { action: 'review_mining',    label: 'Analyse d’avis',      provider: 'Anthropic · Claude',              realEur: 0.14,  unit: 'analyse',   note: 'Lecture + synthèse de nombreux avis.' },
  { action: 'report',           label: 'Rapport',             provider: 'Anthropic · Claude',              realEur: 0.09,  unit: 'rapport' },
  { action: 'brief',            label: 'Brief créatif',       provider: 'Anthropic · Claude',              realEur: 0.03,  unit: 'brief' },
  { action: 'script',           label: 'Script vidéo',        provider: 'Anthropic · Claude',              realEur: 0.035, unit: 'script' },
  { action: 'tag_video',        label: 'Tag vidéo (IA)',      provider: 'Anthropic vision',                realEur: 0.02,  unit: 'vidéo' },
  { action: 'tag_image',        label: 'Tag image (IA)',      provider: 'Anthropic vision',                realEur: 0.008, unit: 'image' },
  { action: 'transcription_min',label: 'Transcription',       provider: 'ASR (Whisper-class)',             realEur: 0.006, unit: 'minute' },
  { action: 'chat',             label: 'Assistant (message)', provider: 'Anthropic · Claude',              realEur: 0.006, unit: 'message' },
  { action: 'suggest',          label: 'Suggestion IA',       provider: 'Anthropic · Claude',              realEur: 0.005, unit: 'suggestion', note: 'Angle, brief image/vidéo proposé par l’IA.' },
  { action: 'score',            label: 'Score Jarvis',        provider: 'Anthropic · Claude',              realEur: 0.012, unit: 'évaluation', note: 'Évaluation performance d’une créa par Jarvis.' },
];

/* ============ Catalogue de modèles image · coût réel -> crédits par variante ============ */

export interface ImageModelSpec {
  key: string;          // identifiant interne
  label: string;        // nom affiché
  falModel: string;     // modèle Fal (env-surchargable côté intégration)
  realEur: number;      // coût API réel estimé par image
  credits: number;      // crédits facturés par variante (≈ réel × markup)
  note: string;         // description courte
  recommended?: boolean;
  supportsRef?: boolean; // gère les images de référence (produit / clone)
}

/**
 * Modèles d'image proposés à l'utilisateur, avec un prix en crédits calé sur leur coût réel.
 * Le nombre de crédits suit la même logique que le reste (coût réel × marge), arrondi.
 */
export const IMAGE_MODELS: ImageModelSpec[] = [
  { key: 'nano',         label: 'Nano Banana 2',       falModel: 'fal-ai/nano-banana-2/edit', realEur: 0.039, credits: 4,  note: 'Fidélité produit · idéal pubs', recommended: true, supportsRef: true },
  { key: 'nano_high',    label: 'Nano Banana 2 · Haute', falModel: 'fal-ai/nano-banana-2/edit', realEur: 0.09, credits: 8, note: 'Détail & cohérence renforcés', supportsRef: true },
  { key: 'flux_kontext', label: 'FLUX Pro · Kontext',  falModel: 'fal-ai/flux-pro/kontext',   realEur: 0.04,  credits: 4,  note: 'Style précis avec références', supportsRef: true },
  { key: 'ideogram',     label: 'Ideogram v3',         falModel: 'fal-ai/ideogram/v3',        realEur: 0.06,  credits: 6,  note: 'Texte net dans l’image' },
  { key: 'seedream',     label: 'Seedream v4',         falModel: 'fal-ai/bytedance/seedream/v4', realEur: 0.02, credits: 2, note: 'Rapide & net · pubs produit', supportsRef: true },
];

export function imageModelByKey(key?: string | null): ImageModelSpec {
  return IMAGE_MODELS.find((m) => m.key === key) || IMAGE_MODELS[0]!;
}

export interface CostAnalysis extends CostItem {
  credits: number;         // crédits actuellement facturés (barème)
  resaleEur: number;       // prix de revente actuel (crédits × CREDIT_EUR)
  marginX: number;         // marge actuelle = resale / réel
  recommendedCredits: number; // crédits recommandés pour atteindre la marge cible
  aligned: boolean;        // le barème actuel est-il proche de la cible (±20 %) ?
}

/** Croise le barème de crédits avec le coût réel et la marge cible. */
export function analyzeCosts(markup = creditMarkup()): CostAnalysis[] {
  return COST_MODEL.map((c) => {
    const credits = CREDIT_COSTS[c.action] ?? 0;
    const resaleEur = credits * CREDIT_EUR;
    const marginX = c.realEur > 0 ? resaleEur / c.realEur : 0;
    const recommendedCredits = Math.max(1, Math.ceil((c.realEur * markup) / CREDIT_EUR));
    const aligned = credits > 0 && Math.abs(credits - recommendedCredits) / recommendedCredits <= 0.2;
    return { ...c, credits, resaleEur, marginX, recommendedCredits, aligned };
  });
}

export interface PlanEconomics {
  plan: string;
  priceEur: number;
  credits: number;
  pricePerCreditEur: number;   // prix payé par crédit
  realCostCeilingEur: number;  // coût réel max si 100 % des crédits consommés (au markup)
  grossMarginPct: number;      // marge brute si allocation pleinement consommée
}

/** Économie d'un plan : marge brute si toute l'allocation est consommée au markup. */
export function analyzePlan(plan: string, priceEur: number, credits: number, markup = creditMarkup()): PlanEconomics {
  const pricePerCreditEur = credits > 0 ? priceEur / credits : 0;
  // Coût réel « plancher » = revente / markup (puisque revente = coût réel × markup).
  const realCostCeilingEur = (credits * CREDIT_EUR) / markup;
  const grossMarginPct = priceEur > 0 ? Math.round((1 - realCostCeilingEur / priceEur) * 100) : 0;
  return { plan, priceEur, credits, pricePerCreditEur, realCostCeilingEur, grossMarginPct };
}

/* ============ Rentabilité · analyse « chef d'entreprise » ============ */

export interface PlanRisk {
  plan: string;
  priceEur: number;
  credits: number;
  bestMarginPct: number;     // meilleur cas (action la mieux margée)
  worstMarginPct: number;    // pire cas (toute l'allocation sur l'action la moins margée)
  worstAction: string;       // l'action qui plombe la marge
  worstRealCostEur: number;  // coût réel dans le pire cas
  recommendedPriceEur: number; // prix conseillé pour tenir la marge cible même au pire cas
  healthy: boolean;          // pire cas ≥ marge cible ?
}

/**
 * Marge « plancher » d'un plan : si le client dépense TOUTE son allocation sur l'action
 * la moins rentable (souvent la vidéo), quelle marge reste-t-il ? C'est le vrai garde-fou.
 */
export function analyzePlanRisk(plan: string, priceEur: number, credits: number, targetMarginPct = 70): PlanRisk {
  const perAction = COST_MODEL.map((c) => {
    const unitCredits = CREDIT_COSTS[c.action] || 1;
    const units = credits / unitCredits;
    const realCost = units * c.realEur;
    const marginPct = priceEur > 0 ? Math.round((1 - realCost / priceEur) * 100) : 100;
    return { action: c.label, realCost, marginPct };
  });
  const worst = perAction.reduce((m, x) => (x.marginPct < m.marginPct ? x : m), perAction[0]!);
  const best = perAction.reduce((m, x) => (x.marginPct > m.marginPct ? x : m), perAction[0]!);
  const recommendedPriceEur = priceEur === 0 ? 0 : Math.max(priceEur, Math.ceil(worst.realCost / (1 - targetMarginPct / 100)));
  return {
    plan, priceEur, credits,
    bestMarginPct: best.marginPct, worstMarginPct: worst.marginPct, worstAction: worst.action,
    worstRealCostEur: worst.realCost, recommendedPriceEur,
    healthy: priceEur === 0 || worst.marginPct >= targetMarginPct,
  };
}

/** Actions dont le barème s'écarte de la marge cible (à corriger). */
export function repricingSuggestions(markup = creditMarkup()): CostAnalysis[] {
  return analyzeCosts(markup).filter((a) => !a.aligned);
}

/* ============ Marge NETTE · « combien on gagne vraiment » (SAS France) ============ */

export interface PlanNet {
  plan: string;
  priceEur: number;        // prix HT / mois
  apiCostEur: number;      // coût API estimé (si allocation pleinement consommée, au markup)
  paymentFeeEur: number;   // frais de paiement (Stripe)
  grossEur: number;        // marge brute € = prix - coût API - frais paiement
  grossPct: number;
  taxEur: number;          // impôt sur les sociétés (IS) sur le bénéfice
  netEur: number;          // marge NETTE € (ce qu'on garde après IS)
  netPct: number;
}

/**
 * Marge nette par formule : prix - coût API - frais de paiement, puis IS (SAS France).
 * Donne « combien on gagne vraiment » par abonnement, une fois toutes les charges directes
 * et l'impôt société déduits. La TVA (20 %) est collectée puis reversée : neutre sur la marge.
 */
export function analyzePlanNet(plan: string, priceEur: number, credits: number, markup = creditMarkup(), taxRate = corporateTaxRate()): PlanNet {
  const apiCostEur = (credits * CREDIT_EUR) / markup;
  const paymentFeeEur = priceEur > 0 ? priceEur * PAYMENT_FEE_PCT + PAYMENT_FEE_FIXED_EUR : 0;
  const grossEur = priceEur - apiCostEur - paymentFeeEur;
  const taxEur = Math.max(0, grossEur) * taxRate;
  const netEur = grossEur - taxEur;
  return {
    plan, priceEur, apiCostEur, paymentFeeEur,
    grossEur, grossPct: priceEur > 0 ? Math.round((grossEur / priceEur) * 100) : 0,
    taxEur, netEur, netPct: priceEur > 0 ? Math.round((netEur / priceEur) * 100) : 0,
  };
}
