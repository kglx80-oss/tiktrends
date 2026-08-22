import { queues } from './queue';
import { startWorkers } from './worker';

// Démo de bout en bout : enqueue -> worker -> résultat (prouve la chaîne asynchrone).
async function main() {
  startWorkers();
  await queues.radar.add('demo', { brandId: 'demo' });
  console.log('[workers] up · job démo "radar" enfilé');
}
main().catch((e) => { console.error(e); process.exit(1); });
