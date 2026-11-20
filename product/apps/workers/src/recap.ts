import { ATTENTE_RECAP_MS, TENTATIVES_RECAP, cleVerrouRecap, suiteRecap } from '@tiktrends/core';
import { queues } from './queue';
import { triggerDigest } from './adsmap';

/** Les options de chaque déclenchement du récap · planifié ou reporté. */
export const OPTIONS_RECAP = {
  attempts: TENTATIVES_RECAP,
  backoff: { type: 'exponential' as const, delay: ATTENTE_RECAP_MS },
  removeOnComplete: 20, removeOnFail: 20,
};

type JobRecap = { name?: string; data?: { reports?: number } | null; attemptsMade?: number; opts?: { attempts?: number } };

/**
 * Un job `weekly-digest` passé en `failed` SANS être passé par la fin de
 * `passageRecap` · une exception imprévue à la dernière tentative, ou un job
 * REPORTÉ (différé, non répétable) bloqué par des redémarrages. Un job
 * répétable, lui, n'échoue jamais pour blocage · BullMQ le remet en attente
 * (`moveStalledJobsToWait`) ; seuls les jobs reportés peuvent finir « stalled ».
 *
 * L'alerte dit NON CONFIRMÉ, pas « non servi » · le passage web continue
 * derrière un worker qui a perdu son job (la route n'est pas coupée), et la
 * semaine peut très bien finir servie. Le verrou en base dit la vérité.
 * Une tentative intermédiaire qui échoue (BullMQ va retenter) ne crie pas.
 */
export function alerteEchecRecap(job: JobRecap | undefined, err: Error | undefined, maintenant: Date = new Date()): boolean {
  if (!job || job.name !== 'weekly-digest') return false;
  const derniere = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
  const bloque = /stalled/i.test(err?.message ?? '');
  if (!derniere && !bloque) return false;
  console.error(`[digest] ALERTE · récap hebdomadaire NON CONFIRMÉ · job en échec définitif (${bloque ? 'bloqué par des redémarrages' : `tentative ${job.attemptsMade}/${job.opts?.attempts}`} · ${err?.message ?? 'inconnu'}) · le passage web a pu continuer · vérifier le verrou ${cleVerrouRecap(maintenant)} (app_settings) et le journal web « [cron:digest] », relancer GET /api/cron/digest s'il n'est pas « fait » (la reprise ne double rien)`);
  return true;
}

/**
 * Un déclenchement de `weekly-digest` · la route, puis la suite que dit le
 * noyau (`suiteRecap`) :
 *  · servi · fini ;
 *  · 409 `en_cours` · un passage vivant tient la semaine · on REPORTE une
 *    vérification (job différé, données `reports`) au lieu de lever · aucune
 *    tentative n'est consommée, et le nombre de reports est borné ;
 *  · SMTP absent (503 `smtp_absent`) · une ligne, ni retente ni ALERTE · les
 *    lettres sont servies dans l'application, l'état est connu ;
 *  · disjoncteur des courriels · ALERTE précise, sans retente (la cause est
 *    côté SMTP, retenter ne ferait que redemander au relais) ;
 *  · autre échec · on LÈVE, BullMQ retente (attente exponentielle) ;
 *  · plus rien à tenter · ALERTE explicite · la semaine n'est pas servie, et
 *    ce journal est le seul endroit qui le dit.
 */
export async function passageRecap(job: JobRecap): Promise<unknown> {
  const r = await triggerDigest();
  const s = suiteRecap(r, {
    reports: Number(job.data?.reports) || 0,
    tentative: (job.attemptsMade ?? 0) + 1,
    tentativesMax: job.opts?.attempts ?? TENTATIVES_RECAP,
  });
  if (s.action === 'fini') {
    // Servie · mais des courriels abandonnés (refus définitif) ne sont jamais
    // partis. La route les a notés parce qu'ils restaient l'exception · un
    // humain doit quand même le savoir.
    const abandons = Number(r.corps?.abandoned) || 0;
    if (abandons > 0) console.error(`[digest] ALERTE · récap hebdomadaire servi, mais ${abandons} courriel(s) ABANDONNÉ(S) sur refus définitif (boîte inexistante) · vérifier ces adresses (journal web « courriel abandonné »)`);
    return r;
  }
  if (s.action === 'sans_smtp') {
    console.warn(`[digest] SMTP non configuré · lettres servies dans l’application (${Number(r.corps?.notified) || 0} notification(s)) · courriels non envoyés · poser SMTP_URL puis relancer GET /api/cron/digest la même semaine pour les envoyer`);
    return { sansSmtp: true };
  }
  if (s.action === 'reporter') {
    await queues.cron.add('weekly-digest', { reports: s.reports }, { ...OPTIONS_RECAP, delay: s.delaiMs });
    console.warn(`[digest] un passage tient la semaine · vérification reportée de ${Math.round(s.delaiMs / 60_000)} min (report ${s.reports})`);
    return { reporte: s.reports };
  }
  if (s.action === 'retenter') throw new Error(`récap hebdomadaire non servi · ${r.detail ?? r.status ?? 'inconnu'}`);
  if (s.disjoncteur) {
    console.error(`[digest] ALERTE · ${s.raison}`);
    return { abandon: s.raison, disjoncteur: true };
  }
  console.error(`[digest] ALERTE · récap hebdomadaire NON SERVI cette semaine · ${s.raison} · relancer GET /api/cron/digest (la reprise ne double rien) et lire le journal web « [cron:digest] »`);
  return { abandon: s.raison };
}
