import { describe, it, expect, beforeAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyserMigrationSql } from '@tiktrends/core';

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import { creerConversation, conversationDuProjet, listerConversations } from '../lib/jarvis/conversations';

/**
 * Concept créatif V5 · PR2 · lier une conversation Jarvis à un concept (= projet
 * studio), SANS confondre portée marque et portée concept. Deux plans, tous deux
 * sur une VRAIE base Postgres en mémoire (pglite) · on lit le RÉSULTAT (le
 * schéma, les LIGNES), jamais un appel :
 *
 *  · MIGRATION 0059 · lecture du SQL réel (règle pure `migration-additive`) :
 *    aucune écriture de données, aucune destruction, tout rejouable. Puis, sur la
 *    base montée jusqu'à 0058, 0059 ajoute bien la colonne `project_id`, et un
 *    rejeu (x2) ne change ni n'ajoute rien (idempotent) ;
 *
 *  · DÉPÔT · une conversation créée avec `projectId` est relue par
 *    `conversationDuProjet` ; une conversation d'un AUTRE projet, d'une AUTRE
 *    marque, d'un AUTRE espace ou d'une AUTRE personne n'est PAS lue · la
 *    barrière marque est conservée, `project_id` s'y ajoute.
 *
 * Mutation (faite à la main, restaurée) : retirer `eq(C.projectId, projectId)` de
 * `conversationDuProjet` fait fuiter la conversation de l'AUTRE projet · le cas
 * « autre projet non lu » tombe alors en rouge. La garde regarde la bonne chose.
 */

/* ───────────────────────── Migration 0059 · additive ──────────────────────── */

const DIR = join(process.cwd(), '../../packages/db/drizzle');
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
const fichier = (tag: string) => readFileSync(join(DIR, `${tag}.sql`), 'utf8');
const preparer = (sql: string) => sql
  .replace(/-->\s*statement-breakpoint/g, '')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
  .replace(/vector\(\d+\)/gi, 'text');

async function empreinteSchema(pg: PGlite): Promise<string[]> {
  const rs = (await pg.query<{ l: string }>(`
    select 'col ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' NN' else '' end as l
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
    union all select 'idx ' || pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    order by 1`)).rows;
  return rs.map((r) => r.l);
}

