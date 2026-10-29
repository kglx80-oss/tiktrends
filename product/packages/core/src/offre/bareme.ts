/**
 * L'offre · le barème en crédits par action et le coût réel de référence. Pur.
 *
 * ── Deux barèmes ─────────────────────────────────────────────────────────────
 *
 *  · le barème ACTUEL (`CREDIT_COSTS`, `credits.ts`) · celui que débitent les
 *    actions aujourd'hui. Il n'est pas réécrit ici, il est LU ;
 *  · le barème V2 · recalibré pour qu'un crédit coûte AU PLUS
 *    `BORNE_EUR_PAR_CREDIT` de coût fournisseur, QUELLE QUE SOIT l'action
 *    (décision du 29/10, point 3). La marge d'un forfait ne dépend alors plus de
 *    ce que l'abonné consomme : c'est ce qui rend la garde des marges
 *    (`marges.ts`) vraie au pire cas.
 *
 * Règle V2 d'une action à prix fixe :
 *   crédits = max(barème actuel (nouvelle unité), arrondi au multiple de 5
 *                 supérieur de ⌈coût € ÷ BORNE⌉)
 * Aucune action ne devient moins chère qu'aujourd'hui (le plancher), et
 * l'arrondi ne fait que BAISSER le coût par crédit.
 *
 * Règle V2 d'un appel à coût variable (appels texte des Studios, contrôle
 * visuel, relecture) · `creditsPourCoutUsdMicros(borne)`, la borne prouvée de
 * l'appel convertie au plus juste · le coût par crédit y vaut au plus la
 * borne, par construction.
 *
 * ── Les coûts ────────────────────────────────────────────────────────────────
 *
 * Prix publics des fournisseurs, en DOLLARS (`COST_MODEL.realEur` et
 * `IMAGE_MODELS.realEur` portent des dollars malgré leur nom · audit du 29/10,
 * incohérence 9). Convertis à `TAUX_USD_EUR`, une hypothèse : aucun taux n'est
 * lu en direct (le noyau est pur).
 */
import { CREDIT_COSTS, type CreditAction } from '../credits';
import { COST_MODEL, IMAGE_MODELS } from '../economics';
import { COST_PER_ANALYSIS_USD } from '../adsmap/radar';

/** 1 ancien crédit = 10 nouveaux (décision du 29/10, point 3). */
export const FACTEUR_UNITE = 10;

/** Hypothèse de change · 1 $ = 0,92 €. Une baisse de l'euro se lit dans la sensibilité (`marges.ts`). */
export const TAUX_USD_EUR = 0.92;

/** Un crédit (nouvelle unité) couvre au plus un dixième de centime de coût fournisseur. */
export const BORNE_EUR_PAR_CREDIT = 0.001;

/**
 * Crédits d'un appel dont le coût est BORNÉ (micro-dollars entiers) · au plus
 * juste, arrondi au-dessus. Calcul entier : ⌈µ$ × 0,92 / 1 000⌉ = ⌈µ$ × 23 / 25 000⌉.
 */
export function creditsPourCoutUsdMicros(usdMicros: number): number {
  const m = Math.max(0, Math.ceil(usdMicros));
  if (m === 0) return 0;
  return Math.ceil((m * 23) / 25_000);
}

/** Même calcul depuis des dollars (arrondis au micro-dollar supérieur). */
export function creditsPourCoutUsd(usd: number): number {
  return creditsPourCoutUsdMicros(Math.ceil(Math.max(0, usd) * 1_000_000 - 1e-6));
}

const arrondi5 = (n: number) => Math.ceil(n / 5) * 5;

/** Les actions à prix fixe du barème V2 · le barème actuel, plus les appels aujourd'hui gratuits. */
export type ActionBareme = CreditAction | 'jarvis_message' | 'brouillon_concept';

export interface CoutReference {
  /** Coût fournisseur par unité, en dollars. */
  usd: number;
  /** Fournisseur et d'où vient le chiffre. */
  source: string;
  /** `borne` : prouvée par le code ; `estimation` : à mesurer sur `ai_spend` (requête de l'audit, section 6). */
  nature: 'borne' | 'estimation';
}

const depuisModele = (a: CreditAction): CoutReference | null => {
  const c = COST_MODEL.find((x) => x.action === a);
  return c ? { usd: c.realEur, source: `COST_MODEL · ${c.provider}`, nature: 'estimation' } : null;
};

