import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { pgMemoire } from './helpers/pg-memoire';

/**
 * Immuabilité garantie par la BASE, pas par l'application.
 *
 * Exécuté sur pglite (Postgres 18 en WASM) avec les migrations réelles : les
 * déclencheurs plpgsql de 0054 y tournent tels quels. Les mêmes refus sont
 * prouvés sur le Postgres 16 local dans le rapport de lot (psql).
 *
 * On écrit en SQL brut, comme le ferait un script ou une action future mal
 * écrite : seul le déclencheur peut arrêter la mutation.
 */

let db: any;
const id = {
  ws: randomUUID(), ws2: randomUUID(), brand: randomUUID(), brand2: randomUUID(), user: randomUUID(),
  projet: randomUUID(), v1: randomUUID(), quote: randomUUID(), approval: randomUUID(), job: randomUUID(), job2: randomUUID(),
  pv: randomUUID(),
};
const H = 'b'.repeat(64);

async function refuse(requete: ReturnType<typeof sql>, motif: RegExp) {
  await expect(db.execute(requete)).rejects.toThrow(motif);
}

beforeAll(async () => {
  db = await pgMemoire(schema as unknown as Record<string, unknown>);
  await db.execute(sql`insert into workspaces (id, name) values (${id.ws}, 'A'), (${id.ws2}, 'B')`);
  await db.execute(sql`insert into users (id, email) values (${id.user}, 'imm@studios.test')`);
  await db.execute(sql`insert into brands (id, workspace_id, name) values (${id.brand}, ${id.ws}, 'M'), (${id.brand2}, ${id.ws2}, 'M2')`);
  await db.execute(sql`insert into studio_projects (id, workspace_id, brand_id, kind, title) values (${id.projet}, ${id.ws}, ${id.brand}, 'image', 'P')`);
  await db.execute(sql`insert into studio_project_versions (id, project_id, workspace_id, brand_id, n, schema_version, content, content_hash, author_id) values (${id.v1}, ${id.projet}, ${id.ws}, ${id.brand}, 1, 1, '{"brief":null}'::jsonb, ${H}, ${id.user})`);
  await db.execute(sql`update studio_projects set current_version_id = ${id.v1} where id = ${id.projet}`);
  await db.execute(sql`insert into studio_quotes (id, workspace_id, brand_id, project_id, project_version_id, impact_plan_hash, input_hash, pricing_version, lines, maximum_credits, maximum_usd_micros, expires_at) values (${id.quote}, ${id.ws}, ${id.brand}, ${id.projet}, ${id.v1}, ${H}, ${H}, 'p1', '[]'::jsonb, 10, 50000, now() + interval '1 hour')`);
  await db.execute(sql`insert into studio_approvals (id, quote_id, workspace_id, brand_id, input_hash, approved_by) values (${id.approval}, ${id.quote}, ${id.ws}, ${id.brand}, ${H}, ${id.user})`);
  await db.execute(sql`insert into studio_jobs (id, workspace_id, brand_id, project_id, project_version_id, quote_id, approval_id, operation, idempotency_key, input_hash, snapshot) values (${id.job}, ${id.ws}, ${id.brand}, ${id.projet}, ${id.v1}, ${id.quote}, ${id.approval}, 'image', 'k1', ${H}, '{}'::jsonb)`);
  await db.execute(sql`insert into studio_jobs (id, workspace_id, brand_id, project_id, project_version_id, operation, idempotency_key, input_hash, snapshot) values (${id.job2}, ${id.ws}, ${id.brand}, ${id.projet}, ${id.v1}, 'image', 'k2', ${H}, '{}'::jsonb)`);
  await db.execute(sql`insert into studio_budget_ledger (workspace_id, brand_id, job_id, kind, credits, usd_micros, ref) values (${id.ws}, ${id.brand}, ${id.job}, 'reserve', 10, 50000, 'reserve:k1')`);
  await db.execute(sql`insert into studio_audit_events (actor_id, effective_role, workspace_id, brand_id, action, target_type, target_id, trace_id) values (${id.user}, 'espace:member', ${id.ws}, ${id.brand}, 'project.create', 'studio_project', ${id.projet}, 't1')`);
  await db.execute(sql`insert into studio_prompt_versions (id, key, version, kind, scope, status, content, content_hash, origin) values (${id.pv}, 'brief.build', 1, 'template', 'platform', 'validated', '{"texte":"v1"}'::jsonb, ${H}, 'pack')`);
  // pglite applique les 55 migrations · plusieurs secondes quand la suite tourne en parallèle.
}, 120_000);

describe('versions de projet · immuables', () => {
  it('UPDATE et DELETE refusés par le déclencheur', async () => {
    await refuse(sql`update studio_project_versions set content = '{"brief":{"pirate":1}}'::jsonb where id = ${id.v1}`, /STUDIO_IMMUABLE · UPDATE refusé sur studio_project_versions/);
    await refuse(sql`delete from studio_project_versions where id = ${id.v1}`, /STUDIO_IMMUABLE · DELETE refusé sur studio_project_versions/);
    await refuse(sql`truncate studio_project_versions cascade`, /STUDIO_IMMUABLE · TRUNCATE refusé/);
    const r = await db.execute(sql`select content from studio_project_versions where id = ${id.v1}`);
    expect(r.rows[0].content).toEqual({ brief: null });
  });
});

