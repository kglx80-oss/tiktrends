import { NextResponse } from 'next/server';
import { allouerAnnuelsDus } from '../../../../lib/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Allocation mensuelle des abonnés annuels (offre V2) · une fois par jour.
 *   Authorization: Bearer $CRON_SECRET
 * Sans CRON_SECRET l'endpoint est fermé (503). Aucun appel payant.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const n = await allouerAnnuelsDus();
    return NextResponse.json({ ok: true, alloues: n });
  } catch (e) {
    console.error('[cron:allocations]', (e as Error).message);
    return NextResponse.json({ error: 'allocations_failed' }, { status: 500 });
  }
}
