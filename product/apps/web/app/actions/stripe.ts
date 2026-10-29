'use server';

import { redirect } from 'next/navigation';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { type Plan } from '../../lib/rbac';
import { getStripe, priceIdFor, priceIdForV2 } from '../../lib/stripe';
import { packByKey } from '../../lib/credit-packs';
import {
  UNITE_CREDIT_COURANTE, estForfaitV2, forfaitRechargesV2, lireFacturation, parametresCheckoutAbonnementV2, parametresCheckoutRechargeV2,
  rechargesV2, tarifsV2Actifs, variablePrixRecharge,
} from '@tiktrends/core';

const appUrl = () => (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');

/**
 * Renvoie l'id du client Stripe de l'espace, valide DANS LE MODE COURANT (test/réel).
 * Recrée le client s'il vient de l'autre mode (évite « No such customer »).
 */
async function ensureCustomer(stripe: Stripe, workspaceId: string, email: string): Promise<string> {
  const [ws] = await db!.select({ cust: schema.workspaces.stripeCustomerId, name: schema.workspaces.name })
    .from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  let customerId = ws?.cust ?? null;
  if (customerId) {
    try {
      const existing = await stripe.customers.retrieve(customerId);
      if ((existing as Stripe.DeletedCustomer).deleted) customerId = null;
    } catch { customerId = null; }
  }
  if (!customerId) {
    const customer = await stripe.customers.create({ email, name: ws?.name ?? undefined, metadata: { workspaceId } });
    customerId = customer.id;
    await db!.update(schema.workspaces).set({ stripeCustomerId: customerId, stripeSubscriptionId: null, subscriptionStatus: null }).where(eq(schema.workspaces.id, workspaceId));
  }
  return customerId;
}

/** Démarre un paiement d'abonnement (Stripe Checkout hébergé) pour une formule payante. */
export async function createCheckoutAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/billing?e=forbidden');

  const plan = String(formData.get('plan') || '') as Plan;
  const stripe = getStripe();

  // Offre V2 (sous `TARIFS_V2` seulement) · prix par forfait ET facturation, Stripe Tax activé.
  if (tarifsV2Actifs(process.env) && estForfaitV2(plan)) {
    const facturation = lireFacturation(formData.get('facturation'));
    const prixV2 = priceIdForV2(plan, facturation);
    if (!stripe || !prixV2) redirect('/billing?e=stripe');
    const client = await ensureCustomer(stripe, s.workspaceId, s.user.email);
    const sessionV2 = await stripe.checkout.sessions.create(parametresCheckoutAbonnementV2({ customer: client, price: prixV2, workspaceId: s.workspaceId, forfait: plan, facturation, appUrl: appUrl() }));
    if (!sessionV2.url) redirect('/billing?e=stripe');
    redirect(sessionV2.url);
  }

  // L'offre d'aujourd'hui · inchangée (garde `stripe-checkout-v2`).
  const price = priceIdFor(plan);
  if (!stripe || !price) redirect('/billing?e=stripe');

  const customerId = await ensureCustomer(stripe, s.workspaceId, s.user.email);

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

/** Achat ponctuel d'un pack de crédits (paiement unique, prix inline · aucun produit Stripe à créer). */
export async function createTopupCheckoutAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/billing?e=forbidden');

  const cle = String(formData.get('pack') || '');
  const stripe = getStripe();

  // Recharge V2 · seulement sous `TARIFS_V2`, et seulement au prix du forfait V2 de l'espace.
  const forfait = forfaitRechargesV2(s.plan);
  if (tarifsV2Actifs(process.env) && forfait && cle.startsWith('v2_')) {
    const packV2 = rechargesV2(forfait).find((x) => x.key === cle);
    if (!stripe || !packV2) redirect('/billing?e=stripe');
    const client = await ensureCustomer(stripe, s.workspaceId, s.user.email);
    const sessionV2 = await stripe.checkout.sessions.create(parametresCheckoutRechargeV2({
      customer: client, price: process.env[variablePrixRecharge(forfait, packV2.credits)] || null, pack: packV2, forfait, workspaceId: s.workspaceId, appUrl: appUrl(),
    }));
    if (!sessionV2.url) redirect('/billing?e=stripe');
    redirect(sessionV2.url);
  }

  const pack = packByKey(cle);
  if (!stripe || !pack) redirect('/billing?e=stripe');

  const customerId = await ensureCustomer(stripe, s.workspaceId, s.user.email);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(pack.eur * 100),
        product_data: { name: `Recharge · ${pack.credits.toLocaleString('fr-FR')} crédits TikTrends` },
      },
    }],
    success_url: `${appUrl()}/billing?ok=topup`,
    cancel_url: `${appUrl()}/billing?e=cancel`,
    // `unite` · les crédits sont dans la nouvelle unité (÷ 10) · une session sans ce marqueur est lue en ancienne unité (`creditsRecharge`).
    metadata: { workspaceId: s.workspaceId, kind: 'topup', credits: String(pack.credits), unite: String(UNITE_CREDIT_COURANTE) },
    payment_intent_data: { metadata: { workspaceId: s.workspaceId, kind: 'topup', credits: String(pack.credits), unite: String(UNITE_CREDIT_COURANTE) } },
  });
  if (!session.url) redirect('/billing?e=stripe');
  redirect(session.url);
}
