import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { PLAN_CREDITS, type Plan } from '../../../../lib/rbac';
import { getStripe, planForPrice } from '../../../../lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Applique une formule à un espace : plan + statut, et renouvelle l'allocation SANS
 * effacer les crédits achetés en recharge. On repart du solde en retirant l'ancienne
 * allocation (les crédits d'abonnement non consommés ne se cumulent pas) puis on
 * ajoute la nouvelle : ce qui reste au-dessus, ce sont les recharges payées.
 */
async function applyPlan(workspaceId: string, plan: Plan, opts: { status?: string; subscriptionId?: string | null; refill?: boolean }) {
  if (!db) return;
  const set: Record<string, unknown> = { plan };
  if (opts.status !== undefined) set.subscriptionStatus = opts.status;
  if (opts.subscriptionId !== undefined) set.stripeSubscriptionId = opts.subscriptionId;
  await db.update(schema.workspaces).set(set).where(eq(schema.workspaces.id, workspaceId));
  if (!opts.refill) return;

  const alloc = PLAN_CREDITS[plan] ?? 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance, last: schema.workspaces.lastPlanCredits })
    .from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  const balance = w?.c ?? 0;
  const purchased = Math.max(0, balance - (w?.last ?? 0)); // recharges payées restantes
  const next = purchased + alloc;
  await db.update(schema.workspaces).set({ creditsBalance: next, lastPlanCredits: alloc }).where(eq(schema.workspaces.id, workspaceId));
  const delta = next - balance;
  if (delta !== 0) await db.insert(schema.creditLedger).values({ workspaceId, delta, reason: `Abonnement ${plan} · allocation` });
}

async function workspaceIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!db || !customerId) return null;
  const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.stripeCustomerId, customerId)).limit(1);
  return w?.id ?? null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 503 });

  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? '', secret);
  } catch (e) {
    return NextResponse.json({ error: `signature: ${(e as Error).message}` }, { status: 400 });
  }

  // Anti-doublon : Stripe livre « au moins une fois » et rejoue en cas d'erreur.
  // On enregistre l'événement AVANT de traiter ; si l'id existe déjà, on ne rejoue rien.
  if (db) {
    try {
      const ins = await db.insert(schema.stripeEvents).values({ eventId: event.id, type: event.type })
        .onConflictDoNothing().returning({ id: schema.stripeEvents.eventId });
      if (!ins.length) return NextResponse.json({ received: true, duplicate: true });
    } catch (e) {
      console.error('[stripe:webhook] dédoublonnage', (e as Error).message);
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspaceId || (await workspaceIdFromCustomer(session.customer as string));
        // Paiements différés (SEPA, iDEAL…) : la session peut être « completed » mais pas payée.
        if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') break;
        if (session.metadata?.kind === 'topup') {
          // Recharge ponctuelle : on crédite l'espace du nombre de crédits acheté.
          const credits = Number(session.metadata?.credits) || 0;
          if (workspaceId && credits > 0 && db) {
            await db.update(schema.workspaces)
              .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${credits}` })
              .where(eq(schema.workspaces.id, workspaceId));
            await db.insert(schema.creditLedger).values({ workspaceId, delta: credits, reason: 'Recharge de crédits (Stripe)' });
          }
          break;
        }
        const plan = (session.metadata?.plan as Plan) || null;
        if (workspaceId && plan) {
          await applyPlan(workspaceId, plan, { status: 'active', subscriptionId: (session.subscription as string) ?? null, refill: true });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const workspaceId = sub.metadata?.workspaceId || (await workspaceIdFromCustomer(sub.customer as string));
        const priceId = sub.items.data[0]?.price?.id;
        const plan = planForPrice(priceId) || (sub.metadata?.plan as Plan) || null;
        if (workspaceId && plan && db) {
          // On ne recharge QUE si la formule change réellement (un simple changement de
          // statut ou une action au portail ne doit pas re-créditer l'allocation).
          const [cur] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
          const planChanged = cur?.plan !== plan;
          await applyPlan(workspaceId, plan, { status: sub.status, subscriptionId: sub.id, refill: planChanged && sub.status === 'active' });
        }
        break;
      }
      // Paiement différé confirmé après coup (SEPA, iDEAL…).
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspaceId || (await workspaceIdFromCustomer(session.customer as string));
        if (session.metadata?.kind === 'topup') {
          const credits = Number(session.metadata?.credits) || 0;
          if (workspaceId && credits > 0 && db) {
            await db.update(schema.workspaces).set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${credits}` }).where(eq(schema.workspaces.id, workspaceId));
            await db.insert(schema.creditLedger).values({ workspaceId, delta: credits, reason: 'Recharge de crédits (Stripe)' });
          }
        } else {
          const plan = (session.metadata?.plan as Plan) || null;
          if (workspaceId && plan) await applyPlan(workspaceId, plan, { status: 'active', subscriptionId: (session.subscription as string) ?? null, refill: true });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const workspaceId = sub.metadata?.workspaceId || (await workspaceIdFromCustomer(sub.customer as string));
        if (workspaceId) {
          await applyPlan(workspaceId, 'starter', { status: 'canceled', subscriptionId: null, refill: true });
        }
        break;
      }
      case 'invoice.paid': {
        // Renouvellement : on remet l'allocation à plein selon la formule courante de l'espace.
        const invoice = event.data.object as Stripe.Invoice;
        const workspaceId = await workspaceIdFromCustomer(invoice.customer as string);
        if (workspaceId && db) {
          const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
          const plan = (w?.plan as Plan) || null;
          if (plan && plan !== 'starter') await applyPlan(workspaceId, plan, { status: 'active', refill: true });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[stripe:webhook]', event.type, (e as Error).message);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