describe('registre budgétaire · ajout seul', () => {
  it('UPDATE et DELETE refusés ; une référence ne s’écrit qu’une fois', async () => {
    await refuse(sql`update studio_budget_ledger set credits = 0 where ref = 'reserve:k1'`, /STUDIO_IMMUABLE · UPDATE refusé sur studio_budget_ledger/);
    await refuse(sql`delete from studio_budget_ledger where ref = 'reserve:k1'`, /STUDIO_IMMUABLE · DELETE refusé sur studio_budget_ledger/);
    await refuse(sql`insert into studio_budget_ledger (workspace_id, kind, credits, usd_micros, ref) values (${id.ws}, 'reserve', 10, 1, 'reserve:k1')`, /studio_budget_ledger_ref_uq|duplicate key/);
  });
  it('crédits entiers et signe contrôlé · une réserve négative est refusée', async () => {
    await refuse(sql`insert into studio_budget_ledger (workspace_id, kind, credits, usd_micros, ref) values (${id.ws}, 'reserve', -5, 0, 'neg')`, /studio_budget_ledger_signe_ck|check constraint/);
  });
});

describe('journal d’audit · ajout seul', () => {
  it('UPDATE et DELETE refusés', async () => {
    await refuse(sql`update studio_audit_events set action = 'rien' where trace_id = 't1'`, /STUDIO_IMMUABLE · UPDATE refusé sur studio_audit_events/);
    await refuse(sql`delete from studio_audit_events where trace_id = 't1'`, /STUDIO_IMMUABLE · DELETE refusé sur studio_audit_events/);
  });
});

describe('devis immuable, approbation consommée une seule fois', () => {
  it('un devis ne se modifie pas', async () => {
    await refuse(sql`update studio_quotes set maximum_credits = 9999 where id = ${id.quote}`, /STUDIO_IMMUABLE · UPDATE refusé sur studio_quotes/);
  });

  it('l’approbation se consomme une fois, puis plus rien ne bouge', async () => {
    await refuse(sql`update studio_approvals set input_hash = ${'c'.repeat(64)} where id = ${id.approval}`, /STUDIO_IMMUABLE/);
    await db.execute(sql`update studio_approvals set consumed_at = now(), consumed_job_id = ${id.job} where id = ${id.approval}`);
    await refuse(sql`update studio_approvals set consumed_at = now(), consumed_job_id = ${id.job2} where id = ${id.approval}`, /STUDIO_APPROBATION_CONSOMMEE/);
    await refuse(sql`delete from studio_approvals where id = ${id.approval}`, /STUDIO_IMMUABLE · DELETE refusé/);
  });

  it('un second job sur la même approbation est refusé (unicité)', async () => {
    await refuse(sql`insert into studio_jobs (workspace_id, brand_id, project_id, project_version_id, approval_id, operation, idempotency_key, input_hash, snapshot) values (${id.ws}, ${id.brand}, ${id.projet}, ${id.v1}, ${id.approval}, 'image', 'k3', ${H}, '{}'::jsonb)`, /studio_jobs_approval_uq|duplicate key/);
  });

  it('même clé d’idempotence dans le même espace → refus', async () => {
    await refuse(sql`insert into studio_jobs (workspace_id, brand_id, project_id, project_version_id, operation, idempotency_key, input_hash, snapshot) values (${id.ws}, ${id.brand}, ${id.projet}, ${id.v1}, 'image', 'k1', ${H}, '{}'::jsonb)`, /studio_jobs_idempotence_uq|duplicate key/);
  });
});

describe('version de prompt validée · figée', () => {
  it('le contenu d’une version validée ne change pas ; seul le retrait passe', async () => {
    await refuse(sql`update studio_prompt_versions set content = '{"texte":"v1 bis"}'::jsonb where id = ${id.pv}`, /STUDIO_IMMUABLE · version de prompt validated figée/);
    await refuse(sql`delete from studio_prompt_versions where id = ${id.pv}`, /ne se supprime pas/);
    await db.execute(sql`update studio_prompt_versions set status = 'retired' where id = ${id.pv}`);
    await refuse(sql`update studio_prompt_versions set status = 'validated' where id = ${id.pv}`, /version de prompt retired figée/);
  });

  it('même clé, version et portée · conflit, jamais d’écrasement (portée plateforme, nulls égaux)', async () => {
    await refuse(sql`insert into studio_prompt_versions (key, version, kind, scope, content, content_hash, origin) values ('brief.build', 1, 'template', 'platform', '{}'::jsonb, ${H}, 'pack')`, /studio_prompt_versions_uq|duplicate key/);
  });
});

describe('portée en base · clés composites', () => {
  it('une version ne peut pas porter l’espace d’un autre projet', async () => {
    await refuse(sql`insert into studio_project_versions (project_id, workspace_id, brand_id, n, schema_version, content, content_hash) values (${id.projet}, ${id.ws2}, ${id.brand2}, 2, 1, '{}'::jsonb, ${H})`, /studio_project_versions_projet_fk|foreign key/);
  });

  it('supprimer une marque qui porte un projet studio est refusé (RESTRICT, pas de cascade silencieuse)', async () => {
    await refuse(sql`delete from brands where id = ${id.brand}`, /foreign key|violates/);
  });
});
