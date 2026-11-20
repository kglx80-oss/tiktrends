/**
 * Déclencheurs des passages planifiés · ADSMAP, radar de veille, scan tracker.
 *
 * Le moteur de chacun vit côté web (mesure ADSMAP, radar, scan des concurrents
 * suivis), avec un bouton ou une route qui l'appelle aussi : le dupliquer ici
 * pour que le worker l'exécute en direct ferait deux copies d'une logique qui
 * décide de verdicts ou dépense · elles finiraient par diverger, et personne ne
 * saurait laquelle a produit le chiffre affiché.
 *
 * Le worker garde donc ce qu'il sait faire — planifier — et appelle l'endpoint
 * protégé. On passe par le nom de service Docker plutôt que par le domaine
 * public : la requête ne sort pas de la machine, et Caddy n'a pas à arbitrer un
 * appel qui peut durer plusieurs minutes.
 */

import { DELAI_DECLENCHEUR_RECAP_MS } from '@tiktrends/core';

const INTERNAL = 'http://web:3000';

export interface AdsMapTriggerResult { ok: boolean; status?: number; detail?: string; corps?: Record<string, unknown> }

/**
 * Appelle un endpoint cron protégé et rend compte · le SEUL point de contact
 * worker → web. Sans `CRON_SECRET`, on ne déclenche rien et on dit pourquoi ·
 * un succès silencieux laisserait un écran vide sans explication.
 *
 * `taire` · un refus que l'appelant journalise lui-même, au bon niveau (le
 * 503 `smtp_absent` du récap, un avertissement de `passageRecap`) · sans lui,
 * chaque lundi sans SMTP écrivait d'abord un `console.error` de plus.
 */
async function triggerCron(path: string, tag: string, timeoutMs: number, o: { taire?: (r: { status: number; detail: string }) => boolean } = {}): Promise<AdsMapTriggerResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(`[${tag}] CRON_SECRET absent · passage non déclenché.`);
    return { ok: false, detail: 'cron_secret_missing' };
  }
  const base = (process.env.INTERNAL_APP_URL || INTERNAL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = String(body.error ?? res.status);
      if (!o.taire?.({ status: res.status, detail })) console.error(`[${tag}] passage refusé`, res.status, body.error ?? '');
      return { ok: false, status: res.status, detail, corps: body };
    }
    console.log(`[${tag}] passage terminé`, JSON.stringify(body));
    return { ok: true, status: res.status, corps: body };
  } catch (e) {
    console.error(`[${tag}] passage injoignable`, (e as Error).message);
    return { ok: false, detail: (e as Error).message };
  }
}

/** Mesure ADSMAP · appelle Meta marque par marque, ça prend des minutes. */
export function triggerAdsMapSync(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/adsmap', 'adsmap', 15 * 60_000);
}

/**
 * Radar de veille · décrit à l'IA les créas des marques ARMÉES.
 *
 * 5h du matin, AVANT la synchro des sources : il ne dépend d'aucune donnée
 * écrite par les autres passages, et le placer en tête laisse le compte rendu
 * prêt quand quelqu'un ouvre son écran au réveil. Rien pour une marque non
 * armée · le coût d'un passage à vide est une requête.
 */
/** Allocation mensuelle des abonnés annuels (offre V2) · aucun appel payant. */
export function triggerAllocations(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/allocations', 'allocations', 5 * 60_000);
}

/** Bascule des abonnés actuels vers l'offre V2 à leur échéance · sans effet sans `TARIFS_V2`. */
export function triggerBascule(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/bascule-forfaits', 'bascule', 5 * 60_000);
}

export function triggerRadar(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/radar', 'radar', 10 * 60_000);
}

/**
 * Scan des concurrents suivis · détecte les NOUVELLES pubs (diff des
 * identifiants déjà vus, aucune analyse modèle · donc rien de facturé). Il
 * remplit le fil « tes concurrents viennent de sortir ça » de la page
 * Sauvegardes. La route existait et était protégée · elle n'était simplement
 * jamais déclenchée, donc le fil ne se remplissait pas tout seul.
 */
export function triggerTracker(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/tracker', 'tracker', 10 * 60_000);
}

/**
 * Suivi des vidéos historiques encore en cours (ancien studio vidéo, retiré le
 * 10/10) · son écran faisait ce suivi ; sans lui, une vidéo lancée restait « en
 * cours » sans adresse ni remboursement. Léger (un statut lu par vidéo en
 * cours, rien de généré ni facturé) · toutes les 5 minutes, sans effet quand il
 * n'y a plus rien en cours.
 */
export function triggerVideosHistoriques(): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/videos-historiques', 'videos-historiques', 2 * 60_000);
}

/**
 * Récapitulatif hebdomadaire · notifications `digest` et courriel aux
 * propriétaires et administrateurs des marques dont la semaine porte quelque
 * chose. Aucun appel modèle (le récap est calculé, jamais rédigé) · rien de
 * facturé, seulement des comptes et des envois. La route existait et était
 * protégée · rien ne la déclenchait, donc ni la cloche ni « Quoi de neuf » ne
 * recevaient de récap.
 *
 * Rend la réponse telle quelle · c'est `passageRecap` (`./recap`) qui décide
 * de retenter, de reporter ou d'alerter.
 */
export function triggerDigest(o: { taire?: (r: { status: number; detail: string }) => boolean } = {}): Promise<AdsMapTriggerResult> {
  return triggerCron('/api/cron/digest', 'digest', DELAI_DECLENCHEUR_RECAP_MS, o);
}
