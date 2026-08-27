import 'server-only';
import Stripe from 'stripe';
import type { Plan } from './rbac';

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
const PRICE_ENV: Record<Exclude<Plan, 'starter'>, string> = {
  core: 'STRIPE_PRICE_CORE',
  plus: 'STRIPE_PRICE_PLUS',
  business: 'STRIPE_PRICE_BUSINESS',
};

/** Identifiant de prix Stripe pour une formule (ou null si non configuré). */
export function priceIdFor(plan: Plan): string | null {
  if (plan === 'starter') return null;
  return process.env[PRICE_ENV[plan]] || null;
}

/** Formule correspondant à un identifiant de prix Stripe (résolution inverse pour le webhook). */
export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  for (const plan of ['core', 'plus', 'business'] as const) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

/** Une formule payante est-elle vendable (prix configuré) ? */
export function planPurchasable(plan: Plan): boolean {
  return plan !== 'starter' && !!priceIdFor(plan);
}
