import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un passage cron qui a un déclencheur doit être PLANIFIÉ.
 *
 * ── Le trou que ce garde ferme ───────────────────────────────────────────────
 *
 * La route `/api/cron/tracker` (scan des nouvelles pubs des concurrents suivis)
 * existait et était protégée, son mécanisme aussi (`scanAllTracker`) · mais rien
 * ne la déclenchait. Le worker planifiait radar, daily et adsmap, PAS le
 * tracker · le fil « tes concurrents viennent de sortir ça » ne se remplissait
 * donc jamais tout seul. « Ne pas oublier de planifier » n'est pas une règle
 * applicable · voici la vérification qui ne dépend de personne.
 *
 * Chaque déclencheur worker → web (`triggerX` → `/api/cron/X`) doit avoir son
 * job planifié ET son cas dans le handler. Ce garde tombe si l'un des trois
 * n'est pas branché de bout en bout.
 */

const workers = (f: string) => readFileSync(join(process.cwd(), '..', 'workers', 'src', f), 'utf8');
const INDEX = workers('index.ts');
const TRIGGERS = workers('adsmap.ts');

// job planifié → cas du handler → route appelée.
const PASSAGES = [
  { job: 'tracker-scan', route: '/api/cron/tracker', trigger: 'triggerTracker' },
  { job: 'radar-scan', route: '/api/cron/radar', trigger: 'triggerRadar' },
  { job: 'adsmap-sync', route: '/api/cron/adsmap', trigger: 'triggerAdsMapSync' },
];

describe('chaque passage cron est branché de bout en bout', () => {
  for (const p of PASSAGES) {
    it(`${p.job} · planifié, écouté, et relié à ${p.route}`, () => {
      // 1. Planifié · une entrée cron répétée.
      expect(INDEX, `${p.job} n'est pas planifié`).toContain(`queues.cron.add('${p.job}'`);
      // 2. Écouté · un cas dans le handler du worker.
      expect(INDEX, `${p.job} n'a pas de cas dans le handler`).toContain(`job.name === '${p.job}'`);
      // 3. Relié · le déclencheur appelle la bonne route protégée.
      expect(TRIGGERS, `${p.trigger} n'appelle pas ${p.route}`).toContain(`triggerCron('${p.route}'`);
    });
  }
});
