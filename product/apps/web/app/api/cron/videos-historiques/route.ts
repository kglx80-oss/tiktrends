import { NextResponse } from 'next/server';
import { reconcilierVideosHistoriques } from '../../../../lib/videos-historiques';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Suivi des vidéos historiques encore en cours (ancien studio vidéo, retiré le
 * 10/10) · appelé toutes les 5 minutes par le worker, avec
 *   Authorization: Bearer $CRON_SECRET
 * Sans CRON_SECRET, l'endpoint est fermé (503). Aucune génération, aucune
 * dépense : lecture du statut chez le fournisseur, adresse ou remboursement.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await reconcilierVideosHistoriques()) });
  } catch (e) {
    console.error('[cron:videos-historiques]', (e as Error).message);
    return NextResponse.json({ error: 'suivi_echoue' }, { status: 500 });
  }
}