describe('migration 0059 · lier une conversation à un concept, additive et rejouable', () => {
  it('le SQL n’écrit aucune donnée, ne détruit rien, et tout est rejouable', () => {
    const a = analyserMigrationSql(fichier('0059_concept_lien_conversation'));
    expect(a.instructions.length).toBeGreaterThan(0);
    expect(a.ecritures.map((x) => `${x.rang} ${x.extrait}`), 'écriture de données (backfill)').toEqual([]);
    expect(a.destructives.map((x) => `${x.rang} ${x.extrait}`), 'instruction destructive').toEqual([]);
    expect(a.inconnues.map((x) => `${x.rang} ${x.extrait}`), 'instruction non reconnue').toEqual([]);
    expect(a.nonRejouables.map((x) => `${x.rang} ${x.extrait}`), 'instruction non rejouable').toEqual([]);
    expect(a.ajouteValeurEnum).toBe(false);
  });

  it('sur la base montée jusqu’à 0058, 0059 AJOUTE project_id · rejeu (x2) sans effet', async () => {
    const pg = new PGlite();
    for (const e of journal.entries.filter((x) => x.idx <= 58)) await pg.exec(preparer(fichier(e.tag)));

    // Avant 0059 : la colonne n'existe pas encore.
    const colonne = async () => (await pg.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns where table_name = 'jarvis_conversations' and column_name = 'project_id'`,
    )).rows[0]!.n;
    expect(await colonne(), 'project_id ne devrait pas exister avant 0059').toBe(0);

    await pg.exec(preparer(fichier('0059_concept_lien_conversation')));
    expect(await colonne(), '0059 doit ajouter project_id').toBe(1);
    const apresUneFois = await empreinteSchema(pg);

    // Rejeu x2 · idempotent (colonne « IF NOT EXISTS », index « IF NOT EXISTS »).
    await pg.exec(preparer(fichier('0059_concept_lien_conversation')));
    await pg.exec(preparer(fichier('0059_concept_lien_conversation')));
    expect(await colonne(), 'project_id toujours là après rejeu').toBe(1);
    expect(await empreinteSchema(pg), 'rejeu · objet ajouté ou dupliqué').toEqual(apresUneFois);
    await pg.close();
  }, 120_000);
});

/* ─────────────────────────── Dépôt · conversationDuProjet ──────────────────── */

const WS = '44444444-4444-4444-8444-444444444441';
const WS2 = '44444444-4444-4444-8444-444444444442';
const U1 = '55555555-5555-4555-8555-555555555551';
const U2 = '55555555-5555-4555-8555-555555555552';
const B1 = '66666666-6666-4666-8666-666666666661';
const B2 = '66666666-6666-4666-8666-666666666662';
// Concepts (= projets studio) · simples identifiants, SANS clé étrangère (motif
// de la colonne) · le dépôt n'exige pas l'existence d'une ligne studio_projects.
const P1 = '77777777-7777-4777-8777-777777777771';
const P2 = '77777777-7777-4777-8777-777777777772';

const p1 = { workspaceId: WS, brandId: B1, userId: U1 };

async function message(conversationId: string, workspaceId: string, brandId: string, userId: string, content: string) {
  await db.insert(schema.jarvisMessages).values({ workspaceId, brandId, userId, conversationId, role: 'user', content, createdAt: new Date('2026-02-01T10:00:00Z') });
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: WS, name: 'Espace concept' }, { id: WS2, name: 'Autre espace' }]);
  await db.insert(schema.users).values([{ id: U1, email: 'u1@concept.exemple' }, { id: U2, email: 'u2@concept.exemple' }]);
  await db.insert(schema.brands).values([{ id: B1, workspaceId: WS, name: 'Neva' }, { id: B2, workspaceId: WS, name: 'Autre marque' }]);
});

describe('conversationDuProjet · barrière marque CONSERVÉE, projectId en plus', () => {
  it('relit la conversation du concept, et IGNORE autre projet / autre marque / autre espace / autre personne', async () => {
    // La conversation du concept P1, portée (WS, B1, U1).
    const aP1 = await creerConversation(p1, { projectId: P1 });
    await message(aP1, WS, B1, U1, 'Concept « rentrée des clubs »');

    // Leurres · chacun diffère par UNE dimension, les autres identiques.
    const autreProjet = await creerConversation(p1, { projectId: P2 });                                   // autre concept
    await message(autreProjet, WS, B1, U1, 'Concept « déstockage »');
    const autreMarque = await creerConversation({ workspaceId: WS, brandId: B2, userId: U1 }, { projectId: P1 });   // autre marque, MÊME projectId
    await message(autreMarque, WS, B2, U1, 'Concept chez B2');
    const autrePersonne = await creerConversation({ workspaceId: WS, brandId: B1, userId: U2 }, { projectId: P1 }); // autre personne
    await message(autrePersonne, WS, B1, U2, 'Concept chez u2');
    const autreEspace = await creerConversation({ workspaceId: WS2, brandId: B1, userId: U1 }, { projectId: P1 });  // autre espace
    await message(autreEspace, WS2, B1, U1, 'Concept dans WS2');
    // Et une conversation de marque SANS concept · ne doit pas remonter par projet.
    const sansProjet = await creerConversation(p1);
    await message(sansProjet, WS, B1, U1, 'Simple fil de marque');

    const lues = await conversationDuProjet(p1, P1);
    const ids = lues.map((c) => c.id);
    expect(ids, 'la conversation du concept P1 est lue').toContain(aP1);
    expect(ids, 'autre concept ne doit pas être lu').not.toContain(autreProjet);
    expect(ids, 'autre marque (même projectId) ne doit pas être lue').not.toContain(autreMarque);
    expect(ids, 'autre personne ne doit pas être lue').not.toContain(autrePersonne);
    expect(ids, 'autre espace ne doit pas être lu').not.toContain(autreEspace);
    expect(ids, 'conversation de marque sans concept ne remonte pas par projet').not.toContain(sansProjet);
    expect(lues).toHaveLength(1);
    // Le titre se dérive du premier message (règle du noyau, comme listerConversations).
    expect(lues[0]!.titre).toBe('Concept « rentrée des clubs »');

    // La même conversation de marque reste visible par la liste de marque (projectId n'a rien retiré).
    expect((await listerConversations(p1)).map((c) => c.id)).toContain(sansProjet);
  });

  it('un même concept chez une autre marque se lit sous CETTE marque, pas sous B1', async () => {
    const chezB2 = await creerConversation({ workspaceId: WS, brandId: B2, userId: U1 }, { projectId: P1 });
    await message(chezB2, WS, B2, U1, 'Autre marque, même concept');
    const sousB2 = (await conversationDuProjet({ workspaceId: WS, brandId: B2, userId: U1 }, P1)).map((c) => c.id);
    expect(sousB2, 'la conversation de B2 est lue sous B2').toContain(chezB2);
    expect((await conversationDuProjet(p1, P1)).map((c) => c.id), 'et PAS sous B1').not.toContain(chezB2);
  });
});
