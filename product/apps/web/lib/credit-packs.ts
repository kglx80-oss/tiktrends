import { RECHARGES_ACTUELLES, type Recharge } from '@tiktrends/core';

/**
 * Recharges de crédits ponctuelles (paiement unique Stripe, en plus de l'abonnement).
 * DÉRIVÉES de l'offre du noyau (`RECHARGES_ACTUELLES`) · aucun prix n'est écrit ici.
 */
export type CreditPack = Recharge;

export const CREDIT_PACKS: readonly CreditPack[] = RECHARGES_ACTUELLES;

export const packByKey = (k: string): CreditPack | undefined => CREDIT_PACKS.find((p) => p.key === k);
