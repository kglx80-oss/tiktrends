import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Une lecture des ensembles Meta (adsets) en ÉCHEC ne fait rien oublier à la
 * synchro Adsmap.
 *
 * Le défaut · `metaAdsetsSync` échoue (quota, droits) → la synchro continue
 * avec une liste vide. Deux effets, une cause ·
 *  - le protocole « frais » de chaque ad était construit avec `cbo: false` et
 *    `budgetJour: null`, et il est PRIORITAIRE sur le protocole stocké · un lot
 *    en CBO passait « Protocole respecté · comparables » et ses ads
 *    devenaient des `winner` absolus, ce que le §6.1 interdit ;
 *  - l'instance voyait son budget d'ensemble et son statut écrasés par `null`
 *    (seul le CBO était gardé, par `coalesce`).
 *
 * La garde lance la VRAIE synchro (`runAdsMapSyncForBrand`), la VRAIE lecture
 * Meta (`metaDailySync`, `metaAdsetsSync`) contre une vraie base (pglite) ·
 * seul `fetch` est simulé · aucun réseau, aucune dépense. Elle LIT la base ·
 * instances (budget, statut, CBO), contrôle du lot, verdicts.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID() };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);
/** Le faux Meta · `ensembles` · ce que rend la lecture des ensembles, ou `'droits'` · un refus de droits (403, non redemandé). */
const meta = vi.hoisted(() => ({
  ensembles: [] as Array<Record<string, unknown>> | 'droits',
  appelsEnsembles: 0,
}));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  decryptSecret: (v: string | null) => (v ? 'jeton-factice' : null),
}));

import { db, schema, eq, inArray } from '@tiktrends/db';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const ADS = ['meta-a', 'meta-b'] as const;
const CAMPAGNE = '[ADSMAP] TEST Marque B1';
const JOURS = [7, 6, 5, 4, 3, 2, 1];

function fauxFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const u = new URL(url);
    const fin = { cursors: { after: 'fin' } };
    if (u.pathname.endsWith('/adsets')) {
      meta.appelsEnsembles++;
      if (meta.ensembles === 'droits') {
        return new Response(JSON.stringify({ error: { message: '(#200) Permissions error · ads_read', code: 200 } }), { status: 403 });
      }
      return new Response(JSON.stringify({ data: meta.ensembles, paging: fin }), { status: 200 });
    }
    // Insights · 7 journées par ad, 50 € et 5 achats par jour · CPA 10 € · de quoi couronner un `winner` absolu si le lot était comparable.
    const data = ADS.flatMap((ad) => JOURS.map((k) => ({
      ad_id: ad, ad_name: `Marque_B1_${ad}`, adset_id: `s-${ad}`, adset_name: `Ensemble ${ad}`, campaign_id: 'c-1', campaign_name: CAMPAGNE,
      date_start: J(k), spend: '50', impressions: '5000', reach: '4000', clicks: '120', inline_link_clicks: '90',
      actions: [{ action_type: 'omni_purchase', value: '5' }], action_values: [{ action_type: 'omni_purchase', value: '195' }],
    })));
    return new Response(JSON.stringify({ data, paging: fin }), { status: 200 });
  });
}

/** Les ensembles tels que Meta les rend · budgets en centimes · `cbo` · budget porté par la campagne. */
const ensembles = (o: { budget: number | null; statut: string; cbo: boolean }) => ADS.map((ad) => ({
  id: `s-${ad}`, name: `Ensemble ${ad}`, campaign_id: 'c-1', status: o.statut, ...(o.budget === null ? {} : { daily_budget: String(o.budget * 100) }),
  ...(o.cbo ? { campaign: { daily_budget: '20000' } } : {}),
}));

const adIds: string[] = [];
let lotId = '';

const instances = async () => Object.fromEntries((await db!.select({
  e: schema.adInstances.externalAdId, budget: schema.adInstances.adsetDailyBudget, statut: schema.adInstances.status, cbo: schema.adInstances.campaignBudgetOptimization,
}).from(schema.adInstances).where(inArray(schema.adInstances.externalAdId, [...ADS]))).map((r) => [r.e, { budget: r.budget, statut: r.statut, cbo: r.cbo }]));
const verdicts = async () => (await db!.select({ ad: schema.verdicts.adId, computed: schema.verdicts.computed, comparable: schema.verdicts.comparable })
  .from(schema.verdicts).where(inArray(schema.verdicts.adId, adIds))).sort((x, y) => adIds.indexOf(x.ad) - adIds.indexOf(y.ad)).map((v) => ({ computed: v.computed, comparable: v.comparable }));
async function lot() {
  const [b] = await db!.select({ pc: schema.batches.protocolCheck }).from(schema.batches).where(eq(schema.batches.id, lotId));
  const pc = b!.pc as { violations: Array<{ code: string }>; summary: string };
  return { codes: pc.violations.map((v) => v.code), resume: pc.summary };
}
/** Une synchro dont la lecture des ensembles est refusée · le refus est journalisé (console.warn), la mesure continue. */
async function synchroEnsemblesRefuses() {
  meta.ensembles = 'droits';
  meta.appelsEnsembles = 0;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await runAdsMapSyncForBrand(ids.brand);
    expect(meta.appelsEnsembles, 'témoin · la lecture des ensembles n’a pas été tentée').toBe(1);
    expect(warn.mock.calls.some((c) => c[0] === '[adsmap] ensembles non lus'), 'témoin · la lecture des ensembles n’a pas échoué').toBe(true);
  } finally { warn.mockRestore(); }
}

