import { existsSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { VAR_INSTANTANE, baseMigreeNeuve, pgMemoireBrut } from './helpers/pg-memoire';

/**
 * Garde du semis unique (`helpers/pg-memoire.ts`, `helpers/semis-global.ts`).
 *
 * Les ~195 fichiers qui montent une base pglite rechargent désormais l'image
 * d'une base migrée une fois par exécution au lieu de refaire initdb +
 * migrations. Deux choses doivent rester vraies, et ce fichier les CONSTATE :
 *
 * 1. la base rechargée est la même que la base migrée sur place · même schéma
 *    (colonnes, défauts, index, contraintes, types énumérés, séquences) et mêmes
 *    données semées par les migrations. Sinon chaque test vérifierait autre chose
 *    que la vraie base ;
 * 2. l'image est réellement servie aux fichiers · sinon le gain disparaît en
 *    silence (repli sur le chemin complet) et la CI regagne ses minutes.
 */

/** Colonnes dont la valeur dépend de l'instant du semis · exclues de l'empreinte des données. */
const DEFAUT_VOLATIL = /now\(\)|current_|random|uuid|clock_/i;

async function empreinte(pg: PGlite): Promise<string[]> {
  const lignes = async (sql: string) => (await pg.query<{ l: string }>(sql)).rows.map((r) => r.l);
  const schemaLignes = await lignes(`
    select 'col ' || c.table_schema || '.' || c.table_name || '.' || c.column_name || ' ' || c.data_type
      || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, '-') as l
      from information_schema.columns c
     where c.table_schema not in ('pg_catalog', 'information_schema')
    union all
    select 'idx ' || pg_get_indexdef(i.indexrelid)
      from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    union all
    select 'con ' || n.nspname || '.' || co.conname || ' ' || pg_get_constraintdef(co.oid)
      from pg_constraint co join pg_namespace n on n.oid = co.connamespace
     where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
    union all
    select 'enum ' || t.typname || ' ' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
      from pg_type t join pg_enum e on e.enumtypid = t.oid group by t.typname
    union all
    select 'seq ' || schemaname || '.' || sequencename || ' ' || coalesce(last_value::text, '-') from pg_sequences
    order by 1`);

  const tables = (await pg.query<{ s: string; t: string }>(
    `select table_schema as s, table_name as t from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema') and table_type = 'BASE TABLE' order by 1, 2`,
  )).rows;
  const donnees: string[] = [];
  for (const { s, t } of tables) {
    const cols = (await pg.query<{ c: string; d: string | null }>(
      `select column_name as c, column_default as d from information_schema.columns
        where table_schema = $1 and table_name = $2 order by ordinal_position`, [s, t],
    )).rows.filter((x) => !DEFAUT_VOLATIL.test(x.d ?? '')).map((x) => `"${x.c}"`);
    const proj = cols.length ? `concat_ws('|', ${cols.map((c) => `${c}::text`).join(', ')})` : `''`;
    const r = (await pg.query<{ n: number; h: string }>(
      `select count(*)::int as n, md5(coalesce(string_agg(x, '#' order by x), '')) as h
         from (select ${proj} as x from "${s}"."${t}") q`,
    )).rows[0]!;
    donnees.push(`data ${s}.${t} ${r.n} ${r.h}`);
  }
  return [...schemaLignes, ...donnees];
}

describe('semis pglite unique · la base rechargée EST la base migrée', () => {
  it('l’image du semis global est publiée aux fichiers de test', () => {
    const chemin = process.env[VAR_INSTANTANE];
    expect(chemin, `${VAR_INSTANTANE} absente · globalSetup non branché, chaque fichier refait initdb + migrations`).toBeTruthy();
    expect(existsSync(chemin!), `image du semis introuvable : ${chemin}`).toBe(true);
  });

  it('même schéma et mêmes données semées qu’une base migrée sur place', async () => {
    const neuve = await baseMigreeNeuve();
    const rechargee = await pgMemoireBrut();
    const attendu = await empreinte(neuve);
    // Une empreinte vide comparerait deux riens · on exige le vrai schéma.
    expect(attendu.filter((l) => l.startsWith('col ')).length).toBeGreaterThan(500);
    expect(attendu.some((l) => l.startsWith('data public.platform_staff 2 '))).toBe(true);
    expect(await empreinte(rechargee), 'base rechargée ≠ base migrée').toEqual(attendu);
    await neuve.close();
    await rechargee.close();
  }, 120_000);
});
