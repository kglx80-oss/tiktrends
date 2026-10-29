import 'server-only';
import Stripe from 'stripe';
import type { Plan } from './rbac';
import { forfaitDuPrix, variablePrixForfait, type CleForfaitV2, type Facturation } from '@tiktrends/core';

/**
 * Intégration paiement Stripe.
 * Config serveur : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, et un identifiant de prix
 * par formule payante : STRIPE_PRICE_CORE / STRIPE_PRICE_PLUS / STRIPE_PRICE_BUSINESS.
 */
let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  client = key ? new Stripe(key) : null;
  return client;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Formules payantes reliées à un prix Stripe (via variables d'environnement). */
const PRICE_ENV: Record<'core' | 'plus' | 'business', string> = {
  core: 'STRIPE_PRICE_CORE',
  plus: 'STRIPE_PRICE_PLUS',
  business: 'STRIPE_PRICE_BUSINESS',
};

/** Identifiant de prix Stripe pour une formule (ou null si non configuré). */
export function priceIdFor(plan: Plan): string | null {
  if (plan !== 'core' && plan !== 'plus' && plan !== 'business') return null;
  return process.env[PRICE_ENV[plan]] || null;
}

/**
 * Formule correspondant à un identifiant de prix Stripe (résolution inverse pour
 * le webhook) · les prix d'aujourd'hui, puis ceux de l'offre V2 (six prix,
 * `forfaitDuPrix`) · un prix V2 n'existe que si Kevin l'a posé dans `.env.deploy`.
 */
export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of ['core', 'plus', 'business'] as const) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return forfaitDuPrix(priceId, process.env)?.forfait ?? null;
}

/** Une formule payante est-elle vendable (prix configuré) ? */
export function planPurchasable(plan: Plan): boolean {
  return plan !== 'starter' && !!priceIdFor(plan);
}

/**
 * Offre V2 (sous `TARIFS_V2`) · un identifiant de prix Stripe par forfait ET par
 * facturation · `STRIPE_PRICE_ESSENTIEL_MENSUEL`, `STRIPE_PRICE_ESSENTIEL_ANNUEL`,
 * idem PRO et AGENCE (`docs/FACTURATION-STRIPE.md`). Absent = non vendable.
 */
export function priceIdForV2(forfait: CleForfaitV2, facturation: Facturation): string | null {
  return process.env[variablePrixForfait(forfait, facturation)] || null;
}
