import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '@tiktrends/db';
import { demarrerWorkerStudio } from '../studios/fournisseurs';
import type { BaseStudio } from '../studios/types';

/**
 * Worker du projet compose de RECETTE (`tiktrends-recette`) · point d'entrée
 * DÉDIÉ, à la place de `src/index.ts`.
 *
 * `index.ts` démarre en production, sans que personne ne clique : les crons
 * tracker-scan (04:00), radar-scan (05:00, décrit des créas à l'IA, payant),
 * daily-sync (06:00, Shopify et Meta), adsmap-sync (07:00, Meta), le worker
 * d'ingestion, le worker radar, et deux jobs de démonstration. AUCUN ne doit
 * tourner pendant l'essai réel : le budget de 15 $ est réservé au pas 1 et au
 * benchmark, lancés explicitement par le propriétaire.
 *
 * Ici, la seule chose qui peut démarrer est la boucle Studios, et elle ne
 * démarre pas dans la recette : `FAL_KEY` et `S3_*` y sont neutralisées
 * (`ops/recette/neutralise.env`), `decisionFournisseurStudio` refuse et le dit
 * (« jobs laissés en file, rien facturé »). Le pas 1 exécute le moteur
 * lui-même. Rien n'est importé de `../queue` : aucune connexion Redis, aucune
 * file BullMQ, aucune planification. Garde : `test/e-worker-recette.test.ts`.
 */
export function demarrerWorkerRecette(o: {
  env: Readonly<Record<string, string | undefined>>;
  base: BaseStudio | null | undefined;
  fetch: typeof fetch;
  log?: (m: string) => void;
}): { studios: ReturnType<typeof demarrerWorkerStudio> } {
  const log = o.log ?? ((m: string) => console.log(m));
  log('[recette] worker de recette · boucle Studios seule · aucun cron (tracker, radar, synchro, Adsmap), aucune ingestion, aucun job de démonstration.');
  const studios = demarrerWorkerStudio({ env: o.env, base: o.base, fetch: o.fetch, log });
  return { studios };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = demarrerWorkerRecette({ env: process.env, base: db ?? null, fetch: globalThis.fetch });
  // Sans boucle, le processus reste en vie, inerte (conteneur visible et sain).
  if (!r.studios) setInterval(() => {}, 1 << 30);
}
