import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_IN_BUILD } from '@tiktrends/db';

/**
 * Le compte recopié doit suivre le journal.
 *
 * `MIGRATIONS_IN_BUILD` sert à dire « 4 migrations en attente » dans le produit.
 * Un compte périmé ferait dire « à jour » à un déploiement qui ne l'est pas ·
 * c'est-à-dire mentir précisément là où on a construit un écran pour ne plus
 * avoir à deviner.
 */
describe('le compte de migrations suit le journal', () => {
  it('correspond au nombre d’entrées', () => {
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), '../../packages/db/drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    expect(
      MIGRATIONS_IN_BUILD,
      `Le journal compte ${journal.entries.length} migrations · mets MIGRATIONS_IN_BUILD à cette valeur `
      + 'dans packages/db/src/journal.ts.',
    ).toBe(journal.entries.length);
  });
});
