import { Worker } from 'bullmq';
import { connection } from './queue';

/**
 * Studios · le worker des jobs `studio_jobs` (lots L3+). Il ne démarre QUE si
 * un fournisseur RÉEL est branché : aucun ne l'est encore (lots L5/L6). Le
 * fournisseur simulé des tests n'est jamais importé ici et refuse la
 * production. Sans fournisseur, les jobs approuvés restent `queued` (réserve
 * intacte, rien de facturé) et l'écran le dit.
 */
export function startStudioWorker(): void {
  console.log('[studios] aucun fournisseur de génération branché · worker studio non démarré, jobs laissés en file.');
}

/** Règle CDC : aucun job IA dans une requête HTTP — tout passe ici. */
export function startWorkers() {
  startStudioWorker();
  const radar = new Worker(
    'radar',
    async (job) => {
      // TODO Sprint 3 : charger metrics_daily -> computeRadar() -> upsert radar_scores.
      return { ok: true, id: job.id, name: job.name };
    },
    { connection },
  );
  radar.on('completed', (j) => console.log('[radar] completed', j.id));
  radar.on('failed', (j, err) => console.error('[radar] failed', j?.id, err));
  return { radar };
}