/** Coût de référence de chaque action · une action sans coût ne compile pas (`Record`). */
export const COUT_REFERENCE_ACTION: Readonly<Record<ActionBareme, CoutReference>> = {
  tag_video: depuisModele('tag_video')!,
  tag_image: depuisModele('tag_image')!,
  transcription_min: depuisModele('transcription_min')!,
  script: depuisModele('script')!,
  brief: depuisModele('brief')!,
  image: depuisModele('image')!,
  review_mining: depuisModele('review_mining')!,
  report: depuisModele('report')!,
  clone_image: depuisModele('clone_image')!,
  chat: depuisModele('chat')!,
  video: depuisModele('video')!,
  suggest: depuisModele('suggest')!,
  score: depuisModele('score')!,
  asset_analysis: { usd: COST_PER_ANALYSIS_USD, source: 'COST_PER_ANALYSIS_USD · Anthropic · Sonnet 5, vignette et copy', nature: 'estimation' },
  map_proposal: { usd: 0.03, source: 'même travail qu’un brief · Anthropic', nature: 'estimation' },
  jarvis_message: { usd: 0.036, source: 'Jarvis conversation · Sonnet 5, 1 200 jetons de sortie au plus, contexte estimé', nature: 'estimation' },
  brouillon_concept: { usd: 0.06, source: 'brouillon de concept Jarvis · 0,06 $ au plus (Adsmap)', nature: 'borne' },
};

/** Barème actuel d'une action (nouvelle unité) · `null` quand elle ne débite rien aujourd'hui. */
export function creditsActuels(a: ActionBareme): number | null {
  return a in CREDIT_COSTS ? CREDIT_COSTS[a as CreditAction] : null;
}

/** Crédits V2 d'une action à prix fixe (nouvelle unité · le barème actuel y est déjà). */
export function creditsV2Action(a: ActionBareme): number {
  const plancher = creditsActuels(a) ?? 0;
  return Math.max(plancher, arrondi5(creditsPourCoutUsd(COUT_REFERENCE_ACTION[a].usd)));
}

export const ACTIONS_BAREME: readonly ActionBareme[] = Object.keys(COUT_REFERENCE_ACTION) as ActionBareme[];

/** Le barème V2 complet, nouvelle unité. */
export const BAREME_V2: Readonly<Record<ActionBareme, number>> = Object.fromEntries(
  ACTIONS_BAREME.map((a) => [a, creditsV2Action(a)]),
) as Record<ActionBareme, number>;

/** Crédits V2 d'une image selon son moteur (même règle, coût du moteur). */
export function creditsV2Image(cleModele: string): number {
  const m = IMAGE_MODELS.find((x) => x.key === cleModele) ?? IMAGE_MODELS[0]!;
  return Math.max(m.credits, arrondi5(creditsPourCoutUsd(m.realEur)));
}

/** Coût fournisseur en euros d'un crédit V2 de cette action · ≤ `BORNE_EUR_PAR_CREDIT` (garde). */
export function coutEurParCreditV2(a: ActionBareme): number {
  return (COUT_REFERENCE_ACTION[a].usd * TAUX_USD_EUR) / BAREME_V2[a];
}

/** Même mesure pour un moteur d'image. */
export function coutEurParCreditImageV2(cleModele: string): number {
  const m = IMAGE_MODELS.find((x) => x.key === cleModele) ?? IMAGE_MODELS[0]!;
  return (m.realEur * TAUX_USD_EUR) / creditsV2Image(m.key);
}

/**
 * L'action la plus chère par crédit, mesurée sur tout le barème V2 à prix fixe
 * et les moteurs d'image. Les appels à coût variable valent au plus la borne :
 * le PIRE CAS retenu pour les marges est donc `max(mesure, BORNE)` = la borne.
 */
export function pireCoutEurParCreditV2(): { action: string; eur: number } {
  const lignes = [
    ...ACTIONS_BAREME.map((a) => ({ action: a, eur: coutEurParCreditV2(a) })),
    ...IMAGE_MODELS.map((m) => ({ action: `image:${m.key}`, eur: coutEurParCreditImageV2(m.key) })),
  ];
  return lignes.reduce((p, l) => (l.eur > p.eur ? l : p));
}
