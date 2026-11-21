import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

/**
 * Le verrou de l'import de mesures · pris en premier, tenu pendant la
 * relecture et l'écriture, refusé sans attendre quand un autre import de la
 * marque le tient.
 *
 * L'écriture d'un import relit, dans sa transaction, les lignes qu'elle
 * remplace (`preuveAEcrire`, noyau) · cette relecture n'est juste que si aucun
 * autre import de la marque n'écrit entre elle et l'upsert. Le verrou
 * consultatif par marque l'assure · mais pglite n'a qu'une connexion, deux
 * imports ne s'y croisent jamais, et retirer le verrou ne rougissait rien.
 *
 * La garde observe donc la transaction d'écriture elle-même (`db.transaction`
 * espionné, son `tx` enveloppé) · l'ordre RÉEL d'exécution de ses requêtes, et
 * à chaque lecture ou écriture de `adsmap_mesures_csv`, ce que Postgres dit
 * tenir (`pg_locks`, verrou consultatif de CETTE session, comparé à
 * `hashtext(clé)`). La contention se rejoue en masquant
 * `pg_try_advisory_xact_lock` par une fonction qui répond « déjà pris ».
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), marque: randomUUID(), autre: randomUUID() };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.user, email: 'admin@test.local', name: null }, workspaceId: ids.ws, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.marque, name: 'Marque', workspaceId: ids.ws },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { db, schema, eq, sql } from '@tiktrends/db';
import { REFUS_IMPORT_MESURES_EN_COURS } from '@tiktrends/core';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';
import { lignesSql } from './helpers/semer-reference';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const TABLE = getTableName(schema.mesuresCsv);
const CLE = `adsmap-mesures-import:${ids.marque}`;
const JOURS = [7, 6, 5, 4, 3, 2, 1];

/* ─────────────── la transaction observée ─────────────── */

interface Op { quoi: string; table: string | null; sql: string; params: unknown[]; verrouTenu: boolean | null }
type Tx = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];
const dialecte = new PgDialect();
const CHAINES = new Set(['select', 'selectDistinct', 'insert', 'update', 'delete', 'execute']);

/** Le verrou consultatif de la clé d'import, tenu par CETTE session · lu dans `pg_locks`. */
async function verrouTenu(tx: Tx): Promise<boolean> {
  const r = await tx.execute(sql`select exists(
    select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 1
      and ((classid::bigint << 32) | objid::bigint) = hashtext(${CLE})::bigint) as tenu`);
  return lignesSql<{ tenu: boolean }>(r)[0]!.tenu === true;
}

/**
 * Le `tx` enveloppé · chaque requête est journalisée au moment où elle
 * S'EXÉCUTE (son `then`), et une requête sur `adsmap_mesures_csv` note d'abord
 * si le verrou est tenu. `apresVerrou` s'exécute juste après la prise du verrou
 * d'IMPORT (pas celui du recalcul des retenues, pris plus tard).
 */
