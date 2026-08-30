import { NextResponse } from 'next/server';
import { runRadarAll } from '../../../../lib/radar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Un appel modèle par créa décrite · quelques minutes suffisent largement. */
export const maxDuration = 600;

/**
 * Radar de veille · passage nocturne sur les marques ARMÉES uniquement.
 *
 * À appeler une fois par nuit :
 *   Authorization: Bearer $CRON_SECRET
 *
 * Sans CRON_SECRET l'endpoint est fermé (503). Ici, ce n'est pas seulement une
 * question d'accès : un déclencheur ouvert sur une fonction qui dépense
 * permettrait à n'importe qui de faire monter la facture en la rappelant.
 *
 * La réponse porte la dépense estimée · une fonction qui tourne toute seule doit
 * laisser une trace lisible de ce qu'elle a coûté, sinon la seule façon de le
 * savoir est de lire le relevé.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'cron_disabled' }, { status: 503 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const res = await runRadarAll();
    console.log('[cron:radar]', res.brands, 'marque(s) armée(s) ·', res.analyzed, 'créa(s) ·', res.spentUsd.toFixed(2), '$');
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error('[cron:radar]', (e as Error).message);
    return NextResponse.json({ error: 'radar_failed' }, { status: 500 });
  }
}
