import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une vraie base Postgres en mémoire (pglite, WASM) pour les tests · le dépôt
 * n'en avait pas, d'où des gardes de requête sur le TEXTE SOURCE plutôt que sur
 * le RÉSULTAT. Ce harnais applique les migrations réelles et rend un client
 * drizzle · on peut alors semer deux marques / deux utilisateurs et vérifier
 * l'isolation pour de vrai (« vérifier un RÉSULTAT », doctrine maison).
 *
 * ── Un semis par exécution, plus un par fichier ─────────────────────────────
 *
 * Monter une base neuve coûte un `initdb` complet puis toutes les migrations ·
 * mesuré le 2026-11-02 sur 4 vCPU : `new PGlite()` prêt en 2,2 s (charge 0,7)
 * à 2,2-3,3 s (machine chargée, 4 essais), migrations 0,5 s, contre 0,4 s pour
 * recharger le répertoire de données d'une base déjà migrée. ~195 fichiers de
 * test web montent leur base · ~2,3 s épargnées chacun, ~450 s de travail sur
 * les 2 298 s cumulées de la suite web en CI (run 41439776206 : collect 1 459 s).
 * `turbo run test --force` local, avant → après (machine partagée, charge
 * 10-14, un essai chacun · bruité, la CI fait foi) : temps CPU total
 * 2 670 s → 1 905 s ; collect web cumulé rapporté à celui du noyau (même
 * exécution, neutralise la charge) 15,0 → 7,8.
 *
 * `semis-global.ts` (globalSetup vitest) migre donc UNE base au démarrage de
 * l'exécution, en dépose l'image (`dumpDataDir`) dans un dossier temporaire et
 * en publie le chemin dans `VAR_INSTANTANE`. Chaque fichier recharge cette image
 * (`loadDataDir`) · le répertoire de données d'une base migrée par le même code
 * (`baseMigreeNeuve`), au lieu de le refaire dans chaque fichier. L'image est refaite à CHAQUE
 * exécution, jamais reprise d'une précédente : une migration ajoutée ou modifiée
 * est toujours vue. `pg-memoire-instantane.test.ts` prouve l'équivalence (même
 * schéma, mêmes données) et que l'image est bien servie aux fichiers.
 *
 * Hors vitest (variable absente), on retombe sur le chemin complet.
 */
export const VAR_INSTANTANE = 'TT_PG_MEMOIRE_INSTANTANE';

async function migrer(pg: PGlite): Promise<void> {
  const dir = join(process.cwd(), '../../packages/db/drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  for (const e of journal.entries) {
    // Les migrations drizzle séparent leurs statements par `--> statement-breakpoint` ·
    // on retire le marqueur, pglite exécute la suite de statements terminés par `;`.
    // pglite (0.5.x) n'embarque pas l'extension `vector` · comme aucun test ne
    // lit les embeddings, on la neutralise (extension retirée, colonnes en text).
    const sql = readFileSync(join(dir, `${e.tag}.sql`), 'utf8')
      .replace(/-->\s*statement-breakpoint/g, '')
      .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
      .replace(/vector\(\d+\)/gi, 'text');
    await pg.exec(sql);
  }
}

/** Base neuve, `initdb` puis toutes les migrations du dépôt · le chemin complet. */
export async function baseMigreeNeuve(): Promise<PGlite> {
  const pg = new PGlite();
  await migrer(pg);
  return pg;
}

/** Image du répertoire de données d'une base neuve et migrée (tar non compressé). */
export async function imageBaseMigree(): Promise<Uint8Array> {
  const pg = await baseMigreeNeuve();
  const tar = await pg.dumpDataDir('none');
  await pg.close();
  return new Uint8Array(await tar.arrayBuffer());
}

/** La base migrée · rechargée depuis l'image du semis global quand elle existe. */
export async function pgMemoireBrut(): Promise<PGlite> {
  const chemin = process.env[VAR_INSTANTANE];
  if (chemin && existsSync(chemin)) {
    const pg = new PGlite({ loadDataDir: new Blob([readFileSync(chemin)]) });
    await pg.waitReady;
    return pg;
  }
  return baseMigreeNeuve();
}

export async function pgMemoire(schema: Record<string, unknown>) {
  return drizzle(await pgMemoireBrut(), { schema });
}

/**
 * Base migrée SUR PLACE, jamais rechargée depuis l'image · réservée aux gardes
 * de TEMPS (`budgetGarde`, `chronometrerAsync`). Leurs budgets
 * (`packages/core/src/perf/mesures.ts`) ont été mesurés sur une base migrée sur
 * place ; une base rechargée par `loadDataDir` a une queue de temps CPU plus
 * lourde, sans rapport avec le produit (Postgres réel en production).
 *
 * Mesuré le 2026-11-02, `l8c-budgets-web` · enregistrement · petit, 20 tirages,
 * p95 du temps CPU, machine partagée (charge ≈ 12), essais alternés :
 *
 * | base                                   | p95 CPU (ms), 6 essais        | médiane CPU |
 * |----------------------------------------|-------------------------------|-------------|
 * | migrée sur place (avant #1020)          | 29 · 31 · 37 · 30 · 30 · 30   | ≈ 20 ms     |
 * | rechargée, image lue en mémoire (#1020) | 65 · 43 · 38 · 39 · 53 · 52   | ≈ 22 ms     |
 * | rechargée, image lue depuis le disque   | 47 · 49 · 41 · 49 · 55 · 44   | ≈ 22 ms     |
 * | migrée sur place (ce correctif)          | 26 · 29 · 33 · 24 · 30 · 35   | ≈ 18 ms     |
 *
 * La médiane bouge peu, la queue monte de ~60 % · la CI GitHub (4 vCPU) a vu
 * un tirage à 123,7 ms pour un budget de 100 ms (33,06 ms × 3) sur main db9f4f4.
 * `gardes-temps-base-neuve.test.ts` refuse qu'une garde de temps reprenne
 * `pgMemoire`.
 */
export async function pgMemoireNeuve(schema: Record<string, unknown>) {
  return drizzle(await baseMigreeNeuve(), { schema });
}
