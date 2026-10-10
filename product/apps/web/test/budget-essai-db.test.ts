import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Budget d'ESSAI par espace (mandat du 10/10 : 15 $ cumulés pour les tests
 * sur l'espace pilote, relances comprises, vérifié avant chaque appel), au
 * niveau BASE (pglite, migrations réelles). On lit les lignes `ai_spend`
 * écrites, pas la présence d'un appel :
 *  · le chemin du SITE (`guardFixedCost`) et celui du WORKER (`reserverDepense`
 *    nu, comme `BarriereDepenseStudio`) refusent AVANT d'écrire quand le
 *    cumul de l'espace dépasserait le budget ;
 *  · un autre espace, et un espace sans budget, ne sont pas touchés ;
 *  · la dépense antérieure à `depuis` ne compte pas ; une réservation
 *    incertaine compte au maximum.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq, reserverDepense, cleBudgetEssai, decisionBudgetEssai, depenseEspaceDepuis, type BaseDepense } from '@tiktrends/db';
import { guardFixedCost, SpendBlockedError } from '../lib/spend-guard';

const base = db as unknown as BaseDepense;
const PILOTE = randomUUID();
const AUTRE = randomUUID();
const CLE = 'AI_SPEND_CAP_USD';
const avant = process.env[CLE];
const lignes = async (ws: string) => db.select().from(schema.aiSpend).where(eq(schema.aiSpend.workspaceId, ws));
const toutPasse = () => ({ allowed: true, reason: '' });

beforeAll(async () => {
  process.env[CLE] = '1000'; // le plafond global ne gêne pas : seul le budget d'essai doit refuser
  const depuis = new Date(Date.now() - 3_600_000);
  // Dépense AVANT le début du budget : ne compte pas.
  await db.insert(schema.aiSpend).values({ workspaceId: PILOTE, provider: 'fal', model: 'x', action: 'ancienne', estimatedUsd: 5, actualUsd: 5, createdAt: new Date(depuis.getTime() - 60_000) });
  await db.insert(schema.appSettings).values({ key: cleBudgetEssai(PILOTE), value: { plafondUsd: 0.2, depuis: depuis.toISOString(), motif: 'recette manuelle', par: null, le: null } });
});
afterAll(() => { if (avant === undefined) delete process.env[CLE]; else process.env[CLE] = avant; });

describe('budget d’essai de l’espace pilote · refus AVANT écriture, site et worker', () => {
  it('la règle · un appel qui dépasserait le reste est refusé, avec les montants', () => {
    expect(decisionBudgetEssai(0.16, 0.08, 0.2)).toMatchObject({ allowed: false, restantUsd: expect.closeTo(0.04, 6) });
    expect(decisionBudgetEssai(0.16, 0.08, 0.2).reason).toMatch(/budget d’essai de l’espace atteint · 0\.16 \$ engagés sur 0\.20 \$/);
    expect(decisionBudgetEssai(0.12, 0.08, 0.2).allowed).toBe(true);
  });

  it('site · deux images passent (0,16 $), la troisième est refusée sans ligne écrite', async () => {
    expect(await guardFixedCost('fal_image', { workspaceId: PILOTE, action: 'essai' })).toBeTruthy();
    expect(await guardFixedCost('fal_image', { workspaceId: PILOTE, action: 'essai' })).toBeTruthy();
    await expect(guardFixedCost('fal_image', { workspaceId: PILOTE, action: 'essai' })).rejects.toBeInstanceOf(SpendBlockedError);
    expect((await lignes(PILOTE)).filter((l) => l.action === 'essai')).toHaveLength(2);
    expect(await depenseEspaceDepuis(base, PILOTE, new Date(Date.now() - 3_600_000))).toBeCloseTo(0.16, 6);
  });

  it('worker · la même réservation commune refuse aussi, avec la raison', async () => {
    const r = await reserverDepense(base, { id: randomUUID(), workspaceId: PILOTE, provider: 'fal', model: 'm', action: 'studio', usd: 0.08 }, { depuis: new Date(0), decider: toutPasse });
    expect(r).toMatchObject({ ok: false, dejaEngagee: false });
    expect(r.ok ? '' : r.raison).toMatch(/budget d’essai de l’espace atteint/);
    expect((await lignes(PILOTE)).filter((l) => l.action === 'studio')).toHaveLength(0);
  });

  it('un appel qui tient dans le reste passe encore (0,04 $)', async () => {
    const r = await reserverDepense(base, { workspaceId: PILOTE, provider: 'anthropic', model: 'm', action: 'texte', usd: 0.04 }, { depuis: new Date(0), decider: toutPasse });
    expect(r.ok).toBe(true);
  });

  it('un autre espace, sans budget, n’est pas touché', async () => {
    for (let i = 0; i < 4; i++) expect(await guardFixedCost('fal_image', { workspaceId: AUTRE, action: 'client' })).toBeTruthy();
    expect(await lignes(AUTRE)).toHaveLength(4);
  });
});
