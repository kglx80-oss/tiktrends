import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getStripe, planForPrice } from '../../../../lib/stripe';
import { routeStripeEvent } from '../../../../lib/stripe-events';
import { runIntent } from '../../../../lib/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
