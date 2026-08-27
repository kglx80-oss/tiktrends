import type Stripe from 'stripe';
import type { Plan } from './rbac';

/**
 * Routage des événements Stripe · partie PURE, sans base ni réseau.
 *
 * Le handler HTTP se contente d'exécuter l'intention renvoyée ici. Séparer les
 * deux permet de tester ce qui compte vraiment (quel événement crédite quoi, et
 * dans quels cas il ne faut surtout PAS créditer) sans monter un Postgres ni
 * signer de fausses requêtes.
 */

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const asPlan = (v: unknown): Plan | null => (typeof v === 'string' && PLANS.includes(v as Plan) ? (v as Plan) : null);

/** Ce que l'espace doit devenir. `refill` dit si l'allocation doit être re-servie. */
export type StripeIntent =
  | { kind: 'ignore'; reason: string }
  | { kind: 'topup'; workspaceId: string | null; customerId: string | null; credits: number }
  | { kind: 'plan'; workspaceId: string | null; customerId: string | null; plan: Plan; status: string; subscriptionId: string | null; refill: 'always' | 'if-plan-changed' }
  | { kind: 'cancel'; workspaceId: string | null; customerId: string | null }
  | { kind: 'renew'; customerId: string | null };

/** Métadonnées d'une session : Stripe les renvoie en `Record<string, string>`. */
function meta(o: { metadata?: Stripe.Metadata | null }): Record<string, string> {
  return (o.metadata ?? {}) as Record<string, string>;
}
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : (v as { id?: string } | null)?.id ?? null);

/**
 * Intention d'une session de paiement (immédiate ou différée).
 * `checkAsPaid` : pour `checkout.session.completed`, la session peut être conclue
 * SANS être payée (SEPA, iDEAL…) · on attend alors l'événement asynchrone.
 */
function fromSession(session: Stripe.Checkout.Session, checkPaid: boolean): StripeIntent {
  const m = meta(session);
  const workspaceId = m.workspaceId || null;
  const customerId = idOf(session.customer);
  if (checkPaid && session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { kind: 'ignore', reason: `paiement en attente (${session.payment_status})` };
  }
  if (m.kind === 'topup') {
    const credits = Number(m.credits) || 0;
    if (credits <= 0) return { kind: 'ignore', reason: 'recharge sans crédits' };
    return { kind: 'topup', workspaceId, customerId, credits };
  }
  const plan = asPlan(m.plan);
  if (!plan) return { kind: 'ignore', reason: 'formule absente des métadonnées' };
  return { kind: 'plan', workspaceId, customerId, plan, status: 'active', subscriptionId: idOf(session.subscription), refill: 'always' };
}

/**
 * Traduit un événement Stripe en intention.
 * `planForPrice` est injecté pour que le mapping prix -> formule (variable
 * d'environnement) reste testable.
 */
export function routeStripeEvent(event: Stripe.Event, planForPrice: (priceId?: string | null) => Plan | null): StripeIntent {
  switch (event.type) {
    case 'checkout.session.completed':
      return fromSession(event.data.object as Stripe.Checkout.Session, true);

    // Paiement différé confirmé après coup : la session est cette fois payée.
    case 'checkout.session.async_payment_succeeded':
      return fromSession(event.data.object as Stripe.Checkout.Session, false);

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const m = meta(sub);
      const plan = planForPrice(sub.items?.data?.[0]?.price?.id) || asPlan(m.plan);
      if (!plan) return { kind: 'ignore', reason: 'formule introuvable pour ce prix' };
      // Un simple changement de statut ou une action au portail ne doit PAS
      // re-créditer l'allocation : seul un vrai changement de formule le fait.
      return {
        kind: 'plan', workspaceId: m.workspaceId || null, customerId: idOf(sub.customer),
        plan, status: sub.status, subscriptionId: sub.id, refill: 'if-plan-changed',
      };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return { kind: 'cancel', workspaceId: meta(sub).workspaceId || null, customerId: idOf(sub.customer) };
    }

    // Renouvellement : la formule courante est lue en base (elle fait foi).
    case 'invoice.paid':
      return { kind: 'renew', customerId: idOf((event.data.object as Stripe.Invoice).customer) };

    default:
      return { kind: 'ignore', reason: `type non traité (${event.type})` };
  }
}
