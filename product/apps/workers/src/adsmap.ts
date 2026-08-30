/**
 * ADSMAP · déclenchement de la mesure quotidienne de la carte.
 *
 * Le moteur lui-même vit côté web (`apps/web/lib/adsmap-sync.ts`), avec le
 * bouton « Mesurer maintenant » qui l'appelle aussi : le dupliquer ici pour que
 * le worker l'exécute en direct ferait deux copies d'une logique qui décide de
 * verdicts · elles finiraient par diverger, et personne ne saurait laquelle a
 * produit le chiffre affiché.
 *
 * Le worker garde donc ce qu'il sait faire — planifier — et appelle l'endpoint
 * protégé. On passe par le nom de service Docker plutôt que par le domaine
 * public : la requête ne sort pas de la machine, et Caddy n'a pas à arbitrer un
 * appel qui peut durer plusieurs minutes.
 */

const INTERNAL = 'http://web:3000';

export interface AdsMapTriggerResult { ok: boolean; status?: number; detail?: string }

export async function triggerAdsMapSync(): Promise<AdsMapTriggerResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Dire pourquoi rien ne s'est passé vaut mieux qu'un succès silencieux :
    // sans ce message, la carte resterait vide sans que rien ne l'explique.
    console.warn('[adsmap] CRON_SECRET absent · mesure non déclenchée.');
    return { ok: false, detail: 'cron_secret_missing' };
  }

  const base = (process.env.INTERNAL_APP_URL || INTERNAL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/cron/adsmap`, {
      headers: { authorization: `Bearer ${secret}` },
      // La synchro appelle Meta marque par marque · elle prend des minutes.
      signal: AbortSignal.timeout(15 * 60_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      console.error('[adsmap] mesure refusée', res.status, body.error ?? '');
      return { ok: false, status: res.status, detail: String(body.error ?? res.status) };
    }
    console.log('[adsmap] mesure terminée', JSON.stringify(body));
    return { ok: true, status: res.status };
  } catch (e) {
    console.error('[adsmap] mesure injoignable', (e as Error).message);
    return { ok: false, detail: (e as Error).message };
  }
}

/**
 * Radar de veille · même mécanique de déclenchement, autre heure.
 *
 * 5h du matin, AVANT la synchro des sources : le radar ne dépend d'aucune
 * donnée écrite par les autres passages, et le placer en tête laisse le compte
 * rendu prêt quand quelqu'un ouvre son écran au réveil.
 *
 * Il ne fait rien pour une marque non armée · le coût d'un passage à vide est
 * une requête.
 */
export async function triggerRadar(): Promise<AdsMapTriggerResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[radar] CRON_SECRET absent · passage non déclenché.');
    return { ok: false, detail: 'cron_secret_missing' };
  }

  const base = (process.env.INTERNAL_APP_URL || INTERNAL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/api/cron/radar`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      console.error('[radar] passage refusé', res.status, body.error ?? '');
      return { ok: false, status: res.status, detail: String(body.error ?? res.status) };
    }
    console.log('[radar] passage terminé', JSON.stringify(body));
    return { ok: true, status: res.status };
  } catch (e) {
    console.error('[radar] passage injoignable', (e as Error).message);
    return { ok: false, detail: (e as Error).message };
  }
}
