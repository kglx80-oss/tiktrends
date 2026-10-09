import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyserMigrationSql, classerInstructionSql, decouperInstructionsSql,
  violationsJournalMigrations, migrationsEnAttente, migrationsMasquees,
  type EntreeJournalMigration,
} from '@tiktrends/core';

/**
 * Studios · L9 · MIG-01 · ce que 0054 et 0055 font aux données existantes,
 * PROUVÉ sur deux plans :
 *
 *  · lecture du SQL réel (règle pure `migration-additive`) : aucune écriture
 *    de données, aucune destruction, chaque instruction rejouable. La même
 *    règle voit bien les backfills HISTORIQUES (0045, 0053) : elle regarde la
 *    bonne chose, elle ne dit pas « additif » à tout ;
 *  · base Postgres réelle en mémoire (pglite) : migrations 0000→0053, lignes
 *    existantes, puis 0054/0055 appliquées, rejouées, et appliquées après une
 *    interruption au milieu de 0054 (moitié des instructions passées hors
 *    transaction) · même schéma final, mêmes lignes, aucun doublon.
 *
 * La preuve avec le VRAI migrateur drizzle, coupé puis en échec forcé, sur
 * Postgres 16, est `ops/migration/verifier-migration.sh` (hors CI : il lui
 * faut un serveur Postgres local).
 */

const DIR = join(process.cwd(), '../../packages/db/drizzle');
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: EntreeJournalMigration[] };
const fichier = (tag: string) => readFileSync(join(DIR, `${tag}.sql`), 'utf8');
const NOUVELLES = ['0054_studios_fondations', '0055_ai_spend_reconciliation'];

describe('lecture du SQL · 0054 et 0055 sont additives et rejouables', () => {
  for (const tag of NOUVELLES) {
    it(`${tag} · aucune écriture de données, aucune destruction, tout rejouable`, () => {
      const a = analyserMigrationSql(fichier(tag));
      expect(a.instructions.length).toBeGreaterThan(0);
      expect(a.ecritures.map((x) => `${x.rang} ${x.extrait}`), 'écriture de données au passage de la migration (backfill)').toEqual([]);
      expect(a.destructives.map((x) => `${x.rang} ${x.extrait}`), 'instruction destructive').toEqual([]);
      expect(a.inconnues.map((x) => `${x.rang} ${x.extrait}`), 'instruction non reconnue · non prouvée additive').toEqual([]);
      expect(a.nonRejouables.map((x) => `${x.rang} ${x.extrait}`), 'instruction non rejouable').toEqual([]);
      expect(a.ajouteValeurEnum).toBe(false);
    });
  }

  it('0054 compte 57 instructions : 21 tables, 18 index, 4 fonctions, 11 déclencheurs, 3 blocs protégés', () => {
    const a = analyserMigrationSql(fichier('0054_studios_fondations'));
    const parGenre = a.instructions.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.genre]: (acc[x.genre] ?? 0) + 1 }), {});
    expect(parGenre).toEqual({ bloc_protege: 3, fonction: 4, declencheur: 11, creation_table: 21, creation_index: 18 });
  });

  it('référence · la même règle VOIT les backfills historiques (0045, 0053) et la destruction de 0035', () => {
    expect(analyserMigrationSql(fichier('0045_backfill_ad_source_ref')).ecritures.length).toBeGreaterThan(0);
    expect(analyserMigrationSql(fichier('0053_modern_quasar')).ecritures.length).toBeGreaterThan(0);
    expect(analyserMigrationSql(fichier('0035_purple_shatterstar')).destructives.length).toBeGreaterThan(0);
  });
});

describe('règle pure · classement des instructions', () => {
  const genre = (s: string) => classerInstructionSql(s).genre;
  it('écritures et destructions reconnues', () => {
    expect(genre('UPDATE "ai_spend" SET reconcile_reason = \'x\'')).toBe('ecriture_donnees');
    expect(genre('INSERT INTO brands (id) VALUES (1)')).toBe('ecriture_donnees');
    expect(genre('DELETE FROM generations')).toBe('ecriture_donnees');
    expect(genre('DROP TABLE "brands"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" DROP COLUMN "tone"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" RENAME COLUMN "tone" TO "ton"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ALTER COLUMN "tone" SET DATA TYPE integer')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ALTER COLUMN "tone" SET NOT NULL')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ADD COLUMN "x" text NOT NULL')).toBe('destructive');
    expect(genre('DO $$ BEGIN DELETE FROM brands; EXCEPTION WHEN duplicate_object THEN null; END $$')).toBe('destructive');
    expect(genre('VACUUM brands')).toBe('inconnue');
  });
  it('ajouts reconnus, rejouables seulement avec leur garde', () => {
    expect(classerInstructionSql('ALTER TABLE "ai_spend" ADD COLUMN IF NOT EXISTS "r" text').rejouable).toBe(true);
    expect(classerInstructionSql('ALTER TABLE "ai_spend" ADD COLUMN "r" text').rejouable).toBe(false);
    expect(classerInstructionSql('CREATE INDEX "i" ON "t" ("a")').rejouable).toBe(false);
    expect(classerInstructionSql('ALTER TABLE "t" ADD CONSTRAINT "c" UNIQUE ("a")').rejouable).toBe(false);
    expect(classerInstructionSql('DO $$ BEGIN ALTER TABLE "t" ADD CONSTRAINT "c" UNIQUE ("a"); EXCEPTION WHEN duplicate_object THEN null; END $$').genre).toBe('bloc_protege');
  });
  it('un corps de fonction n’est pas exécuté au passage : un UPDATE dedans ne compte pas, un « ; » dedans ne coupe pas', () => {
    const sql = `CREATE OR REPLACE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN UPDATE t SET a = 1; RETURN NEW; END $fn$;
--> statement-breakpoint
-- commentaire ; avec point-virgule
CREATE TABLE IF NOT EXISTS "t" ("a" text DEFAULT ';' NOT NULL);`;
    expect(decouperInstructionsSql(sql)).toHaveLength(2);
    const a = analyserMigrationSql(sql);
    expect(a.additive && a.rejouable).toBe(true);
  });
});

