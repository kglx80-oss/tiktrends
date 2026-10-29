import { NextResponse } from 'next/server';
import { getStripe } from '../../../../lib/stripe';
import { programmerBascules } from '../../../../lib/stripe-bascule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bascule des abonnés actuels vers l'offre V2 à leur échéance · une fois par
 * jour, sans effet tant que `TARIFS_V2` n'est pas posé.
 *   Authorization: Bearer $CRON_SECRET
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await programmerBascules(getStripe())) });
  } catch (e) {
    console.error('[cron:bascule]', (e as Error).message);
    return NextResponse.json({ error: 'bascule_failed' }, { status: 500 });
  }
}
