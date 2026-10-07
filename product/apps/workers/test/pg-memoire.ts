import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schema } from '@tiktrends/db';
import type { BaseStudio } from '../src/studios/types';

/**
 * Vraie base Postgres en mémoire (pglite) avec les migrations RÉELLES du dépôt ·
 * même harnais que `apps/web/test/helpers/pg-memoire.ts`.
 */
export async function pgMemoire(): Promise<BaseStudio> {
  const pg = new PGlite();
  const dir = join(process.cwd(), '../../packages/db/drizzle');
  const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  for (const e of journal.entries) {
    const texte = readFileSync(join(dir, `${e.tag}.sql`), 'utf8')
      .replace(/-->\s*statement-breakpoint/g, '')
      .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
      .replace(/vector\(\d+\)/gi, 'text');
    await pg.exec(texte);
  }
  return drizzle(pg, { schema }) as unknown as BaseStudio;
}
