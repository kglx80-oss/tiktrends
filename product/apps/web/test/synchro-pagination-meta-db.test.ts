import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * La synchro Adsmap lit la pagination Meta JUSQU'AU BOUT, ou échoue en le
 * disant · elle n'écrit jamais un jeu tronqué comme s'il était complet.
 *
 * Le défaut · `graphAll` (`packages/integrations/src/meta-daily.ts`) s'arrêtait
 * à 25 pages (12 500 lignes d'insights) et rendait ce qu'il avait lu. La
 * synchro écrivait ce jeu partiel, datait la mesure et journalisait une
 * remontée RÉUSSIE · les journées au-delà manquaient, les verdicts se
 * calculaient sans elles, aucun écran ne le disait.
 *
 * La garde lance la VRAIE synchro (`runAdsMapSyncForBrand`, puis le bouton
 * `syncAdsMapAction`) et la VRAIE lecture Meta (`metaDailySync`, `graphAll`)
 * contre une vraie base (pglite) · seul `fetch` est simulé, il pagine comme
 * l'API Graph (`paging.next`, `cursors.after`). Aucun réseau, aucune dépense.
 * Puis elle LIT la base et l'écran :
 *  - au-delà d'une borne de pages · la synchro échoue avec sa raison, les
 *    journées déjà en base restent EXACTEMENT celles d'avant, la mesure n'est
 *    pas datée, le journal et Connexions disent « lecture incomplète » ;
 *  - 30 pages (plus que les 25 d'avant, sous la borne) · TOUTES les journées
 *    de l'ad, jusqu'à la dernière page, sont écrites.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID() };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);
/** La pagination simulée · nombre de pages, et la page → les lignes de l'ad suivie qu'elle porte. */
const meta = vi.hoisted(() => ({ pages: 0, adSuivie: new Map<number, Array<{ jour: string; spend: number }>>(), appels: 0 }));

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
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.ws, email: 'admin@test.local', name: null }, workspaceId: ids.ws, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.brand, name: 'Marque', workspaceId: ids.ws },
  }),
}));

import { db, schema, eq, sql } from '@tiktrends/db';
import { etatRemontee } from '@tiktrends/core';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';
import { lireRemontees, lireReglageRemontee } from '../lib/adsmap-mesures';
import { syncAdsMapAction } from '../app/actions/adsmap';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

/** Le faux Meta · une ligne d'une AUTRE annonce du compte par page, plus les lignes de l'ad suivie aux pages choisies. */
function fauxFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/adsets')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    meta.appels++;
    const n = Number(u.searchParams.get('after')?.replace('c', '') ?? '0');
    const base = { adset_id: 's-1', adset_name: 'Ensemble', campaign_id: 'c-1', campaign_name: 'Campagne', impressions: '100', clicks: '2' };
    const data = [
      { ...base, ad_id: `autre-${n}`, ad_name: `Autre ${n}`, date_start: J(2), spend: '1' },
      ...(meta.adSuivie.get(n) ?? []).map((l) => ({ ...base, ad_id: 'meta-x', ad_name: 'Ad suivie', date_start: l.jour, spend: String(l.spend) })),
    ];
    const paging = n + 1 < meta.pages ? { next: 'https://graph.facebook.com/suite', cursors: { after: `c${n + 1}` } } : { cursors: { after: `c${n + 1}` } };
    return new Response(JSON.stringify({ data, paging }), { status: 200 });
  });
}

let instance = '';
/** Les journées de l'ad suivie en base · jour → dépense. */
const journees = async () => Object.fromEntries((await db!.select({ d: schema.metricsDaily.date, s: schema.metricsDaily.spend }).from(schema.metricsDaily)
  .where(eq(schema.metricsDaily.adInstanceId, instance)).orderBy(schema.metricsDaily.date)).map((r) => [String(r.d), Number(r.s)]));
