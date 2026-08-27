import { NextResponse } from 'next/server';
import { scanAllTracker } from '../../../../lib/tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scan automatique des marques suivies (tous les espaces).
 * À appeler périodiquement (cron VPS / worker) avec l'en-tête d'autorisation :
 *   Authorization: Bearer $CRON_SECRET
 * Si CRON_SECRET n'est pas défini, l'endpoint est fermé (503) par sécurité.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const res = await scanAllTracker();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('[cron:tracker]', (e as Error).message);
    return NextResponse.json({ error: 'scan_failed' }, { status: 500 });
  }
}