describe('journal · le migrateur drizzle n’ignore aucune migration', () => {
  it('le journal du dépôt est contigu et strictement croissant', () => {
    expect(violationsJournalMigrations(journal.entries)).toEqual([]);
  });
  it('une migration fusionnée avec un horodatage plus ancien serait IGNORÉE · la règle le dit', () => {
    const e: EntreeJournalMigration[] = [
      { idx: 0, when: 100, tag: '0000_a' }, { idx: 1, when: 300, tag: '0001_b' }, { idx: 2, when: 200, tag: '0002_c' },
    ];
    expect(violationsJournalMigrations(e).join('\n')).toMatch(/« 0002_c » .* le migrateur l’ignorerait/);
    expect(migrationsEnAttente(e, 300)).toEqual([]);
    expect(migrationsMasquees(e, [100, 300]).map((x) => x.tag)).toEqual(['0002_c']);
  });
  it('sur la production de main (0000→0053 appliquées), exactement 0054 puis 0055 sont en attente, rien de masqué', () => {
    const main = journal.entries.filter((x) => x.idx <= 53).map((x) => x.when);
    expect(migrationsEnAttente(journal.entries, Math.max(...main)).map((x) => x.tag)).toEqual(NOUVELLES);
    expect(migrationsMasquees(journal.entries, main)).toEqual([]);
  });
});

/* ───────────────────── Base réelle en mémoire (pglite) ────────────────────── */

const preparer = (sql: string) => sql
  .replace(/-->\s*statement-breakpoint/g, '')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
  .replace(/vector\(\d+\)/gi, 'text');

async function baseJusqua0053(): Promise<PGlite> {
  const pg = new PGlite();
  for (const e of journal.entries.filter((x) => x.idx <= 53)) await pg.exec(preparer(fichier(e.tag)));
  // Lignes existantes · celles que 0054/0055 touchent ou référencent. Dates
  // explicites partout : deux bases semées doivent avoir les mêmes lignes.
  await pg.exec(`
    SET TIME ZONE 'UTC';
    -- 0053 insère deux lignes datées de now() · on les fige pour comparer deux bases.
    UPDATE platform_staff SET created_at = '2026-08-01T00:00:00Z', updated_at = '2026-08-01T00:00:00Z';
    INSERT INTO workspaces (id, name, plan, created_at) VALUES ('a9000000-0000-4000-8000-000000000001', 'Espace L9', 'business', '2026-08-01T00:00:00Z');
    INSERT INTO users (id, email, created_at) VALUES ('a9000000-0000-4000-8000-000000000011', 'proprio@l9.exemple.test', '2026-08-01T00:00:00Z');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000011', 'owner');
    INSERT INTO brands (id, workspace_id, name, created_at) SELECT md5('b' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'Marque ' || i, '2026-08-01T00:00:00Z' FROM generate_series(1, 5) i;
    INSERT INTO personas (id, brand_id, name) VALUES (md5('p')::uuid, md5('b1')::uuid, 'Persona');
    INSERT INTO adsmap_desires (id, workspace_id, persona_id, label, created_at, updated_at) VALUES (md5('d')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('p')::uuid, 'Désir', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_angles (id, workspace_id, desire_id, label, mechanism, created_at, updated_at) VALUES (md5('a')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('d')::uuid, 'Angle', 'demo', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_concepts (id, workspace_id, angle_id, title, created_at, updated_at) VALUES (md5('c')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('a')::uuid, 'Concept', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_ads (id, workspace_id, concept_id, variant_code, created_at, updated_at) SELECT md5('ad' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('c')::uuid, 'V' || i, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z' FROM generate_series(1, 30) i;
    INSERT INTO generations (id, brand_id, kind, input_json, status, created_at) SELECT md5('g' || i)::uuid, md5('b1')::uuid, 'ad', jsonb_build_object('headline', 'Pub ' || i), 'done', '2026-08-01T00:00:00Z' FROM generate_series(1, 40) i;
    INSERT INTO assets (id, workspace_id, brand_id, name, url, created_at) SELECT md5('m' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'Média ' || i, 'data:image/png;base64,AAAA' || i, '2026-08-01T00:00:00Z' FROM generate_series(1, 20) i;
    INSERT INTO ai_spend (id, workspace_id, provider, action, estimated_usd, actual_usd, created_at)
      SELECT md5('s' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'anthropic', 'ads.generate', i / 1000.0, i / 1100.0, timestamptz '2026-09-01T00:00:00Z' + (i || ' minutes')::interval FROM generate_series(1, 200) i;
  `);
  return pg;
}

