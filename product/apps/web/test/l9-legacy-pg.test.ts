import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * Studios · L9 · MIG-02 · les médias et documents HISTORIQUES s'ouvrent après
 * la migration, sans calque ni provenance inventés. Sur la base RÉELLE migrée
 * par `ops/migration/verifier-migration.sh` (Postgres 16, 0000→0055, semis
 * synthétique), puis `semis-studios.sql` (projets créés après migration, un
 * média de la bibliothèque référencé `origin = legacy`).
 *
 *   L9_PG_URL=postgres://postgres@127.0.0.1:5433/l9_mig01 \
 *     pnpm exec vitest run test/l9-legacy-pg.test.ts
 *
 * Ignoré sans base LOCALE (la CI n'a pas de Postgres). Lecture seule : le
 * test vérifie à la fin qu'aucune ligne n'a été écrite.
 */

const URL_PG = process.env.L9_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/l9_[a-z0-9_]+$/.test(URL_PG);

vi.hoisted(() => {
  const u = process.env.L9_PG_URL ?? '';
  if (/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/l9_[a-z0-9_]+$/.test(u)) process.env.DATABASE_URL = u;
});

const WS = 'a9000000-0000-4000-8000-000000000001';
const A1 = 'a9000000-0000-4000-8000-000000000021';
const A2 = 'a9000000-0000-4000-8000-000000000022';
const PROPRIO = 'a9000000-0000-4000-8000-000000000011';
const PROJET = 'a9000000-0000-4000-8000-0000000000a1';
const LEGACY = 'a9000000-0000-4000-8000-0000000000c1';

const SESSION = {
  user: { id: PROPRIO, email: 'proprio-a@l9.exemple.test', name: 'Propriétaire A' },
  workspaceId: WS, workspaceName: 'Espace L9 A', role: 'owner' as const, plan: 'business' as const, equipe: null,
};

vi.mock('../lib/auth', () => ({ getSession: async () => SESSION }));
vi.mock('../lib/brands', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/brands')>()),
  getActiveBrand: async () => ({ id: A1, name: 'Marque L9 Alpha', logoUrl: null, url: null, category: null }),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));

import { db, sql } from '@tiktrends/db';
import { listAssets } from '../app/actions/assets';
import { contexteDepuisSession } from '../lib/studios/garde';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';

async function lignes<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

/** Empreinte de tout ce que la lecture pourrait écrire : tables historiques et studio_*. */
async function etat(): Promise<string> {
  const tables = await lignes<{ t: string }>(sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  const out: string[] = [];
  for (const { t } of tables) {
    const [r] = await lignes<{ n: number; h: string }>(sql.raw(`select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), ',' order by md5(x::text)), '')) as h from public."${t}" x`));
    out.push(`${t}|${r!.n}|${r!.h}`);
  }
  return out.join('\n');
}

const octetsDataUri = (u: string) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe.skipIf(!LOCALE)('MIG-02 · historique ouvert sur la base migrée (Postgres réel)', () => {
  let avant = '';
  const ctx = () => contexteDepuisSession(SESSION, [A1, A2], [], 'st_l9_legacy');

  beforeAll(async () => {
    const [m] = await lignes<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(m!.n, 'base non migrée jusqu’à 0055').toBe(56);
    avant = await etat();
  });
  afterAll(async () => {
    delete process.env.DATABASE_URL;
    await (db as unknown as { session: { client: { end: () => Promise<void> } } }).session.client.end().catch(() => {});
  });

  it('bibliothèque · chaque média historique listé sous son nom, servi par sa propre adresse', async () => {
    const a = await listAssets({ kind: 'image', limit: 24 });
    expect(a.length).toBeGreaterThan(0);
    const enBase = new Map((await lignes<{ id: string; name: string }>(sql`select id::text, name from assets`)).map((r) => [r.id, r.name]));
    for (const x of a) {
      const m = x as unknown as { id: string; name: string; url: string };
      expect(m.name).toBe(enBase.get(m.id));
      expect(m.url).toBe(`/api/asset/${m.id}`);
    }
  });

  it('Studios · le catalogue cite la bibliothèque historique sans rien inventer (empreinte = octets réels)', async () => {
    const r = await chargerCatalogueProjet(ctx(), PROJET, { veilleOuverte: true, maintenant: new Date() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fichiers = [...r.catalogue.fichiers.values()];
    const biblio = fichiers.filter((f) => f.provenance === 'bibliotheque');
    const enBase = await lignes<{ id: string; name: string; url: string }>(sql`select id::text, name, url from assets where workspace_id = ${WS} and kind = 'image' and (brand_id is null or brand_id = ${A1})`);
    expect(biblio.length).toBe(Math.min(60, enBase.length));
    const parId = new Map(enBase.map((x) => [x.id, x]));
    for (const f of biblio) {
      const id = f.assetId.replace(/^bib_/, '');
      const ligne = parId.get(id)!;
      expect(ligne, `média ${id} absent de la bibliothèque`).toBeTruthy();
      expect(f.sha256).toBe(sha(octetsDataUri(ligne.url)));
      expect(f.libelle).toBe(ligne.name);
      expect([f.productId, f.position, f.annonceur]).toEqual([null, null, null]);
    }
    // Le média référencé legacy : son empreinte est celle des octets d'origine, rien d'autre.
    const legacy = fichiers.find((f) => f.assetId.endsWith(LEGACY));
    const [orig] = await lignes<{ url: string }>(sql`select url from assets where id = md5('l9-asset-1')::uuid`);
    expect(legacy?.sha256).toBe(sha(octetsDataUri(orig!.url)));
    expect([legacy?.productId, legacy?.annonceur, legacy?.apercu]).toEqual([null, null, false]);
  });

  it('éditeur · le média aplati se décrit « Ancien média », aucun calque n’est créé pour lui', async () => {
    const r = await lireEditeurPour(ctx(), PROJET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.donnees.document).toBeNull();
    expect(r.donnees.medias).toEqual([{ assetId: LEGACY, mime: 'image/svg+xml', width: 96, height: 96, nom: 'Ancien média · 96 × 96' }]);
    const [a] = await lignes<{ parent: string | null; ref: unknown }>(sql`select parent_asset_id as parent, legacy_ref as ref from studio_assets where id = ${LEGACY}`);
    expect(a!.parent).toBeNull();
    expect(a!.ref).toEqual({ table: 'assets', id: (await lignes<{ id: string }>(sql`select md5('l9-asset-1')::uuid::text as id`))[0]!.id });
  });

  it('aucune de ces lectures n’a écrit quoi que ce soit (toutes tables, lignes et empreintes)', async () => {
    expect(await etat()).toBe(avant);
  });
});
