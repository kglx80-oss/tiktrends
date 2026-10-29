/**
 * L'offre · la marge brute d'un forfait et d'une recharge. Pur.
 *
 * Marge brute = (revenu HT − coût fournisseur − frais de paiement) ÷ revenu HT.
 *
 *  · Revenu HT · le prix est TTC (décision du 29/10, point 2), la TVA est
 *    celle de la France (`TVA_REFERENCE`). Un client B2B de l'UE en
 *    autoliquidation paie le même TTC sans TVA collectée : sa marge est
 *    MEILLEURE, la France est donc le cas défavorable courant.
 *  · Frais · ceux du code (`PAYMENT_FEE_PCT`, `PAYMENT_FEE_FIXED_EUR`), plus
 *    Stripe Billing sur les abonnements et Stripe Tax sur tout paiement taxé
 *    (tarifs publics Stripe, à vérifier dans le tableau de bord). En annuel,
 *    un seul paiement par an : les frais fixes sont étalés sur douze mois.
 *  · PIRE CAS · 100 % des crédits consommés sur l'action la plus chère par
 *    crédit (`pireCoutEurParCreditV2`, au plus la borne), sur l'ANNUEL (−30 %).
 *
 * `MARGE_CIBLE` est la seule cible de la plateforme · l'Admin (Finance,
 * Crédits & marges) la lit d'ici.
 */
import { PAYMENT_FEE_FIXED_EUR, PAYMENT_FEE_PCT } from '../economics';
import { BORNE_EUR_PAR_CREDIT, pireCoutEurParCreditV2 } from './bareme';
import {
  FORFAITS_V2, FORFAITS_V2_ORDRE, prixEcheanceTtc, rechargesV2,
  type CleForfaitV2, type Facturation, type Recharge,
} from './forfaits';

/** La marge brute visée, même au pire cas (décision du 29/10, point 2). */
export const MARGE_CIBLE = 0.70;

/** Plancher d'une recharge · mesuré à 63,1 % au plus bas (petit pack Agence), choisi avec marge. */
export const MARGE_PLANCHER_RECHARGE = 0.60;

/** TVA de référence (France). */
export const TVA_REFERENCE = 0.20;

/** Stripe Billing · part du volume d'abonnement (tarif public). */
export const FRAIS_STRIPE_BILLING_PCT = 0.007;
/** Stripe Tax · part de chaque paiement taxé (tarif public). */
export const FRAIS_STRIPE_TAX_PCT = 0.005;

/** Coût par crédit retenu pour le pire cas · jamais sous la borne de conception. */
export function coutPireCasEurParCredit(): number {
  return Math.max(BORNE_EUR_PAR_CREDIT, pireCoutEurParCreditV2().eur);
}

export interface MargeMesuree {
  revenuHtMois: number;
  fraisMois: number;
  coutMois: number;
  marge: number;
}

/**
 * Marge d'un forfait V2 sur un mois.
 * `consommation` · part de l'allocation dépensée (1 = tout) ;
 * `coutEurParCredit` · par défaut le pire cas ; `hausseCouts` · sensibilité (0,2 = +20 %).
 */
export function margeForfaitV2(
  cle: CleForfaitV2,
  facturation: Facturation,
  o: { consommation?: number; coutEurParCredit?: number; hausseCouts?: number; credits?: number } = {},
): MargeMesuree {
  const echeance = prixEcheanceTtc(cle, facturation);
  const moisParEcheance = facturation === 'annuel' ? 12 : 1;
  const revenuHtMois = echeance / (1 + TVA_REFERENCE) / moisParEcheance;
  const fraisMois = (echeance * (PAYMENT_FEE_PCT + FRAIS_STRIPE_BILLING_PCT + FRAIS_STRIPE_TAX_PCT) + PAYMENT_FEE_FIXED_EUR) / moisParEcheance;
  const credits = o.credits ?? FORFAITS_V2[cle].creditsMois;
  const coutMois = credits * (o.consommation ?? 1) * (o.coutEurParCredit ?? coutPireCasEurParCredit()) * (1 + (o.hausseCouts ?? 0));
  return { revenuHtMois, fraisMois, coutMois, marge: (revenuHtMois - fraisMois - coutMois) / revenuHtMois };
}

/** Le plus grand nombre de crédits (au cent inférieur) qui tient la cible au pire cas annuel. */
export function creditsMaxPourMarge(cle: CleForfaitV2, cible = MARGE_CIBLE): number {
  const m = margeForfaitV2(cle, 'annuel', { credits: 0 });
  const max = (m.revenuHtMois * (1 - cible) - m.fraisMois) / coutPireCasEurParCredit();
  return Math.floor(max / 100) * 100;
}

/** Marge d'une recharge V2 dépensée en entier au pire cas (paiement unique, Stripe Tax, sans Billing). */
export function margeRecharge(r: Recharge, o: { hausseCouts?: number } = {}): number {
  const ht = r.eur / (1 + TVA_REFERENCE);
  const frais = r.eur * (PAYMENT_FEE_PCT + FRAIS_STRIPE_TAX_PCT) + PAYMENT_FEE_FIXED_EUR;
  const cout = r.credits * coutPireCasEurParCredit() * (1 + (o.hausseCouts ?? 0));
  return (ht - frais - cout) / ht;
}

export interface LigneTableauMarges {
  forfait: CleForfaitV2;
  facturation: Facturation;
  prixMensuelTtc: number;
  credits: number;
  /** Pire cas · 100 % consommé à l'action la plus chère par crédit. */
  pireCas: number;
  /** Pire cas avec des coûts fournisseurs en hausse de 20 %. */
  pireCasPlus20: number;
  /** Usage moyen (hypothèse à mesurer) · 50 % consommé. */
  moitie: number;
}

/** Le tableau des marges de la grille V2 · six lignes (3 forfaits × 2 facturations). */
export function tableauMargesV2(): LigneTableauMarges[] {
  return FORFAITS_V2_ORDRE.flatMap((forfait) => (['mensuel', 'annuel'] as const).map((facturation) => ({
    forfait,
    facturation,
    prixMensuelTtc: facturation === 'mensuel' ? FORFAITS_V2[forfait].prixMensuelTtc : Math.round(prixEcheanceTtc(forfait, 'annuel') / 12 * 100) / 100,
    credits: FORFAITS_V2[forfait].creditsMois,
    pireCas: margeForfaitV2(forfait, facturation).marge,
    pireCasPlus20: margeForfaitV2(forfait, facturation, { hausseCouts: 0.2 }).marge,
    moitie: margeForfaitV2(forfait, facturation, { consommation: 0.5 }).marge,
  })));
}

/** Les recharges V2 et leur marge au pire cas. */
export function tableauMargesRecharges(): Array<{ forfait: CleForfaitV2; credits: number; eur: number; pireCas: number }> {
  return FORFAITS_V2_ORDRE.flatMap((forfait) => rechargesV2(forfait).map((r) => ({ forfait, credits: r.credits, eur: r.eur, pireCas: margeRecharge(r) })));
}
