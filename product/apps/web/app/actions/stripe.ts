'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { type Plan } from '../../lib/rbac';
import { getStripe, priceIdFor } from '../../lib/stripe';

const appUrl = () => (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');

/** Démarre un paiement d'abonnement (Stripe Checkout hébergé) pour une formule payante. */
export async function createCheckoutAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/billing?e=forbidden');

  const plan = String(formData.get('plan') || '') as Plan;
  const stripe = getStripe();
  const price = priceIdFor(plan);
  if (!stripe || !price) redirect('/billing?e=stripe');

  const [ws] = await db.select({ cust: schema.workspaces.stripeCustomerId, name: schema.workspaces.name })
    .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);

  // Réutilise le client Stripe mémorisé s'il existe DANS CE MODE (test/réel).
  // Un client créé dans l'autre mode est invalide ici : on le recrée proprement.
  let customerId = ws?.cust ?? null;
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if ((existing as Stripe.DeletedCustomer).deleted) customerId = null;
    } catch {
      customerId = null; // n'existe pas dans ce mode → on repart à neuf
    }
  }
  if (!customerId) {
    const customer = await stripe.customers.create({ email: s.user.email, name: ws?.name ?? undefined, metadata: { workspaceId: s.workspaceId } });
    customerId = customer.id;
    // On recale l'espace sur le nouveau client et on oublie l'ancien abonnement (autre mode).
    await db.update(schema.workspaces).set({ stripeCustomerId: customerId, stripeSubscriptionId: null, subscriptionStatus: null }).where(eq(schema.workspaces.id, s.workspaceId));
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${appUrl()}/billing?ok=subscribed`,
    cancel_url: `${appUrl()}/billing?e=cancel`,
    metadata: { workspaceId: s.workspaceId, plan },
    subscription_data: { metadata: { workspaceId: s.workspaceId, plan } },
  });
  if (!session.url) redirect('/billing?e=stripe');
  redirect(session.url);
}

/** Ouvre le portail de facturation Stripe (changer de carte, factures, annulation). */
export async function createPortalAction(): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/billing?e=forbidden');

  const stripe = getStripe();
  const [ws] = await db.select({ cust: schema.workspaces.stripeCustomerId }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  if (!stripe || !ws?.cust) redirect('/billing?e=nosub');

  // Le client peut être invalide (créé dans l'autre mode) : on échoue proprement plutôt que de planter.
  let url: string;
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: ws.cust, return_url: `${appUrl()}/billing` });
    url = portal.url;
  } catch {
    redirect('/billing?e=nosub');
  }
  redirect(url);
}
