import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { applyPlanAllocation } from '@tiktrends/core';
import { PLAN_CREDITS, type Plan } from '../../../../lib/rbac';
import { getStripe, planForPrice } from '../../../../lib/stripe';
import { routeStripeEvent, type StripeIntent } from '../../../../lib/stripe-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Applique une formule à un espace : plan + statut, et renouvelle l'allocation SANS
 * effacer les crédits achetés en recharge (cf. applyPlanAllocation).
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
  const { next, delta } = applyPlanAllocation(w?.c ?? 0, w?.last ?? 0, alloc);
  await db.update(schema.workspaces).set({ creditsBalance: next, lastPlanCredits: alloc }).where(eq(schema.workspaces.id, workspaceId));
  if (delta !== 0) await db.insert(schema.creditLedger).values({ workspaceId, delta, reason: `Abonnement ${plan} · allocation` });
}

async function workspaceIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!db || !customerId) return null;
  const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.stripeCustomerId, customerId)).limit(1);
  return w?.id ?? null;
}

/** Résout l'espace : métadonnées de l'événement d'abord, client Stripe en repli. */
async function resolveWorkspace(i: { workspaceId?: string | null; customerId?: string | null }): Promise<string | null> {
  return i.workspaceId || (await workspaceIdFromCustomer(i.customerId ?? null));
}

/** Exécute l'intention décidée par routeStripeEvent. */
async function runIntent(intent: StripeIntent): Promise<void> {
  if (!db || intent.kind === 'ignore') return;

  if (intent.kind === 'topup') {
    const workspaceId = await resolveWorkspace(intent);
    if (!workspaceId) return;
    await db.update(schema.workspaces)
      .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${intent.credits}` })
      .where(eq(schema.workspaces.id, workspaceId));
    await db.insert(schema.creditLedger).values({ workspaceId, delta: intent.credits, reason: 'Recharge de crédits (Stripe)' });
    return;
  }

  if (intent.kind === 'cancel') {
    const workspaceId = await resolveWorkspace(intent);
    if (workspaceId) await applyPlan(workspaceId, 'starter', { status: 'canceled', subscriptionId: null, refill: true });
    return;
  }

  if (intent.kind === 'renew') {
    const workspaceId = await resolveWorkspace(intent);
    if (!workspaceId) return;
    const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    const plan = (w?.plan as Plan) || null;
    if (plan && plan !== 'starter') await applyPlan(workspaceId, plan, { status: 'active', refill: true });
    return;
  }

  // intent.kind === 'plan'
  const workspaceId = await resolveWorkspace(intent);
  if (!workspaceId) return;
  let refill = intent.refill === 'always';
  if (intent.refill === 'if-plan-changed') {
    const [cur] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    refill = cur?.plan !== intent.plan && intent.status === 'active';
  }
  await applyPlan(workspaceId, intent.plan, { status: intent.status, subscriptionId: intent.subscriptionId, refill });
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
  // On pose la marque AVANT de traiter (sinon deux livraisons simultanées créditent
  // deux fois) et on la retire si le traitement échoue, pour que le rejeu de Stripe
  // soit bien pris en compte · sinon un incident passager perdait l'événement
  // définitivement, et le client payait sans être crédité.
  let marked = false;
  if (db) {
    try {
      const ins = await db.insert(schema.stripeEvents).values({ eventId: event.id, type: event.type })
        .onConflictDoNothing().returning({ id: schema.stripeEvents.eventId });
      if (!ins.length) return NextResponse.json({ received: true, duplicate: true });
      marked = true;
    } catch (e) {
      console.error('[stripe:webhook] dédoublonnage', (e as Error).message);
    }
  }

  try {
    await runIntent(routeStripeEvent(event, planForPrice));
  } catch (e) {
    console.error('[stripe:webhook]', event.type, (e as Error).message);
    if (marked && db) {
      try { await db.delete(schema.stripeEvents).where(eq(schema.stripeEvents.eventId, event.id)); }
      catch { /* au pire, l'événement reste marqué : on l'aura dans les logs */ }
    }
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