function envelopper(tx: Tx, ops: Op[], apresVerrou: (() => Promise<void>) | null): Tx {
  const suivre = (cible: object, op: Op): object => {
    const p: object = new Proxy(cible, {
      get(t, cle) {
        const v = Reflect.get(t, cle, t) as unknown;
        if (cle === 'then' && typeof v === 'function') {
          return (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => (async () => {
            if (op.table === TABLE) op.verrouTenu = await verrouTenu(tx);
            ops.push(op);
            const r = await (t as PromiseLike<unknown>);
            if (op.quoi === 'execute' && /advisory_xact_lock/.test(op.sql) && op.params.includes(CLE) && apresVerrou) await apresVerrou();
            return r;
          })().then(ok, ko);
        }
        if (typeof v !== 'function') return v;
        return (...a: unknown[]) => {
          if (cle === 'from' && a[0] && typeof a[0] === 'object') op.table = getTableName(a[0] as Parameters<typeof getTableName>[0]);
          const r = (v as (...x: unknown[]) => unknown).apply(t, a);
          return r === t ? p : r && typeof r === 'object' ? suivre(r, op) : r;
        };
      },
    });
    return p;
  };
  return new Proxy(tx, {
    get(t, cle) {
      const v = Reflect.get(t, cle, t) as unknown;
      if (typeof cle !== 'string' || !CHAINES.has(cle) || typeof v !== 'function') return v;
      return (...a: unknown[]) => {
        const op: Op = { quoi: cle, table: null, sql: '', params: [], verrouTenu: null };
        if (cle === 'execute') { const q = dialecte.sqlToQuery(a[0] as SQL); op.sql = q.sql; op.params = q.params; }
        if (cle === 'insert' || cle === 'update' || cle === 'delete') op.table = getTableName(a[0] as Parameters<typeof getTableName>[0]);
        const r = (v as (...x: unknown[]) => unknown).apply(t, a);
        return r && typeof r === 'object' ? suivre(r, op) : r;
      };
    },
  }) as Tx;
}

/** Les transactions ouvertes pendant `f`, chacune avec ses requêtes dans l'ordre d'exécution. */
async function observer<R>(f: () => Promise<R>, apresVerrou: (() => Promise<void>) | null = null): Promise<{ r: R; transactions: Op[][] }> {
  const transactions: Op[][] = [];
  const origine = db!.transaction.bind(db!);
  const espion = vi.spyOn(db!, 'transaction').mockImplementation(((cb: (tx: Tx) => Promise<unknown>, cfg?: unknown) => {
    const ops: Op[] = [];
    transactions.push(ops);
    return origine((tx) => cb(envelopper(tx, ops, apresVerrou)), cfg as never);
  }) as typeof db.transaction);
  try {
    return { r: await f(), transactions };
  } finally {
    espion.mockRestore();
  }
}

/** La transaction d'écriture de l'import · celle qui touche `adsmap_mesures_csv` ou prend la clé d'import. */
function transactionImport(transactions: Op[][]): Op[] {
  const t = transactions.filter((ops) => ops.some((o) => (o.quoi === 'insert' && o.table === TABLE) || o.params.includes(CLE)));
  expect(t, 'une seule transaction écrit l’import').toHaveLength(1);
  return t[0]!;
}

/* ─────────────── semis ─────────────── */

let numeroLot = 0;
let concept = '';

/** Un lot neuf de deux ads, chacune épinglée sur son identifiant Meta. */
async function lot(): Promise<{ n: number; ext: string[]; ads: string[] }> {
  const n = ++numeroLot;
  const ext = [1, 2].map((i) => `1202000000009${String(n).padStart(2, '0')}${i}`);
  const [b] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids.marque, number: n, status: 'testing', launchedAt: new Date(Date.now() - 7 * JOUR) }).returning({ id: schema.batches.id });
  const ads: string[] = [];
  for (const [i, e] of ext.entries()) {
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: ids.ws, conceptId: concept, batchId: b!.id, variantCode: `v${i + 1}`, format: 'static', status: 'paused',
      externalIds: { ad_id: e }, generatedName: `Marque_B${n}_${e}`, launchedAt: new Date(Date.now() - 7 * JOUR),
    }).returning({ id: schema.ads.id });
    ads.push(ad!.id);
  }
  return { n, ext, ads };
}

/** L'export Ads Manager du lot · avec la colonne budget (`budget`), ou muet (`null`). */
const exportDe = (l: { n: number; ext: string[] }, budget: string | null) => [
  `Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad ID,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,${budget === null ? '' : 'Ad set budget,Ad set budget type,'}Clicks (all)`,
  ...l.ext.flatMap((ad) => JOURS.map((k) => [
    J(k), J(k), J(k), `[ADSMAP] TEST Marque B${l.n}`, `Ensemble ${ad}`, `Marque_B${l.n}_${ad}`, ad, 'Active', 5, 'purchase', 4000, 5000, '50.00', 90, 5, 195,
    ...(budget === null ? [] : [budget, 'Daily']), 120,
  ].join(','))),
].join('\n') + '\n';

const T = schema.mesuresCsv;
const lignesDe = (ads: string[]) => db!.select({ ad: T.adId, debut: T.dateDebut, brand: T.brandId, cbo: T.cbo, budget: T.budgetJour, fichier: T.fichier, importeLe: T.importeLe })
  .from(T).where(sql`${T.adId} in (${sql.join(ads.map((a) => sql`${a}::uuid`), sql`, `)})`);

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'admin@test.local' });
  await db!.insert(schema.brands).values([{ id: ids.marque, workspaceId: ids.ws, name: 'Marque' }, { id: ids.autre, workspaceId: ids.ws, name: 'Autre' }]);
  const [p] = await db!.insert(schema.personas).values({ brandId: ids.marque, name: 'Persona' }).returning();
  const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
  const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  concept = c!.id;
});

afterEach(async () => {
  // Le masque de contention ne survit jamais à son test.
  await db!.execute(sql`reset search_path`);
  await db!.execute(sql`drop function if exists public.pg_try_advisory_xact_lock(bigint)`);
});

/* ─────────────── les gardes ─────────────── */

