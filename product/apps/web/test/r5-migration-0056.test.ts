import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyserMigrationSql, violationsJournalMigrations, type EntreeJournalMigration } from '@tiktrends/core';

/**
 * R5 · migration 0056 (`ai_spend_reconciliations`) · additive, rejouable,
 * en ajout seul, PROUVÉ :
 *
 *  · lecture du SQL réel (règle pure `migration-additive`) : aucune écriture
 *    de données, aucune destruction, chaque instruction rejouable ; horodatage
 *    du journal strictement supérieur au précédent (sinon le migrateur
 *    l'ignorerait) ;
 *  · pglite · 0000→0055 avec des lignes `ai_spend` existantes, puis 0056
 *    appliquée, rejouée deux fois : lignes existantes identiques, schéma
 *    identique, table vide ; la base refuse une devise non gérée, une preuve
 *    ou un motif vides, un doublon (ligne ou clé), toute modification ou
 *    suppression d'une réconciliation, et la suppression d'une ligne
 *    `ai_spend` réconciliée.
 */

const DIR = join(process.cwd(), '../../packages/db/drizzle');
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: EntreeJournalMigration[] };
const TAG = '0056_ai_spend_reconciliations';
const fichier = (tag: string) => readFileSync(join(DIR, `${tag}.sql`), 'utf8');
const preparer = (sql: string) => sql.replace(/-->\s*statement-breakpoint/g, '').replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '').replace(/vector\(\d+\)/gi, 'text');

describe('0056 · lecture du SQL et du journal', () => {
  it('aucune écriture de données, aucune destruction, tout rejouable, aucune valeur d’enum ajoutée', () => {
    const a = analyserMigrationSql(fichier(TAG));
    expect(a.instructions.map((x) => x.genre)).toEqual(['creation_table', 'bloc_protege', 'bloc_protege', 'creation_index', 'declencheur', 'declencheur']);
    expect(a.ecritures, 'écriture de données au passage de 0056').toEqual([]);
    expect(a.destructives, 'instruction destructive dans 0056').toEqual([]);
    expect(a.inconnues).toEqual([]);
    expect(a.nonRejouables, 'instruction non rejouable dans 0056').toEqual([]);
    expect(a.ajouteValeurEnum).toBe(false);
  });
  it('dernière entrée du journal, horodatage strictement supérieur au précédent', () => {
    const e = journal.entries;
    expect(e[e.length - 1]!.tag).toBe(TAG);
    expect(e[e.length - 1]!.when, '0056 serait ignorée par le migrateur').toBeGreaterThan(e[e.length - 2]!.when);
    expect(violationsJournalMigrations(e)).toEqual([]);
  });
});

async function baseJusqua0055(): Promise<PGlite> {
  const pg = new PGlite();
  for (const e of journal.entries.filter((x) => x.idx <= 55)) await pg.exec(preparer(fichier(e.tag)));
  await pg.exec(`
    INSERT INTO users (id, email, created_at) VALUES ('a5000000-0000-4000-8000-000000000001', 'fondateur@r5.exemple.test', '2026-08-01T00:00:00Z');
    INSERT INTO ai_spend (id, provider, action, estimated_usd, actual_usd, reconcile_reason, created_at)
      SELECT md5('s' || i)::uuid, 'anthropic', 'r5.essai', i / 1000.0, i / 1000.0, CASE WHEN i % 3 = 0 THEN 'coupure' END, timestamptz '2026-10-01T00:00:00Z' + (i || ' minutes')::interval FROM generate_series(1, 60) i;
  `);
  return pg;
}

const empreinteAiSpend = async (pg: PGlite) => (await pg.query<{ h: string }>(`select md5(string_agg(row(a.*)::text, ',' order by id)) as h from ai_spend a`)).rows[0]!.h;
const empreinteSchema = async (pg: PGlite) => (await pg.query<{ l: string }>(`
  select 'col ' || attname || ' ' || format_type(atttypid, atttypmod) || attnotnull as l from pg_attribute where attrelid = 'ai_spend_reconciliations'::regclass and attnum > 0
  union all select 'con ' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where conrelid = 'ai_spend_reconciliations'::regclass
  union all select 'idx ' || indexrelid::regclass::text from pg_index where indrelid = 'ai_spend_reconciliations'::regclass
  union all select 'trg ' || tgname from pg_trigger where tgrelid = 'ai_spend_reconciliations'::regclass and not tgisinternal
  order by 1`)).rows.map((r) => r.l);

