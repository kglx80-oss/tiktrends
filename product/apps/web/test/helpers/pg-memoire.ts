import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une vraie base Postgres en mémoire (pglite, WASM) pour les tests · le dépôt
 * n'en avait pas, d'où des gardes de requête sur le TEXTE SOURCE plutôt que sur
 * le RÉSULTAT. Ce harnais applique les migrations réelles et rend un client
 * drizzle · on peut alors semer deux marques / deux utilisateurs et vérifier
 * l'isolation pour de vrai (« vérifier un RÉSULTAT », doctrine maison).
 */
export async function pgMemoire(schema: Record<string, unknown>) {
  const pg = new PGlite();
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
  return drizzle(pg, { schema });
}
