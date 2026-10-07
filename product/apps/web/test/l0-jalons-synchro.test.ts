import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Chantier L0 · la synchro Adsmap (cron et bouton « Mesurer maintenant ») date
 * les jalons qu'elle fait franchir.
 *
 * Depuis que les lectures ne datent plus rien, un seuil franchi par la synchro
 * nocturne (verdicts CALCULÉS, sans arbitrage humain) n'était daté qu'à la
 * commande suivante. On lance la VRAIE synchro (`runAdsMapSyncForBrand`)
 * contre une vraie base (pglite) · seul Meta est simulé (journées fournies), et
 * le moteur de verdict rend un verdict concluant fixé, pour que le seuil soit
 * franchi par la synchro et par elle seule. Attendu · aucun jalon avant, des
 * jalons après, et une seconde synchro ne les redate pas.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID() };
});
const h = vi.hoisted(() => ({ verdicts: ['winner', 'loser', 'loser', 'winner'] as string[] }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  const jour = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const ligne = (i: number) => ({
    adId: `meta-${i}`, adName: `Ad ${i}`, adsetId: `as-${i}`, adsetName: null, campaignId: 'c-1', campaignName: 'Test',
    date: jour, spend: 50, impressions: 5000, reach: 4000, clicks: 80, linkClicks: 60, landingViews: 40, addToCart: 4,
    purchases: i % 2 ? 0 : 3, purchaseValue: i % 2 ? 0 : 120, video3s: 0, thruplays: 0, videoP25: 0, videoP50: 0, videoP75: 0, videoP100: 0,
  });
  return {
    ...actual,
    decryptSecret: () => 'jeton-factice',
    metaDailySync: async () => [0, 1, 2, 3].map(ligne),
    metaAdsetsSync: async () => [],
  };
});
// Le moteur de verdict rend un verdict concluant, dans l'ordre des ads · c'est
// la synchro qui l'écrit, et elle seule.
vi.mock('@tiktrends/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/core')>();
  let n = 0;
  return {
    ...actual,
    computeVerdict: (input: Parameters<typeof actual.computeVerdict>[0]) => ({
      ...actual.computeVerdict(input),
      computed: h.verdicts[n++ % h.verdicts.length], comparable: true,
    }),
  };
});

import { db, schema, eq } from '@tiktrends/db';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';
import { jarvisStats } from '../lib/jarvis-memory';

const jalons = () => db.select().from(schema.statMilestones).where(eq(schema.statMilestones.brandId, ids.brand));

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'L0', plan: 'plus' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva', metaAdAccountId: 'act_1', metaToken: 'chiffre' });
  const [p] = await db.insert(schema.personas).values({ brandId: ids.brand, name: 'Persona' }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Dormir' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Démo', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  for (let i = 0; i < 4; i++) {
    await db.insert(schema.ads).values({
      workspaceId: ids.ws, conceptId: c!.id, variantCode: `V${i}`, format: 'static', status: 'paused', // « paused » · mesuré par la synchro, sans exiger le dossier de lancement complet
      externalIds: { ad_id: `meta-${i}` }, launchedAt: new Date(Date.now() - 3 * 86_400_000),
    });
  }
});

describe('synchro Adsmap · les seuils franchis par les verdicts calculés sont datés, une seule fois', () => {
  it('avant la synchro · aucun verdict, aucun jalon (et la mémoire, déjà lue, est en cache)', async () => {
    expect(await db.select().from(schema.verdicts).where(eq(schema.verdicts.workspaceId, ids.ws))).toEqual([]);
    // Une lecture AVANT la synchro remplit le cache de la mémoire (5 min) · la
    // datation doit relire à frais, sinon elle daterait l'état d'avant.
    expect((await jarvisStats(ids.brand, ids.ws)).nAds).toBe(0);
    expect(await jalons()).toEqual([]);
  });

  it('la synchro écrit les verdicts ET date les jalons qu’ils font franchir', async () => {
    const r = await runAdsMapSyncForBrand(ids.brand);
    expect(r.verdicts, 'la synchro n’a calculé aucun verdict · le test ne prouverait rien').toBe(4);
    const j = await jalons();
    const demo = j.find((x) => x.dimension === 'mechanism' && x.key === 'demo');
    expect(demo, 'la synchro a fait franchir le seuil sans dater le jalon').toBeTruthy();
    expect(demo!.nConclusive).toBe(4);
  });

  it('une seconde synchro ne redate rien · même nombre de jalons, même date', async () => {
    const avant = await jalons();
    await runAdsMapSyncForBrand(ids.brand);
    const apres = await jalons();
    expect(apres.length, 'un jalon a été daté deux fois').toBe(avant.length);
    expect(apres.map((x) => `${x.key}@${(x.reachedAt as Date).toISOString()}`).sort())
      .toEqual(avant.map((x) => `${x.key}@${(x.reachedAt as Date).toISOString()}`).sort());
  });
});
