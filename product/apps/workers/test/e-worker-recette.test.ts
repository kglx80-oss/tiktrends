import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Recette Studios · lot E · le worker du projet de recette ne lance AUCUNE
 * tâche automatique : ni file BullMQ, ni planification (crons tracker, radar,
 * synchro, Adsmap), ni ingestion, ni job de démonstration, ni connexion Redis.
 * Constaté au RÉSULTAT : on compte les files, workers et connexions créés par
 * l'import ET le démarrage du point d'entrée, avec l'environnement EFFECTIF
 * de la recette (stockage et clés neutralisés).
 */

const compteur = vi.hoisted(() => ({ files: [] as string[], workers: [] as string[], planifies: [] as string[], redis: 0 }));
vi.mock('bullmq', () => ({
  Queue: class { constructor(n: string) { compteur.files.push(n); } add(nom: string) { compteur.planifies.push(nom); return Promise.resolve(); } },
  Worker: class { constructor(n: string) { compteur.workers.push(n); } on() { return this; } },
}));
vi.mock('ioredis', () => ({ default: class { constructor() { compteur.redis += 1; } } }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** L'environnement de recette effectif · `neutralise.env` versionné, chargé en dernier (comme le compose). */
function envRecette(): Record<string, string> {
  const neutre: Record<string, string> = {};
  for (const l of readFileSync(join(process.cwd(), '..', '..', 'ops', 'recette', 'neutralise.env'), 'utf8').split('\n')) {
    const t = l.trim();
    if (t && !t.startsWith('#') && t.includes('=')) neutre[t.slice(0, t.indexOf('='))] = t.slice(t.indexOf('=') + 1);
  }
  return { TIKTRENDS_ENV: 'recette', AI_SPEND_CAP_USD: '15', REDIS_URL: 'redis://redis_recette:6379', FAL_KEY: 'cle-collee-par-erreur', S3_BUCKET: 'bucket-de-prod', ...neutre };
}

describe('Worker de recette · aucune tâche automatique', () => {
  beforeEach(() => { compteur.files = []; compteur.workers = []; compteur.planifies = []; compteur.redis = 0; });

  it('import + démarrage : aucune file, aucun worker BullMQ, aucune planification, aucune connexion Redis, boucle Studios non démarrée', async () => {
    const { demarrerWorkerRecette } = await import('../src/recette/worker-recette');
    const logs: string[] = [];
    const r = demarrerWorkerRecette({ env: envRecette(), base: {} as never, fetch: (async () => { throw new Error('aucun appel réseau attendu'); }) as typeof fetch, log: (m) => logs.push(m) });
    expect(r.studios).toBeNull();
    expect(compteur).toEqual({ files: [], workers: [], planifies: [], redis: 0 });
    expect(logs).toEqual([
      '[recette] worker de recette · boucle Studios seule · aucun cron (tracker, radar, synchro, Adsmap), aucune ingestion, aucun job de démonstration.',
      '[studios] aucun fournisseur de génération branché (FAL_KEY absente) · worker studio non démarré, jobs laissés en file, rien facturé.',
    ]);
  });

  it('témoin · le point d’entrée de production, lui, crée files, workers et crons (le compteur voit ce qu’il doit voir)', async () => {
    const { startWorkers } = await import('../src/worker');
    startWorkers();
    expect(compteur.files.length).toBeGreaterThan(0);
    expect(compteur.workers).toContain('radar');
    expect(compteur.redis).toBe(1);
  });
});