const echec = async (pg: PGlite, sql: string): Promise<string> => {
  try { await pg.exec(sql); return 'ACCEPTÉ'; } catch (e) { return (e as Error).message; }
};
const inserer = (o: { id?: string; ligne: string; devise?: string; preuve?: string; motif?: string; cle: string; facture?: number }) => `
  INSERT INTO ai_spend_reconciliations (${o.id ? 'id, ' : ''}ai_spend_id, reserved_micros, billed_micros, currency, provider_ref, reason, author_id, idempotency_key)
  VALUES (${o.id ? `'${o.id}', ` : ''}md5('${o.ligne}')::uuid, 3000, ${o.facture ?? 2000}, '${o.devise ?? 'USD'}', '${o.preuve ?? 'in_123'}', '${o.motif ?? 'facture octobre'}', 'a5000000-0000-4000-8000-000000000001', '${o.cle}')`;

describe('0056 · base réelle en mémoire', () => {
  it('appliquée puis rejouée deux fois · ai_spend intacte, schéma identique, table vide', async () => {
    const pg = await baseJusqua0055();
    const avant = await empreinteAiSpend(pg);
    await pg.exec(preparer(fichier(TAG)));
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaUneFois.filter((l) => l.startsWith('trg '))).toEqual(['trg ai_spend_reconciliations_ajout_seul', 'trg ai_spend_reconciliations_sans_vidage']);
    await pg.exec(preparer(fichier(TAG)));
    await pg.exec(preparer(fichier(TAG)));
    expect(await empreinteSchema(pg), 'rejeu · objet ajouté ou dupliqué').toEqual(schemaUneFois);
    expect(await empreinteAiSpend(pg), 'lignes ai_spend modifiées par 0056').toBe(avant);
    expect((await pg.query<{ n: number }>('select count(*)::int as n from ai_spend_reconciliations')).rows[0]!.n).toBe(0);
    await pg.close();
  }, 120_000);

  it('la base refuse · devise non gérée, preuve ou motif vides, doublon, modification, suppression', async () => {
    const pg = await baseJusqua0055();
    await pg.exec(preparer(fichier(TAG)));
    expect(await echec(pg, inserer({ ligne: 's3', devise: 'EUR', cle: 'cle-eur-0001' }))).toMatch(/ai_spend_reconciliations_devise_ck/);
    expect(await echec(pg, inserer({ ligne: 's3', preuve: '  ', cle: 'cle-preuve-01' }))).toMatch(/ai_spend_reconciliations_preuve_ck/);
    expect(await echec(pg, inserer({ ligne: 's3', motif: '', cle: 'cle-motif-001' }))).toMatch(/ai_spend_reconciliations_motif_ck/);
    expect(await echec(pg, inserer({ ligne: 's3', facture: -1, cle: 'cle-negatif-1' }))).toMatch(/ai_spend_reconciliations_montants_ck/);
    expect(await echec(pg, inserer({ id: 'a5000000-0000-4000-8000-0000000000aa', ligne: 's3', cle: 'cle-bonne-001' }))).toBe('ACCEPTÉ');
    expect(await echec(pg, inserer({ ligne: 's3', cle: 'cle-autre-001' })), 'deux réconciliations pour une ligne').toMatch(/ai_spend_reconciliations_ligne_uq/);
    expect(await echec(pg, inserer({ ligne: 's6', cle: 'cle-bonne-001' })), 'une clé pour deux lignes').toMatch(/ai_spend_reconciliations_cle_uq/);
    expect(await echec(pg, `UPDATE ai_spend_reconciliations SET billed_micros = 0`)).toMatch(/STUDIO_IMMUABLE · UPDATE refusé sur ai_spend_reconciliations/);
    expect(await echec(pg, `DELETE FROM ai_spend_reconciliations`)).toMatch(/STUDIO_IMMUABLE · DELETE refusé/);
    expect(await echec(pg, `TRUNCATE ai_spend_reconciliations`)).toMatch(/STUDIO_IMMUABLE/);
    expect(await echec(pg, `DELETE FROM ai_spend WHERE id = md5('s3')::uuid`), 'ligne réconciliée supprimable').toMatch(/ai_spend_reconciliations_ai_spend_id_ai_spend_id_fk/);
    // La ligne réconciliée garde son montant réservé et sa cause.
    const [l] = (await pg.query<{ actual_usd: number; reconcile_reason: string }>(`select actual_usd, reconcile_reason from ai_spend where id = md5('s3')::uuid`)).rows;
    expect([l!.actual_usd, l!.reconcile_reason]).toEqual([0.003, 'coupure']);
    await pg.close();
  }, 120_000);
});
