import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * L'espion d'écritures commun (`helpers/espion-ecritures.ts`) · gardé au RÉSULTAT, contre une vraie
 * base pglite · ce que `sousEspion` rend au test, ce qu'il laisse passer, ce qu'il relance.
 *
 * L'attente d'absence est la vraie (`attendreAbsence`) · seule une PANNE de l'attente (une erreur qui
 * n'est pas une écriture vue) peut être provoquée, pour prouver qu'elle remonte au test.
 */

const h = vi.hoisted(() => ({ panne: null as Error | null }));
vi.mock('./helpers/attendre-etat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./helpers/attendre-etat')>();
  return {
    ...actual,
    attendreAbsence: (condition: string, sonde: () => unknown) => (h.panne ? Promise.reject(h.panne) : actual.attendreAbsence(condition, sonde)),
  };
});

import type { PGlite } from '@electric-sql/pglite';
import { pgMemoireBrut } from './helpers/pg-memoire';
import { ECRITURE, espionArme, espionnerEcritures, sousEspion } from './helpers/espion-ecritures';

let pg: PGlite;

beforeAll(async () => {
  espionnerEcritures();
  espionnerEcritures(); // rebrancher ne double pas l'enveloppe (une écriture vue une fois, plus bas)
  pg = await pgMemoireBrut();
  await pg.exec('create table espion_t (id int primary key, v text); insert into espion_t values (1, \'a\');');
});
afterAll(async () => { await pg.close(); });

const lignes = async () => (await pg.query<{ n: number }>('select count(*)::int as n from espion_t')).rows[0]!.n;

describe('sousEspion · ce qu’il voit', () => {
  // Les formes que drizzle écrit (identifiants entre guillemets) et les autres.
  it.each([
    ['insert into', 'insert into "espion_t" ("id", "v") values (100, \'x\')'],
    ['update … set', 'update "espion_t" set "v" = \'b\' where "id" = 1'],
    ['update … set, sans guillemets', 'UPDATE espion_t SET v = \'c\' WHERE id = 1'],
    ['delete from', 'delete from "espion_t" where "id" = 100'],
    ['truncate', 'truncate table espion_tmp'],
    ['merge into', 'merge into espion_t t using (select 1 as id) s on t.id = s.id when matched then update set v = \'m\''],
  ])('une écriture SYNCHRONE · %s · est rendue au test, telle qu’écrite', async (_nom, sql) => {
    if (sql.startsWith('truncate')) await pg.exec('create table if not exists espion_tmp (x int)');
    const { r, ecritures } = await sousEspion(async () => { await pg.query(sql); return 'fini'; });
    expect(r, 'le résultat de la lecture n’est pas rendu').toBe('fini');
    expect(ecritures, `l’écriture « ${sql} » n’a pas été vue`).toEqual([sql.replace(/\s+/g, ' ').slice(0, 160)]);
  });

  it('une écriture DIFFÉRÉE de 80 ms, partie après le retour (« fire and forget »), est vue', async () => {
    const avant = await lignes();
    const { r, ecritures } = await sousEspion(async () => {
      setTimeout(() => { void pg.query('insert into "espion_t" ("id", "v") values (200, \'tard\')'); }, 80);
      return 'répondu';
    });
    expect(r).toBe('répondu');
    expect(ecritures, 'l’écriture partie 80 ms après le retour a échappé à l’espion').toEqual(['insert into "espion_t" ("id", "v") values (200, \'tard\')']);
    // L'écriture a bien eu lieu · l'espion la relève, il ne l'empêche pas.
    await expect.poll(lignes).toBe(avant + 1);
  });

  it('une instruction longue est rendue sur une ligne, tronquée à 160 caractères', async () => {
    const v = 'x'.repeat(300);
    const { ecritures } = await sousEspion(async () => { await pg.query(`insert into espion_t\n  (id, v)\n  values (300, '${v}')`); });
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toHaveLength(160);
    expect(ecritures[0]!.startsWith('insert into espion_t (id, v) values (300, \'xxx')).toBe(true);
  });
});

describe('sousEspion · ce qu’il ne compte pas', () => {
  it.each([
    ['select', 'select "id", "v" from "espion_t" where "id" = 1'],
    ['with … select', 'with a as (select id from espion_t) select count(*) from a'],
    ['select … for update (un verrou, pas une écriture)', 'select id from espion_t where id = 1 for update'],
    ['une colonne `updated_at` · le mot n’est pas une instruction', 'select 1 as updated_at, \'insert\' as deleted_from'],
  ])('une LECTURE · %s · n’est pas comptée', async (_nom, sql) => {
    const { ecritures } = await sousEspion(async () => { await pg.query(sql); });
    expect(ecritures, `la lecture « ${sql} » a été comptée comme écriture`).toEqual([]);
  });

  it('une écriture HORS espion (avant, après) n’est pas comptée', async () => {
    await pg.query('update espion_t set v = \'avant\' where id = 1');
    const { ecritures } = await sousEspion(async () => { await pg.query('select 1'); });
    await pg.query('update espion_t set v = \'apres\' where id = 1');
    expect(ecritures).toEqual([]);
    const { ecritures: suivantes } = await sousEspion(async () => { await pg.query('select 2'); });
    expect(suivantes, 'une écriture d’entre deux espions a été rendue au suivant').toEqual([]);
  });
});

describe('sousEspion · désarmement et erreurs', () => {
  it('l’espion est désarmé après une lecture qui réussit', async () => {
    await sousEspion(async () => { expect(espionArme(), 'l’espion n’est pas armé pendant la lecture').toBe(true); });
    expect(espionArme(), 'l’espion est resté armé après la lecture').toBe(false);
  });

  it('l’espion est désarmé même quand la lecture lève · et l’erreur de la lecture remonte telle quelle', async () => {
    const boum = new Error('la lecture a cassé');
    await expect(sousEspion(async () => { await pg.query('insert into espion_t values (400, \'z\')'); throw boum; })).rejects.toBe(boum);
    expect(espionArme(), 'l’espion est resté armé après une lecture qui lève').toBe(false);
  });

  it('une panne de l’attente qui n’est pas une écriture vue est RELANCÉE, l’espion désarmé', async () => {
    const panne = new Error('act a cassé');
    h.panne = panne;
    try {
      await expect(sousEspion(async () => 'lu'), 'une panne de l’attente a été avalée').rejects.toBe(panne);
    } finally { h.panne = null; }
    expect(espionArme()).toBe(false);
  });

  it('la même panne, une écriture vue · c’est l’écriture qui est rendue (la panne ne la masque pas)', async () => {
    h.panne = new Error('act a cassé');
    try {
      const { ecritures } = await sousEspion(async () => { await pg.query('delete from espion_t where id = 400'); });
      expect(ecritures).toEqual(['delete from espion_t where id = 400']);
    } finally { h.panne = null; }
  });
});

describe('ECRITURE · le motif lui-même', () => {
  it('reconnaît chaque forme d’écriture, ignore les lectures', () => {
    for (const s of ['insert into t values (1)', 'update "t" set a = 1', 'delete from t', 'truncate t', 'merge into t using u on true when matched then delete'])
      expect(ECRITURE.test(s), s).toBe(true);
    for (const s of ['select * from t', 'with x as (select 1) select * from x', 'select updated_at from t', 'select 1 for update'])
      expect(ECRITURE.test(s), s).toBe(false);
  });
});
