/**
 * F-A · R2 · le WORKER d'une course mixte site/worker, dans son PROPRE processus.
 *
 * Lancé par `apps/web/test/fa-course-mixte-pg.test.ts` (jamais par vitest : pas
 * de suffixe `.test`). Il compose la barrière du worker EXACTEMENT comme la
 * production (`portDepenseBase` de `src/studios/fournisseurs.ts` sur le client
 * `@tiktrends/db` de son processus, `BarriereDepenseStudio`), contre la base
 * PostgreSQL locale passée dans `DATABASE_URL`. Aucun fournisseur appelé :
 * l'appel payant est une fonction locale qui compte.
 *
 * Deux modes (`FA_MODE`) :
 *  · `verrou` · UNE réservation ; la décision est retardée de `FA_TENUE_MS`
 *    (attente active : le processus web est ailleurs, il n'est pas gelé),
 *    APRÈS la lecture de la somme et AVANT l'insertion. La ligne « VERROU »
 *    est écrite au moment où la somme vient d'être lue. Ordre forcé : le web
 *    tente sa dépense pendant cette fenêtre.
 *  · `course` · écrit « PRET », attend « GO <instant> » sur l'entrée standard, puis lance
 *    `FA_JOBS` réservations simultanées à cet instant d'horloge.
 * Résultat : une ligne JSON `{"passees":n,"appels":n,"refus":n,"jobs":[…]}`.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { db, sql } from '@tiktrends/db';
import { BarriereDepenseStudio, type PortDepense } from '@tiktrends/integrations';
import { portDepenseBase } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';

const mode = process.env.FA_MODE ?? 'course';
const usd = Number(process.env.FA_USD ?? '0.08');
const n = Number(process.env.FA_JOBS ?? '1');
const tenue = Number(process.env.FA_TENUE_MS ?? '0');
const ws = process.env.FA_ESPACE ?? randomUUID();

function attenteActive(ms: number) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { /* la transaction du worker reste ouverte, verrou tenu */ }
}

async function main() {
  if (!db) throw new Error('DATABASE_URL absente');
  const reel = portDepenseBase(db as unknown as BaseStudio);
  const port: PortDepense = mode === 'verrou'
    ? {
      reserver: (l, o) => reel.reserver(l, {
        ...o,
        decider: (depense) => {
          process.stdout.write(`VERROU ${depense}\n`);
          attenteActive(tenue);
          return o.decider(depense);
        },
      }),
      annuler: reel.annuler,
    }
    : reel;
  const barriere = new BarriereDepenseStudio({ port, env: process.env });
  const jobs = Array.from({ length: n }, () => randomUUID());

  if (mode === 'course') {
    // Connexions ouvertes AVANT le départ : sans ça, le site finit sa course
    // pendant que le worker ouvre encore ses connexions, et rien ne se croise.
    await Promise.all(jobs.map(() => db.execute(sql`select pg_sleep(0.05)`)));
    process.stdout.write('PRET\n');
    const rl = createInterface({ input: process.stdin });
    // « GO <instant> » : les deux processus partent au même instant d'horloge.
    const depart = await new Promise<number>((ok) => rl.on('line', (l) => { const m = /^GO (\d+)$/.exec(l.trim()); if (m) { rl.close(); ok(Number(m[1])); } }));
    await new Promise((r) => setTimeout(r, Math.max(0, depart - Date.now())));
  }

  // `FA_PAS_MS` : les réservations partent par vagues (job i à i × pas), pour
  // que celles du site et du worker se croisent dans la file du verrou.
  const pas = Number(process.env.FA_PAS_MS ?? '0');
  let appels = 0;
  const issues = await Promise.allSettled(jobs.map(async (jobId, i) => {
    if (pas > 0) await new Promise((r) => setTimeout(r, i * pas));
    return barriere.sousPlafondStudio(
      { workspaceId: ws, jobId, usd, modele: 'fal_image' },
      async () => { appels += 1; return 'ok'; },
    );
  }));
  const passees = issues.filter((r) => r.status === 'fulfilled').length;
  process.stdout.write(`${JSON.stringify({ passees, appels, refus: issues.length - passees, jobs })}\n`);
  process.exit(0);
}

main().catch((e) => { process.stderr.write(`ECHEC ${(e as Error).message}\n`); process.exit(2); });
