import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * RÉIMPORT MUET · la preuve gardée vient de la lecture faite DANS la
 * transaction d'écriture, jamais de celle de l'aperçu.
 *
 * Le défaut · la preuve (CBO ou budget d'ensemble) que garde une ligne muette
 * se calculait sur la lecture de `preparer`, faite HORS de la transaction.
 * Deux imports simultanés de la même ad et de la même période · A dit CBO, B
 * est muet, tous deux ont lu l'ancienne ligne ABO · B écrivait la preuve de
 * cette lecture périmée (ABO) par-dessus le CBO de A · faux comparable.
 *
 * pglite n'a qu'une connexion · deux transactions ne s'y entrelacent pas. La
 * garde rejoue donc la course À LA MAIN · la ligne est réécrite (le CBO de A)
 * juste APRÈS la lecture de `preparer` et AVANT l'écriture de B · la ligne que
 * B écrit doit garder le CBO de A, donc l'avoir relue dans sa transaction.
 * (Le verrou consultatif par marque, qui sérialise deux vrais imports en
 * production, ne s'éprouve pas sur une seule connexion.)
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), marque: randomUUID() };
});
/** Ce que fait l'import concurrent A, une fois, juste après la lecture de `preparer`. */
const course = vi.hoisted(() => ({ apres: null as null | (() => Promise<void>) }));
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
vi.mock('../lib/adsmap-mesures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/adsmap-mesures')>();
  return {
    ...actual,
    lireJourneesRetenues: async (...a: Parameters<typeof actual.lireJourneesRetenues>) => {
      const r = await actual.lireJourneesRetenues(...a);
      const f = course.apres;
      course.apres = null;
      if (f) await f();
      return r;
    },
  };
});

import { db, schema, eq, and, inArray } from '@tiktrends/db';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const ADS = ['120200000000000951', '120200000000000952'];
const JOURS = [7, 6, 5, 4, 3, 2, 1];
const exportAds = (budget: string | null) => [
  `Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad ID,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,${budget === null ? '' : 'Ad set budget,Ad set budget type,'}Clicks (all)`,
  ...ADS.flatMap((ad) => JOURS.map((k) => [
    J(k), J(k), J(k), '[ADSMAP] TEST Marque B1', `Ensemble ${ad}`, `Marque_B1_${ad}`, ad, 'Active', 5, 'purchase', 4000, 5000, '50.00', 90, 5, 195,
    ...(budget === null ? [] : [budget, 'Daily']), 120,
  ].join(','))),
].join('\n') + '\n';

const S = { lot: '', ads: [] as string[] };

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'admin@test.local' });
  await db!.insert(schema.brands).values({ id: ids.marque, workspaceId: ids.ws, name: 'Marque' });
  const [p] = await db!.insert(schema.personas).values({ brandId: ids.marque, name: 'Persona' }).returning();
  const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
  const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  const [b] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids.marque, number: 1, status: 'testing', launchedAt: new Date(Date.now() - 7 * JOUR) }).returning({ id: schema.batches.id });
  S.lot = b!.id;
  for (const [i, ext] of ADS.entries()) {
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: ids.ws, conceptId: c!.id, batchId: b!.id, variantCode: `v${i + 1}`, format: 'static', status: 'paused',
      externalIds: { ad_id: ext }, generatedName: `Marque_B1_${ext}`, launchedAt: new Date(Date.now() - 7 * JOUR),
    }).returning({ id: schema.ads.id });
    S.ads.push(ad!.id);
  }
});

describe('course · l’import A (CBO) écrit entre la lecture et l’écriture de l’import B (muet)', () => {
  it('B garde le CBO que A vient d’écrire · pas l’ABO périmé de sa lecture · lot `cbo`', async () => {
    expect((await applyMesuresAction(exportAds('50'), [], 'abo-t0.csv')).error).toBeUndefined();
    const T = schema.mesuresCsv;
    // L'import A · « Using campaign budget » sur les mêmes lignes, écrit APRÈS la lecture de B.
    course.apres = async () => {
      await db!.update(T).set({ cbo: true, budgetJour: null, importeLe: new Date() }).where(and(eq(T.brandId, ids.marque), inArray(T.adId, S.ads)));
    };
    expect((await applyMesuresAction(exportAds(null), [], 'muet-b.csv')).error).toBeUndefined();
    expect(course.apres, 'témoin · l’import concurrent n’a pas eu lieu').toBeNull();
    const ls = await db!.select({ cbo: T.cbo, budget: T.budgetJour, fichier: T.fichier }).from(T).where(and(eq(T.brandId, ids.marque), eq(T.dateDebut, J(3))));
    expect(ls, 'la preuve gardée vient de la lecture d’avant la transaction · le CBO de l’import concurrent est écrasé par un ABO périmé')
      .toEqual([{ cbo: true, budget: null, fichier: 'muet-b.csv' }, { cbo: true, budget: null, fichier: 'muet-b.csv' }]);
    const [b] = await db!.select({ pc: schema.batches.protocolCheck }).from(schema.batches).where(eq(schema.batches.id, S.lot));
    expect((b!.pc as { violations: Array<{ code: string }> }).violations.map((v) => v.code), 'faux comparable · le CBO de l’import concurrent est perdu').toEqual(['cbo']);
  });
});