const CBO_LU = { budget: 50, statut: 'ACTIVE', cbo: true };
/** Les verdicts d'un lot hors protocole · aucun comparable, aucun `winner` absolu (le meilleur n'est que relatif). */
const relatifs = (vs: Array<{ computed: string | null; comparable: boolean }>) => ({
  comparables: vs.filter((v) => v.comparable).length, winners: vs.filter((v) => v.computed === 'winner').length, verdicts: vs.length,
});
const RELATIFS = { comparables: 0, winners: 0, verdicts: 2 };

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Marque', metaAdAccountId: 'act_1', metaToken: 'chiffre' });
  const [p] = await db!.insert(schema.personas).values({ brandId: ids.brand, name: 'Persona' }).returning();
  const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
  const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  const [b] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids.brand, number: 1, status: 'testing', launchedAt: new Date(Date.now() - 7 * JOUR) }).returning({ id: schema.batches.id });
  lotId = b!.id;
  for (const [i, ext] of ADS.entries()) {
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: ids.ws, conceptId: c!.id, batchId: lotId, variantCode: `v${i + 1}`, format: 'static', status: 'paused',
      externalIds: { ad_id: ext }, launchedAt: new Date(Date.now() - 7 * JOUR),
    }).returning({ id: schema.ads.id });
    adIds.push(ad!.id);
  }
  fauxFetch();
});

describe('synchro Adsmap · une lecture des ensembles Meta en échec ne fait rien oublier', () => {
  it('lecture réussie · CBO, budget et statut écrits sur l’instance, le lot reste relatif', async () => {
    meta.ensembles = ensembles(CBO_LU);
    await runAdsMapSyncForBrand(ids.brand);
    expect(await instances()).toEqual({ 'meta-a': CBO_LU, 'meta-b': CBO_LU });
    expect((await lot()).codes).toContain('cbo');
    expect(relatifs(await verdicts())).toEqual(RELATIFS);
  });

  it('lecture des ensembles REFUSÉE (403 droits) · le lot en CBO reste relatif · aucun `winner` absolu', async () => {
    await synchroEnsemblesRefuses();
    expect(relatifs(await verdicts()), 'lecture des ensembles en échec · un lot en CBO a des verdicts comparables et des winners absolus (§6.1)').toEqual(RELATIFS);
    const l = await lot();
    expect(l.codes, 'lecture des ensembles en échec · le CBO connu a été oublié, le lot passe pour comparable').toContain('cbo');
    expect(l.resume).toBe('Budget piloté par la campagne : les verdicts de ce lot ne seront que relatifs.');
  });

  it('lecture des ensembles REFUSÉE · budget et statut de l’ensemble INCHANGÉS sur l’instance (comme le CBO)', async () => {
    const i = await instances();
    expect(i['meta-a']?.budget, 'lecture des ensembles en échec · le budget connu de l’ensemble a été effacé').toBe(50);
    expect(i['meta-a']?.statut, 'lecture des ensembles en échec · le statut connu de l’ensemble a été effacé').toBe('ACTIVE');
    expect(i).toEqual({ 'meta-a': CBO_LU, 'meta-b': CBO_LU });
  });

  it('lecture réussie ensuite · les nouvelles valeurs sont écrites (ABO, 60 €, en pause), le lot devient comparable, `winner` absolus', async () => {
    const abo = { budget: 60, statut: 'PAUSED', cbo: false };
    meta.ensembles = ensembles(abo);
    await runAdsMapSyncForBrand(ids.brand);
    expect(await instances(), 'une lecture réussie n’écrit plus ce qu’elle lit').toEqual({ 'meta-a': abo, 'meta-b': abo });
    expect((await lot()).codes).not.toContain('cbo');
    expect(await verdicts(), 'témoin · le jeu ne couronne pas de winner quand le lot est comparable').toEqual([{ computed: 'winner', comparable: true }, { computed: 'winner', comparable: true }]);
  });

  it('lecture des ensembles REFUSÉE après un ABO connu · le lot reste comparable, l’ABO connu tient (le repli n’invente pas de CBO)', async () => {
    await synchroEnsemblesRefuses();
    expect(await instances()).toEqual({ 'meta-a': { budget: 60, statut: 'PAUSED', cbo: false }, 'meta-b': { budget: 60, statut: 'PAUSED', cbo: false } });
    expect((await lot()).codes).not.toContain('cbo');
    expect(await verdicts()).toEqual([{ computed: 'winner', comparable: true }, { computed: 'winner', comparable: true }]);
  });

  it('lecture réussie · passage en CBO pur, l’ensemble n’a plus de budget · le budget LU (nul) s’écrit, l’ancien ne reste pas', async () => {
    const cboPur = { budget: null, statut: 'ACTIVE', cbo: true };
    meta.ensembles = ensembles(cboPur);
    await runAdsMapSyncForBrand(ids.brand);
    expect(await instances(), 'lecture réussie · un budget d’ensemble lu vide n’a pas remplacé l’ancien').toEqual({ 'meta-a': cboPur, 'meta-b': cboPur });
    expect((await lot()).codes).toContain('cbo');
    expect(relatifs(await verdicts())).toEqual(RELATIFS);
  });
});