const AVANT = () => ({ [J(3)]: 50, [J(2)]: 50, [J(1)]: 50 });

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Marque', metaAdAccountId: 'act_1', metaToken: 'chiffre' });
  const [cr] = await db!.insert(schema.creatives).values({ brandId: ids.brand, fingerprintHash: 'crea-x', type: 'image' }).returning({ id: schema.creatives.id });
  const [inst] = await db!.insert(schema.adInstances).values({ creativeId: cr!.id, externalAdId: 'meta-x', platform: 'meta' }).returning({ id: schema.adInstances.id });
  instance = inst!.id;
  // Les mesures d'une synchro précédente · une synchro incomplète ne doit pas y toucher.
  await db!.insert(schema.metricsDaily).values([3, 2, 1].map((k) => ({ adInstanceId: instance, date: J(k), spend: 50, impressions: 1000 })));
  const [p] = await db!.insert(schema.personas).values({ brandId: ids.brand, name: 'Persona' }).returning();
  const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
  const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  await db!.insert(schema.ads).values({
    workspaceId: ids.ws, conceptId: c!.id, variantCode: 'V1', format: 'static', status: 'paused', creativeId: cr!.id,
    externalIds: { ad_id: 'meta-x' }, launchedAt: new Date(Date.now() - 10 * JOUR),
  });
  fauxFetch();
});

describe('synchro Adsmap · la pagination Meta lue jusqu’au bout, ou un échec dit', () => {
  it('le semis tient · trois journées d’une synchro précédente', async () => {
    expect(await journees()).toEqual(AVANT());
  });

  it('pagination sans fin · ÉCHEC avec sa raison, journées précédentes intactes, mesure non datée, écran qui le dit', async () => {
    meta.pages = Infinity;
    // Page 0 · l'ad suivie avec une dépense qu'un jeu partiel écrirait par-dessus les 50 €.
    meta.adSuivie = new Map([[0, [{ jour: J(2), spend: 999 }]]]);
    meta.appels = 0;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let echec: Error | null = null;
    try { await runAdsMapSyncForBrand(ids.brand); } catch (e) { echec = e as Error; } finally { err.mockRestore(); }

    expect(echec, 'la synchro a réussi sur une pagination tronquée · elle doit échouer en disant que la lecture Meta est incomplète').not.toBeNull();
    expect(await journees(), 'les mesures précédentes ont été écrasées par un jeu partiel · une lecture incomplète ne doit rien écrire').toEqual(AVANT());
    expect((await lireReglageRemontee(ids.brand)).derniereReussie, 'une synchro incomplète a daté la mesure comme réussie').toBeNull();

    const [j] = await lireRemontees(ids.brand, 1);
    expect(j, 'la remontée incomplète n’est pas journalisée en échec').toMatchObject({ source: 'meta', ok: false, motif: 'autre', resume: { lectureIncomplete: { raison: 'borne', pages: 1210 } } });
    const e = etatRemontee({ connecte: true, cleDeclenchement: true, suspendueLe: null, derniereReussie: null, journal: [j!] }, new Date(), 'Europe/Paris');
    expect(e.erreur, 'Connexions ne dit pas que la lecture Meta était incomplète').toBe('Meta renvoie plus de 1210 pages de mesures pour ce compte, la lecture a été arrêtée · rien n’a été écrit, les mesures précédentes restent en place');
    expect(meta.appels, 'la lecture a dépassé sa borne de pages').toBe(1210);
  });

  it('le bouton « Mesurer maintenant » dit la même raison, et n’écrit rien non plus', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await syncAdsMapAction().finally(() => err.mockRestore());
    expect(r.error, 'le bouton ne dit pas pourquoi la mesure s’est arrêtée').toBe('Mesure interrompue · Meta renvoie plus de 1210 pages de mesures pour ce compte, la lecture a été arrêtée · rien n’a été écrit, les mesures précédentes restent en place.');
    expect(await journees()).toEqual(AVANT());
  });

  it('30 pages (plus que les 25 d’avant) · les journées de l’ad sont écrites jusqu’à la DERNIÈRE page', async () => {
    meta.pages = 30;
    meta.adSuivie = new Map([[0, [{ jour: J(5), spend: 11 }]], [27, [{ jour: J(4), spend: 12 }]], [29, [{ jour: J(3), spend: 13 }]]]);
    const r = await runAdsMapSyncForBrand(ids.brand);
    expect(await journees(), 'des journées des pages 26 à 30 manquent · la pagination Meta a été tronquée en silence').toEqual({ [J(5)]: 11, [J(4)]: 12, [J(3)]: 13, [J(2)]: 50, [J(1)]: 50 });
    expect(r.daysIngested).toBe(3);
    const [j] = await lireRemontees(ids.brand, 1);
    expect(j).toMatchObject({ ok: true, resume: { journees: 3 } });
    expect((await lireReglageRemontee(ids.brand)).derniereReussie).not.toBeNull();
    const [n] = await db!.select({ n: sql<number>`count(*)::int` }).from(schema.metricsDaily).where(eq(schema.metricsDaily.adInstanceId, instance));
    expect(n!.n).toBe(5);
  });
});
