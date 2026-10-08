import { Worker } from 'bullmq';
import { db } from '@tiktrends/db';
import { connection } from './queue';
import { demarrerWorkerStudio } from './studios/fournisseurs';

/**
 * Studios · le worker des jobs `studio_jobs` (lots L3+, branchement F-A).
 *
 * Il démarre la boucle L3 (`boucle.ts`) avec le fournisseur fal RÉEL et le
 * stockage S3 existant SEULEMENT si la règle `decisionFournisseurStudio` le
 * permet (vraie `FAL_KEY`, production ou `STUDIO_FOURNISSEUR_REEL=autorise`,
 * `S3_*` posés). Sinon il ne démarre pas et le dit : jobs approuvés laissés
 * `queued`, réserve intacte, rien facturé. Le fournisseur simulé des tests
 * n'est jamais importé ici et refuse la production.
 */
export function startStudioWorker(): ReturnType<typeof demarrerWorkerStudio> {
  return demarrerWorkerStudio({ env: process.env, base: db ?? null, fetch: globalThis.fetch });
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