describe('le verrou de la marque · pris EN PREMIER, tenu pendant la relecture et l’écriture', () => {
  it('première requête de la transaction · le verrou de la clé de la marque · puis chaque lecture et écriture des mesures le tient', async () => {
    const l = await lot();
    const { r, transactions } = await observer(() => applyMesuresAction(exportDe(l, '50'), [], 'verrou.csv'));
    expect(r.error).toBeUndefined();
    const ops = transactionImport(transactions);
    const premiere = ops[0]!;
    expect(premiere.quoi, 'la transaction d’écriture ne commence pas par le verrou de la marque').toBe('execute');
    expect(premiere.sql, 'la première requête n’est pas un verrou consultatif de transaction sur la clé hachée').toMatch(/pg_(try_)?advisory_xact_lock\(hashtext\(/);
    expect(premiere.params, 'le verrou n’est pas pris sur la clé d’import de CETTE marque').toEqual([CLE]);
    const mesures = ops.filter((o) => o.table === TABLE && (o.quoi === 'select' || o.quoi === 'insert'));
    expect(mesures.map((o) => o.quoi), 'témoin · la transaction relit puis écrit les mesures').toEqual(['select', 'insert']);
    expect(mesures.map((o) => ops.indexOf(o) > 0), 'une lecture ou une écriture des mesures précède le verrou').toEqual([true, true]);
    expect(mesures.map((o) => `${o.quoi} · ${o.verrouTenu ? 'verrou tenu' : 'SANS verrou'}`), 'Postgres ne tient pas le verrou de la marque pendant la relecture ou l’écriture').toEqual(['select · verrou tenu', 'insert · verrou tenu']);
  });
});

describe('un autre import de la marque tient le verrou · refus immédiat, rien d’écrit, aucune connexion retenue', () => {
  it('le second import est refusé en français, sans attendre, et la base reste celle du premier', async () => {
    const l = await lot();
    expect((await applyMesuresAction(exportDe(l, '50'), [], 'premier.csv')).error).toBeUndefined();
    const avant = await lignesDe(l.ads);
    const remonteesAvant = (await db!.select({ id: schema.remontees.id }).from(schema.remontees).where(eq(schema.remontees.brandId, ids.marque))).length;
    // La contention, rejouée · `pg_try_advisory_xact_lock` répond « déjà pris », comme sous un import concurrent.
    await db!.execute(sql.raw(`create function public.pg_try_advisory_xact_lock(bigint) returns boolean language sql as 'select false'`));
    await db!.execute(sql`set search_path = public, pg_catalog`);
    const { r, transactions } = await observer(() => applyMesuresAction(exportDe(l, null), [], 'second.csv'));
    expect(r, 'un import concurrent de la marque n’est pas refusé · il attend ou écrit').toEqual({ error: REFUS_IMPORT_MESURES_EN_COURS });
    expect(REFUS_IMPORT_MESURES_EN_COURS).toBe('Un import de mesures est déjà en cours pour cette marque · réessaie dans un instant.');
    const ops = transactionImport(transactions);
    expect(ops.map((o) => o.quoi), 'refusé, l’import lit ou écrit encore quelque chose').toEqual(['execute']);
    expect(await lignesDe(l.ads), 'refusé, l’import a quand même écrit').toEqual(avant);
    expect((await db!.select({ id: schema.remontees.id }).from(schema.remontees).where(eq(schema.remontees.brandId, ids.marque))).length, 'un refus n’est pas une remontée en échec').toBe(remonteesAvant);
  });
});

describe('la relecture lit LA ligne que l’upsert remplace · même clé que le conflit `(ad_id, date_debut, date_fin)`', () => {
  it('une ligne de même clé rangée sous une autre marque · le réimport muet garde sa preuve (CBO)', async () => {
    const l = await lot();
    // Cas théorique · la ligne de l'ad et du jour existe, mais sous une autre marque. L'upsert la remplacera quand même.
    await db!.insert(T).values({
      adId: l.ads[0]!, workspaceId: ids.ws, brandId: ids.autre, dateDebut: J(3), dateFin: J(3), spend: 50, impressions: 5000, linkClicks: 90, purchases: 5,
      metaAdId: l.ext[0]!, nomAnnonce: `Marque_B${l.n}_${l.ext[0]}`, campagne: `[ADSMAP] TEST Marque B${l.n}`, ensemble: `Ensemble ${l.ext[0]}`,
      cbo: true, budgetJour: null, fichier: 'cbo-autre-marque.csv', importeLe: new Date(Date.now() - JOUR),
    });
    expect((await applyMesuresAction(exportDe(l, null), [], 'muet.csv')).error).toBeUndefined();
    const [ligne] = (await lignesDe([l.ads[0]!])).filter((x) => x.debut === J(3));
    expect({ cbo: ligne!.cbo, fichier: ligne!.fichier }, 'la relecture filtre sur la marque · la ligne remplacée n’est pas relue, sa preuve de CBO est effacée')
      .toEqual({ cbo: true, fichier: 'muet.csv' });
  });
});

describe('l’import est daté APRÈS la prise du verrou', () => {
  it('une attente avant le verrou ne vieillit pas la date écrite', async () => {
    const l = await lot();
    let pris = 0;
    // L'attente du verrou (ou d'une connexion du pool), rejouée · le temps passe entre le clic et la prise.
    const { r } = await observer(() => applyMesuresAction(exportDe(l, '50'), [], 'date.csv'), async () => {
      await new Promise((ok) => setTimeout(ok, 40));
      pris = Date.now();
    });
    expect(r.error).toBeUndefined();
    expect(pris, 'témoin · le verrou a été pris').toBeGreaterThan(0);
    const ls = await lignesDe(l.ads);
    expect(ls).toHaveLength(l.ads.length * JOURS.length);
    const avantVerrou = ls.filter((x) => x.importeLe.getTime() < pris).length;
    expect(avantVerrou, 'l’import est daté avant la prise du verrou · une preuve écrite après une autre paraîtrait plus ancienne').toBe(0);
  });
});

