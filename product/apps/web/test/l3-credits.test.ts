import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * L3 · `lib/credits.ts` · débit et remboursement ATOMIQUES, reliés par `ref_id`.
 *
 * Défaut d'origine (L0-A, constat 15) : le solde était modifié, PUIS la ligne
 * `credit_ledger` écrite par une seconde requête hors transaction, et `ref_id`
 * n'était jamais renseigné. Une écriture de registre qui échoue laissait un
 * débit (ou un recrédit) sans trace. On fait échouer l'écriture du registre
 * (raison nulle, refusée par la base) et on lit le solde : il n'a pas bougé.
 * Montants et offre inchangés.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { reserveCredits, refundCredits } from '../lib/credits';

const solde = async () => (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.ws)))[0]!.c;
const lignes = async () => db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ids.ws));

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Crédits', plan: 'core', creditsBalance: 10 });
});

describe('crédits · débit et registre ensemble, référence posée', () => {
  it('réserve · solde débité ET ligne écrite avec ref_id', async () => {
    expect(await reserveCredits(ids.ws, 4, 'Test · réserve', 'ref:test:1')).toBe(true);
    expect(await solde()).toBe(6);
    expect((await lignes()).map((l) => [l.delta, l.refId])).toEqual([[-4, 'ref:test:1']]);
  });

  it('solde insuffisant · rien débité, rien écrit', async () => {
    expect(await reserveCredits(ids.ws, 7, 'Test · trop cher', 'ref:test:2')).toBe(false);
    expect(await solde()).toBe(6);
    expect((await lignes()).length).toBe(1);
  });

  it('registre en échec pendant un DÉBIT ⇒ le solde n’a pas bougé (transaction annulée)', async () => {
    await expect(reserveCredits(ids.ws, 2, null as unknown as string, 'ref:test:3')).rejects.toThrow();
    expect(await solde(), 'débit sans ligne de registre').toBe(6);
    expect((await lignes()).length).toBe(1);
  });

  it('registre en échec pendant un REMBOURSEMENT ⇒ le solde n’a pas bougé', async () => {
    await expect(refundCredits(ids.ws, 3, null as unknown as string, 'ref:test:4')).rejects.toThrow();
    expect(await solde(), 'recrédit sans ligne de registre').toBe(6);
  });

  it('remboursement · solde et ligne ensemble ; appel historique sans référence toujours accepté', async () => {
    await refundCredits(ids.ws, 4, 'Test · rendu', 'ref:test:1:rendu');
    await refundCredits(ids.ws, 1, 'Test · appel historique');
    expect(await solde()).toBe(11);
    expect((await lignes()).map((l) => [l.delta, l.refId]).slice(1)).toEqual([[4, 'ref:test:1:rendu'], [1, null]]);
  });
});
