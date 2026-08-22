import { queues } from './queue';
import { startWorkers } from './worker';
import { startIngestWorker } from './ingest';
import { fixtures } from '@tiktrends/integrations';

// Démo de bout en bout : enqueue -> worker -> résultat.
async function main() {
  startWorkers();
  startIngestWorker();
  await queues.ingest.add('demo-tiktok', { platform: 'tiktok', ads: (fixtures.tiktok as { ads: unknown[] }).ads });
  await queues.radar.add('demo', { brandId: 'demo' });
  console.log('[workers] up · jobs démo "ingest" + "radar" enfilés');
}
main().catch((e) => { console.error(e); process.exit(1); });
