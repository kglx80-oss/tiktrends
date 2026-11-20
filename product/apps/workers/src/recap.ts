import { ATTENTE_RECAP_MS, TENTATIVES_RECAP, suiteRecap } from '@tiktrends/core';
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
 * `passageRecap` · bloqué deux fois par des redéploiements (BullMQ le classe
 * « stalled » puis échoué), ou une exception imprévue à la dernière
 * tentative. Même ALERTE · une semaine ne se perd pas en silence. Une
 * tentative intermédiaire qui échoue (BullMQ va retenter) ne crie pas.
 */
export function alerteEchecRecap(job: JobRecap | undefined, err: Error | undefined): boolean {
  if (!job || job.name !== 'weekly-digest') return false;
  const derniere = (job.attemptsMade ?? 0) >= (job.opts?.attempts ?? 1);
  const bloque = /stalled/i.test(err?.message ?? '');
  if (!derniere && !bloque) return false;
  console.error(`[digest] ALERTE · récap hebdomadaire NON SERVI cette semaine · job en échec définitif (${bloque ? 'bloqué par des redémarrages' : `tentative ${job.attemptsMade}/${job.opts?.attempts}`} · ${err?.message ?? 'inconnu'}) · relancer GET /api/cron/digest (la reprise ne double rien) et lire le journal web « [cron:digest] »`);
  return true;
}

/**
 * Un déclenchement de `weekly-digest` · la route, puis la suite que dit le
 * noyau (`suiteRecap`) :
 *  · servi · fini ;
 *  · 409 `en_cours` · un passage vivant tient la semaine · on REPORTE une
 *    vérification (job différé, données `reports`) au lieu de lever · aucune
 *    tentative n'est consommée, et le nombre de reports est borné ;
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
  if (s.action === 'reporter') {
    await queues.cron.add('weekly-digest', { reports: s.reports }, { ...OPTIONS_RECAP, delay: s.delaiMs });
    console.warn(`[digest] un passage tient la semaine · vérification reportée de ${Math.round(s.delaiMs / 60_000)} min (report ${s.reports})`);
    return { reporte: s.reports };
  }
  if (s.action === 'retenter') throw new Error(`récap hebdomadaire non servi · ${r.detail ?? r.status ?? 'inconnu'}`);
  console.error(`[digest] ALERTE · récap hebdomadaire NON SERVI cette semaine · ${s.raison} · relancer GET /api/cron/digest (la reprise ne double rien) et lire le journal web « [cron:digest] »`);
  return { abandon: s.raison };
}
