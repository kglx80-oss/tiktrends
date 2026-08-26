import { Worker } from 'bullmq';
import { queues, connection } from './queue';
import { startWorkers } from './worker';
import { startIngestWorker } from './ingest';
import { runDailySync } from './sync';
import { fixtures } from '@tiktrends/integrations';

/** Worker « cron » : traite les tâches planifiées (ex : synchro data quotidienne). */
function startCronWorker() {
  const w = new Worker('cron', async (job) => {
    if (job.name === 'daily-sync') return await runDailySync();
    return { skipped: job.name };
  }, { connection });
  w.on('completed', (j) => console.log('[cron] completed', j.name));
  w.on('failed', (j, err) => console.error('[cron] failed', j?.name, err));
  return w;
}

// Démo de bout en bout : enqueue -> worker -> résultat.
async function main() {
  startWorkers();
  startIngestWorker();
  startCronWorker();

  // Synchro quotidienne des sources de données (Shopify + Meta) · 6h du matin.
  await queues.cron.add('daily-sync', {}, {
    repeat: { pattern: '0 6 * * *' },
    jobId: 'daily-sync', // idempotent : un seul planning
    removeOnComplete: 20, removeOnFail: 20,
  });

  await queues.ingest.add('demo-tiktok', { platform: 'tiktok', ads: (fixtures.tiktok as { ads: unknown[] }).ads });
  await queues.radar.add('demo', { brandId: 'demo' });
  console.log('[workers] up · cron daily-sync planifié (06:00) + jobs démo');
}
main().catch((e) => { console.error(e); process.exit(1); });
