/** Recharges de crédits ponctuelles (paiement unique Stripe, en plus de l'abonnement). */
export interface CreditPack { key: string; credits: number; eur: number }

export const CREDIT_PACKS: CreditPack[] = [
  { key: 'pack_1k', credits: 1000, eur: 19 },
  { key: 'pack_5k', credits: 5000, eur: 79 },
  { key: 'pack_20k', credits: 20000, eur: 279 },
];

export const packByKey = (k: string): CreditPack | undefined => CREDIT_PACKS.find((p) => p.key === k);
