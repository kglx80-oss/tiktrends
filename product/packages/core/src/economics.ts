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
];

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