async function lignes<T>(pg: PGlite, sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

/** Empreinte des données des tables EXISTANTES, restreinte à leurs colonnes d'avant. */
async function empreinteDonnees(pg: PGlite, colonnes: Map<string, string>): Promise<string[]> {
  const out: string[] = [];
  for (const [t, cols] of colonnes) {
    const [r] = await lignes<{ n: number; h: string }>(pg, `select count(*)::int as n, md5(coalesce(string_agg(h, ',' order by h), '')) as h from (select md5(row(${cols})::text) as h from public."${t}") s`);
    out.push(`${t}|${r!.n}|${r!.h}`);
  }
  return out;
}

async function colonnesDe(pg: PGlite): Promise<Map<string, string>> {
  const rs = await lignes<{ t: string; c: string }>(pg, `
    select c.relname as t, string_agg(quote_ident(a.attname), ',' order by a.attnum) as c
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' group by c.relname order by c.relname`);
  return new Map(rs.map((r) => [r.t, r.c]));
}

async function empreinteSchema(pg: PGlite): Promise<string[]> {
  const rs = await lignes<{ l: string }>(pg, `
    select 'col ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' NN' else '' end as l
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
    union all select 'con ' || conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
    union all select 'idx ' || pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union all select 'trg ' || pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname = 'public'
    union all select 'fn ' || p.proname || ' ' || md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    order by 1`);
  return rs.map((r) => r.l);
}

async function appliquer(pg: PGlite, tags: readonly string[]) {
  for (const tag of tags) await pg.exec(preparer(fichier(tag)));
}

// Une ou deux bases pglite par test, 56 migrations chacune. Mesuré le 9 octobre sur 4 cœurs : 10 et 11 s seul
// (charge 20), 28 et 36 s dans la suite complète (charge ~30), au-delà des 30 s par défaut. Limite explicite, marge x3.
describe('base réelle en mémoire · appliquer, rejouer, reprendre après interruption', () => {
  it('lignes existantes intactes, nouvelles tables vides, colonne ajoutée vide · rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);

    await appliquer(pg, NOUVELLES);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0054/0055').toEqual(avant);
    const nouvelles = [...(await colonnesDe(pg)).keys()].filter((t) => !avantCols.has(t));
    expect(nouvelles).toHaveLength(21);
    for (const t of nouvelles) {
      const [r] = await lignes<{ n: number }>(pg, `select count(*)::int as n from "${t}"`);
      expect(r!.n, `backfill dans ${t}`).toBe(0);
    }
    const [rc] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from ai_spend where reconcile_reason is not null');
    expect(rc!.n).toBe(0);

    const schemaUneFois = await empreinteSchema(pg);
    const toutUneFois = await empreinteDonnees(pg, await colonnesDe(pg));
    await appliquer(pg, NOUVELLES);
    await appliquer(pg, NOUVELLES);
    expect(await empreinteSchema(pg), 'rejeu · objet ajouté ou dupliqué').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, await colonnesDe(pg)), 'rejeu · lignes modifiées').toEqual(toutUneFois);
    await pg.close();
  }, 120_000);

  it('interruption au milieu de 0054 (moitié des instructions passées) puis reprise · même base que d’un seul trait', async () => {
    const propre = await baseJusqua0053();
    await appliquer(propre, NOUVELLES);
    const schemaPropre = await empreinteSchema(propre);
    const donneesPropres = await empreinteDonnees(propre, await colonnesDe(propre));
    await propre.close();

    const pg = await baseJusqua0053();
    const instr = decouperInstructionsSql(fichier('0054_studios_fondations'));
    const moitie = Math.floor(instr.length / 2);
    for (const s of instr.slice(0, moitie)) await pg.exec(preparer(`${s};`));
    // La reprise rejoue TOUT 0054 puis 0055, comme le migrateur qui n'a rien inscrit au journal.
    await appliquer(pg, NOUVELLES);
    expect(await empreinteSchema(pg), 'reprise · schéma différent d’une application d’un seul trait').toEqual(schemaPropre);
    expect(await empreinteDonnees(pg, await colonnesDe(pg)), 'reprise · lignes différentes').toEqual(donneesPropres);
    await pg.close();
  }, 120_000);
});
