import { NextResponse } from 'next/server';
import { runAdsMapSync } from '../../../../lib/adsmap-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** La synchro appelle Meta marque par marque · une minute n'y suffirait pas. */
export const maxDuration = 800;

/**
 * ADSMAP · mesure quotidienne de la carte (métriques, protocole, verdicts).
 *
 * À appeler une fois par jour, APRÈS la synchro des sources :
 *   Authorization: Bearer $CRON_SECRET
 * Sans CRON_SECRET, l'endpoint est fermé (503) · un déclencheur ouvert
 * permettrait à n'importe qui de faire tourner tous les comptes publicitaires.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const res = await runAdsMapSync();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('[cron:adsmap]', (e as Error).message);
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
