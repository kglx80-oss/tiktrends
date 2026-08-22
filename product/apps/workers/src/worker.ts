import { Worker } from 'bullmq';
import { connection } from './queue';

/** Règle CDC : aucun job IA dans une requête HTTP — tout passe ici. */
export function startWorkers() {
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
