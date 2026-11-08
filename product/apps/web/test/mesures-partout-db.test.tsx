// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Une seule logique de verdict, et les mesures d'un export comptées partout.
 *
 * Le défaut · la synchro Meta (`syncBrand`) calculait ses verdicts à sa façon,
 * sur ses seules journées Meta · une ad mesurée par un export Ads Manager puis
 * synchronisée perdait ses journées d'export, et une ad mesurée par export
 * seulement disparaissait du protocole de son lot. Les indicateurs de Résultats
 * et le Reporting de l'Accueil ne lisaient que `metrics_daily`.
 *
 * Base RÉELLE (pglite + migrations), actions RÉELLES (import d'export, vraie
 * synchro · seul Meta est simulé, aucun réseau), pages RÉELLES rendues et lues
 * (Résultats, fiche du lot, Accueil). Le jeu, lot 2 de la marque (4 variantes) ·
 *  · x0 · Meta seulement ;
 *  · x1 · Meta ET export les MÊMES jours · l'export est empoisonné (999 € par
 *    jour, aucun achat) · s'il comptait, la variante perdrait ;
 *  · x2 · export J0 à J4, Meta J5 et J6 (l'export de ces deux jours empoisonné) ;
 *  · x3 · export seulement.
 * Lot 1 · 4 perdantes mesurées par export (la référence de la conclusion).
 * Lot 3 · 2 variantes Meta en CBO · le CBO lu par la synchro doit tenir quand
 * l'import recalcule (il n'est pas stocké sur l'instance).
 * Une autre marque a des mesures (Meta et export) dans la fenêtre · rien d'elle
 * ne doit compter. Aucun modèle, aucune dépense.
 */

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    ids: { ws: u(), user: u(), brandA: u(), brandB: u() },
    marque: '' as string,
    meta: [] as unknown[],
    adsets: [] as unknown[],
  };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  decryptSecret: (v: string | null) => (v ? 'jeton-factice' : null),
  metaDailySync: async () => h.meta,
  metaAdsetsSync: async () => h.adsets,
}));
vi.mock('../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth')>()),
  getSession: async () => ({ user: { id: h.ids.user, email: 'proprio@partout.test', name: 'Camille' }, workspaceId: h.ids.ws, workspaceName: 'Agence', role: 'owner', plan: 'business', equipe: null }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  usePathname: () => '/adsmap', useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));

import { db, schema, eq, inArray } from '@tiktrends/db';
import { conclusionLot, etatLotSpatial, referenceConclusion } from '@tiktrends/core';
import ResultatsSpatial from '../app/(spatial)/sp/adsmap/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import { chargerLots, chargerMesures } from '../app/(spatial)/sp/adsmap/donnees';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const ids = h.ids;
const JOUR = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const AUJ = Date.parse(`${ymd(Date.now())}T00:00:00Z`);
const LANCEMENT = AUJ - 9 * JOUR;
const J = (k: number) => ymd(LANCEMENT + k * JOUR);
const NOM = (lot: number, k: number) => `Truefords_B${lot}_Avant-apres_v${k + 1}_hook`;
/** Une journée « gagnante » · 300 € et 20 achats sur 7 jours (CPA 15 € contre une cible de 35 €). */
const ACHATS = [3, 3, 3, 3, 3, 3, 2];
const DEP = 300 / 7;
const S = { lot1: '', lot2: '', lot3: '', r: [] as string[], x: [] as string[], y: [] as string[], autre: '' };

async function chaine(brandId: string, titre: string) {
  const [pe] = await db!.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
const CADRE: Record<string, { offre: string; page: string }> = {};
async function ad(brandId: string, conceptId: string, code: string, o: Partial<typeof schema.ads.$inferInsert>) {
  if (!CADRE[brandId]) {
    const [of] = await db!.insert(schema.offers).values({ workspaceId: ids.ws, brandId, label: 'Offre' }).returning({ id: schema.offers.id });
    const [lp] = await db!.insert(schema.landingPages).values({ workspaceId: ids.ws, brandId, url: 'https://boutique.test/p', label: 'Fiche' }).returning({ id: schema.landingPages.id });
    CADRE[brandId] = { offre: of!.id, page: lp!.id };
  }
  const [a] = await db!.insert(schema.ads).values({
    workspaceId: ids.ws, conceptId, variantCode: code, status: 'live', testedVariable: 'hook', offerId: CADRE[brandId]!.offre, landingPageId: CADRE[brandId]!.page,
    hypothesis: 'Si on montre l’avant-après, alors on convertit, parce que la preuve rassure.', launchedAt: new Date(LANCEMENT), ...o,
  }).returning({ id: schema.ads.id });
  return a!.id;
}

/** Une journée Meta (forme `MetaDailyRow`). */
const ligneMeta = (adId: string, nom: string, lot: number, k: number, d: number, achats: number) => ({
  adId, adName: nom, adsetId: `as-${adId}`, adsetName: `AS ${adId}`, campaignId: `c-${lot}`, campaignName: `[ADSMAP] TEST Truefords B${lot}`,
  date: J(k), spend: d, impressions: 3000, reach: 2500, clicks: 60, linkClicks: 45, landingViews: 30, addToCart: 4,
  purchases: achats, purchaseValue: achats * 39, video3s: 900, thruplays: 0, videoP25: 0, videoP50: 0, videoP75: 0, videoP100: 0,
});

/** Export EN par jour · lignes (nom, jour, dépense, achats). */
function exportEn(lignes: Array<{ nom: string; lot: number; ensemble: string; k: number; depense: number; achats: number }>) {
  const t = 'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type,Clicks (all),3-second video plays';
  return [t, ...lignes.map((l) => [J(l.k), J(l.k), J(l.k), `[ADSMAP] TEST Truefords B${l.lot}`, l.ensemble, l.nom, 'Active', l.achats, 'purchase', 2500, 3000, l.depense.toFixed(4), 45, l.achats, l.achats * 39, 45, 'Daily', 60, 900].join(','))].join('\n') + '\n';
}
/** Export FR d'un bloc (J0 → J6) · lignes (nom, dépense, achats). */
function exportFr(lignes: Array<{ nom: string; lot: number; ensemble: string; depense: string; achats: string; imp: string }>) {
  const t = 'Début des rapports;Fin des rapports;Nom de la campagne;Nom de l’ensemble de publicités;Nom de la publicité;Identifiant de la publicité;Diffusion de la publicité;Résultats;Indicateur de résultats;Couverture;Impressions;Montant dépensé (EUR);Clics sur un lien;Achats;Valeur de conversion des achats;Budget de l’ensemble de publicités;Type de budget de l’ensemble de publicités';
  return '﻿' + [t, ...lignes.map((l) => [J(0), J(6), `[ADSMAP] TEST Truefords B${l.lot}`, l.ensemble, l.nom, '', 'Terminée', l.achats, 'actions:offsite_conversion.fb_pixel_purchase', '15000', l.imp, l.depense, '310', l.achats, '0', '20', 'Quotidien'].join(';'))].join('\r\n') + '\r\n';
}

const SEPT = [0, 1, 2, 3, 4, 5, 6];
// Lot 2 · x1 empoisonné tous les jours (Meta les a) · x2 normal J0-J4, empoisonné J5-J6 (Meta les a) · x3 normal (export seul).
const EN = exportEn([
  ...SEPT.map((k) => ({ nom: NOM(2, 1), lot: 2, ensemble: 'AS x1 fichier', k, depense: 999, achats: 0 })),
  ...SEPT.map((k) => ({ nom: NOM(2, 2), lot: 2, ensemble: 'AS x2 fichier', k, depense: k >= 5 ? 999 : DEP, achats: k >= 5 ? 0 : ACHATS[k]! })),
  ...SEPT.map((k) => ({ nom: NOM(2, 3), lot: 2, ensemble: 'AS x3 fichier', k, depense: DEP, achats: ACHATS[k]! })),
]);
// Lot 1 · 4 perdantes (150 €, aucun achat), d'un bloc · plus y0 (lot 3), une période que la connexion couvre (écartée).
const FR = exportFr([
  ...[0, 1, 2, 3].map((k) => ({ nom: NOM(1, k), lot: 1, ensemble: `ES B1 v${k + 1}`, depense: '150,00', achats: '0', imp: '21 000' })),
  { nom: NOM(3, 0), lot: 3, ensemble: 'ES y0 fichier', depense: '5 000,00', achats: '0', imp: '9 000' },
]);

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'proprio@partout.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.user, role: 'owner' });
  await db!.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.ws, name: 'Truefords', metaAdAccountId: 'act_1', metaToken: 'chiffre' },
    { id: ids.brandB, workspaceId: ids.ws, name: 'Autre' },
  ]);
  const [l1, l2, l3] = await db!.insert(schema.batches).values([1, 2, 3].map((n) => ({
    workspaceId: ids.ws, brandId: ids.brandA, number: n, status: 'testing' as const, launchedAt: new Date(LANCEMENT), goal: n === 2 ? 'L’avant-après en accroche' : null,
  }))).returning({ id: schema.batches.id });
  S.lot1 = l1!.id; S.lot2 = l2!.id; S.lot3 = l3!.id;
  const c = await chaine(ids.brandA, 'Avant-après');
  for (let k = 0; k < 4; k++) S.r.push(await ad(ids.brandA, c, `v${k + 1}`, { batchId: S.lot1, generatedName: NOM(1, k) }));
  for (let k = 0; k < 4; k++) S.x.push(await ad(ids.brandA, c, `v${k + 1}`, { batchId: S.lot2, generatedName: NOM(2, k), externalIds: k < 3 ? { ad_id: `meta-x${k}` } : null }));
  for (let k = 0; k < 2; k++) S.y.push(await ad(ids.brandA, c, `v${k + 1}`, { batchId: S.lot3, generatedName: NOM(3, k), externalIds: { ad_id: `meta-y${k}` } }));

  // L'autre marque · une ad mesurée par export ET une instance Meta, dans la fenêtre · rien ne doit compter chez A.
  const cb = await chaine(ids.brandB, 'Autre');
  S.autre = await ad(ids.brandB, cb, 'v1', { generatedName: 'Autre_B1_Secret_v1_hook' });
  await db!.insert(schema.mesuresCsv).values({ adId: S.autre, workspaceId: ids.ws, brandId: ids.brandB, dateDebut: J(2), dateFin: J(2), spend: 7000, impressions: 1000, linkClicks: 1, purchases: 1 });
  const [crB] = await db!.insert(schema.creatives).values({ brandId: ids.brandB, fingerprintHash: 'b-1', type: 'image' }).returning({ id: schema.creatives.id });
  const [inB] = await db!.insert(schema.adInstances).values({ creativeId: crB!.id, externalAdId: 'meta-b', platform: 'meta' }).returning({ id: schema.adInstances.id });
  await db!.insert(schema.metricsDaily).values({ adInstanceId: inB!.id, date: J(2), spend: 5000, impressions: 100 });

  // Ce que la connexion remontera · x0, x1 tous les jours, x2 J5-J6 seulement · y0, y1 en CBO (20 € par jour, 1 achat).
  h.meta = [
    ...[0, 1].flatMap((i) => SEPT.map((k) => ligneMeta(`meta-x${i}`, NOM(2, i), 2, k, DEP, ACHATS[k]!))),
    ...[5, 6].map((k) => ligneMeta('meta-x2', NOM(2, 2), 2, k, DEP, ACHATS[k]!)),
    ...[0, 1].flatMap((i) => SEPT.map((k) => ligneMeta(`meta-y${i}`, NOM(3, i), 3, k, 20, 1))),
  ];
  h.adsets = [
    ...[0, 1, 2].map((i) => ({ adsetId: `as-meta-x${i}`, dailyBudget: 45, status: 'ACTIVE', campaignBudgetOptimization: false })),
    ...[0, 1].map((i) => ({ adsetId: `as-meta-y${i}`, dailyBudget: 20, status: 'ACTIVE', campaignBudgetOptimization: true })),
  ];
}, 180_000);

/* ───────────────────────────── lectures ───────────────────────────── */

/** Ce que la base dit des verdicts et protocoles des lots · sans les horodatages. */
async function etatDesLots(lots: string[]) {
  const adIds = [...S.r, ...S.x, ...S.y];
  const ads = await db!.select({ id: schema.ads.id, lot: schema.ads.batchId }).from(schema.ads).where(inArray(schema.ads.id, adIds));
  const dans = ads.filter((a) => a.lot && lots.includes(a.lot)).map((a) => a.id);
  const v = await db!.select().from(schema.verdicts).where(inArray(schema.verdicts.adId, dans));
  const b = await db!.select({ id: schema.batches.id, pc: schema.batches.protocolCheck }).from(schema.batches).where(inArray(schema.batches.id, lots));
  const sans = (o: unknown, k: string) => Object.fromEntries(Object.entries((o ?? {}) as Record<string, unknown>).filter(([x]) => x !== k));
  return {
    verdicts: Object.fromEntries(v.map((x) => [x.adId, { computed: x.computed, comparable: x.comparable, failedStage: x.failedStage, killFlag: x.killFlag, agg: sans(x.metricsAgg, 'syncedAt') }])),
    protocoles: Object.fromEntries(b.map((x) => [x.id, sans(x.pc, 'checkedAt')])),
  };
}
const aggDe = async (adId: string) => (await db!.select({ a: schema.verdicts.metricsAgg, c: schema.verdicts.computed, k: schema.verdicts.comparable }).from(schema.verdicts).where(eq(schema.verdicts.adId, adId)))[0];
const html = (el: React.ReactElement) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(avecSpatial(el)); return d; };
const net = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

let avantSync: Awaited<ReturnType<typeof etatDesLots>>;
let apresSync: Awaited<ReturnType<typeof etatDesLots>>;

/* ───────────────────────────── 1 · import, puis synchro ───────────────────────────── */

describe('import d’un export, puis la synchro Meta · une seule logique de verdict', () => {
  it('l’import écrit les mesures (export par jour, puis d’un bloc)', async () => {
    h.marque = ids.brandA;
    const en = await applyMesuresAction(EN, [], 'export-jour.csv');
    expect(en.error, 'import de l’export par jour refusé').toBeUndefined();
    expect(en.ecrit?.ads).toBe(3);
    const fr = await applyMesuresAction(FR, [], 'export-bloc.csv');
    expect(fr.error).toBeUndefined();
    expect(fr.ecrit?.ads).toBe(5);
    // Avant la synchro · aucune journée Meta · x1 n'est mesurée que par son export (empoisonné) · x3 a son verdict.
    expect(Math.round(Number(((await aggDe(S.x[1]!))?.a as { spend?: unknown })?.spend)), 'témoin · avant la synchro, le fichier de x1 devrait compter (aucune journée Meta)').toBe(999 * 7);
    expect((await aggDe(S.x[3]!))?.c).toBeTruthy();
    avantSync = await etatDesLots([S.lot2, S.lot3]);
  });

  it('la synchro garde les journées d’export · x2 = 5 jours d’export + 2 jours Meta, x1 compte Meta une fois, x3 (export seul) reste dans son lot', async () => {
    const r = await runAdsMapSyncForBrand(ids.brandA);
    expect(r.adsMatched, 'rattachement Meta · x0, x1, x2, y0, y1').toBe(5);
    apresSync = await etatDesLots([S.lot2, S.lot3]);
    const v = (i: number) => apresSync.verdicts[S.x[i]!]!;
    const lu = (i: number) => [v(i).computed, v(i).comparable, Math.round(Number(v(i).agg.spend)), v(i).agg.purchases, v(i).agg.source];
    expect(lu(0)).toEqual(['winner', true, 300, 20, 'meta']);
    expect(lu(1), 'x1 · le fichier compté le même jour que la connexion (999 € par jour) · la journée Meta doit l’emporter').toEqual(['winner', true, 300, 20, 'meta']);
    expect(lu(2), 'x2 · après la synchro, les journées d’export des jours que Meta n’a pas sont perdues (ou le fichier compte les jours Meta)').toEqual(['winner', true, 300, 20, 'meta+csv']);
    expect(lu(3), 'x3 · l’ad mesurée par export seulement est sortie de son lot à la synchro').toEqual(['winner', true, 300, 20, 'csv']);
    const p3 = apresSync.protocoles[S.lot3] as { compliant: boolean; violations: Array<{ code: string }>; cboMeta: string[] };
    expect([p3.compliant, p3.violations.map((x) => x.code)], 'lot 3 · le CBO lu chez Meta n’est plus vu').toEqual([false, ['cbo']]);
    expect(p3.cboMeta.sort()).toEqual([...S.y].sort());
  });

  it('ÉGALITÉ des deux chemins · l’import recalcule, sur le même jeu, exactement les verdicts et protocoles de la synchro', async () => {
    // Le même export réimporté · rien ne change en base (« identique »), mais l'import recalcule ses lots par SON chemin.
    const en = await applyMesuresAction(EN, [], 'export-jour.csv');
    const fr = await applyMesuresAction(FR, [], 'export-bloc.csv');
    expect([en.ecrit?.nouvelles, fr.ecrit?.nouvelles], 'le réimport a écrit du nouveau · le jeu n’est plus le même').toEqual([0, 0]);
    const apresImport = await etatDesLots([S.lot2, S.lot3]);
    expect(apresImport, 'la synchro et l’import ne rendent pas le même verdict sur les mêmes journées · deux logiques de verdict').toEqual(apresSync);
    // Témoin · l'état d'avant la synchro (export seul) était bien différent · l'égalité n'est pas celle de deux états figés.
    expect(avantSync.verdicts[S.x[0]!], 'témoin · x0 avait déjà un verdict avant la synchro').toBeUndefined();
    expect(avantSync, 'témoin · la synchro n’a rien changé, l’égalité ne prouverait rien').not.toEqual(apresSync);
  });
});

/* ───────────────────────────── 2 · agrégats ───────────────────────────── */

// Attendu de la marque A sur J0 → J6 · lot 1 4 × 150 (export d'un bloc) · lot 2 4 × 300 · lot 3 2 × 140 (Meta).
const DEPENSE_A = 4 * 150 + 4 * 300 + 2 * 140;
// Entrées d'export retenues · 4 blocs du lot 1, 5 jours de x2, 7 jours de x3 (x1 et y0 · écartées par la connexion).
const IMPORTEES = 4 + 5 + 7;

describe('les agrégats lisent les journées RETENUES · Résultats, fiche et conclusion du lot, Accueil', () => {
  it('chargerMesures · la somme de la marque, Meta et export, chaque jour une fois, rien de l’autre marque', async () => {
    const [cur, prec] = await chargerMesures(ids.brandA, [[new Date(LANCEMENT), new Date(LANCEMENT + 7 * JOUR)], [new Date(LANCEMENT - 7 * JOUR), new Date(LANCEMENT)]]);
    expect(Math.round(cur!.depense), 'dépense de la marque · le fichier compté avec la connexion le même jour, l’export ignoré, ou l’autre marque comptée').toBe(DEPENSE_A);
    expect(cur!.achats).toBe(4 * 20 + 2 * 7);
    expect(cur!.importees).toBe(IMPORTEES);
    expect(prec!.depense).toBe(0);
  });

  it('Résultats · vue d’ensemble rendue · la dépense et sa source', async () => {
    h.marque = ids.brandA;
    const d = html(await ResultatsSpatial({ searchParams: Promise.resolve({}) }));
    const tuiles = [...d.querySelectorAll('.kpi')].map((t) => net(t.textContent));
    expect(tuiles.find((t) => t.startsWith('Dépense')), 'la tuile « Dépense » de Résultats ne lit pas les journées retenues').toContain(net(`${DEPENSE_A.toLocaleString('fr-FR')} €`));
    expect(tuiles.find((t) => t.startsWith('Dépense'))).toContain('Meta et export Ads Manager');
    expect(net(d.textContent)).toContain('14 derniers jours · Meta et export Ads Manager');
  });

  it('fiche du lot 2 rendue · le CPA de chaque variante (dont l’ad mesurée par export seul) et « Hypothèse confirmée »', async () => {
    h.marque = ids.brandA;
    const d = html(await LotSpatial({ params: Promise.resolve({ id: S.lot2 }) }));
    expect([...d.querySelectorAll('.bar span')].map((s) => net(s.textContent)), 'CPA des variantes du lot 2 · une variante perd ses journées d’export ou compte le fichier les jours Meta').toEqual(['15 €', '15 €', '15 €', '15 €']);
    expect(d.querySelector('[data-conclusion]')?.getAttribute('data-conclusion'), 'la conclusion du lot ne parle pas').toBe('confirmee');
    expect(net(d.textContent)).toContain('4 gagnantes sur 4 variantes tranchées');
    const l = await chargerLots(ids.ws, ids.brandA);
    const l2 = l.lots.find((x) => x.id === S.lot2)!;
    expect(conclusionLot(l2, etatLotSpatial(l2, l.ctx), referenceConclusion(l.lots, l2.id)).conclusion).toBe('confirmee');
  });

  it('Accueil rendu · le Reporting compte l’export (dit à l’écran), « Quoi itérer » montre l’ad mesurée par export seul avec ses chiffres', async () => {
    // L'équipe arbitre x3 · gagnante (le plan d'itération ne lit que les verdicts arbitrés).
    await db!.update(schema.verdicts).set({ validated: 'winner', status: 'validated' }).where(eq(schema.verdicts.adId, S.x[3]!));
    h.marque = ids.brandA;
    const d = html(await AccueilSpatial({ searchParams: Promise.resolve({}) }));
    const rep = d.querySelector('#reporting')!;
    expect(rep, 'pas de Reporting Meta à l’Accueil').toBeTruthy();
    const tuiles = Object.fromEntries([...rep.querySelectorAll('.dk')].map((t) => [net(t.querySelector('.lbl')?.textContent), net(t.querySelector('.v')?.textContent)]));
    expect(tuiles['Dépense'], 'Reporting de l’Accueil · la dépense ne lit pas les journées retenues').toBe(net(`${DEPENSE_A.toLocaleString('fr-FR')} €`));
    expect(tuiles['Achats']).toBe(String(4 * 20 + 2 * 7));
    expect(net(rep.querySelector('[data-detail-reporting]')?.textContent), 'l’Accueil ne dit pas qu’un export compte').toContain(`dont ${IMPORTEES} entrées d’un export Ads Manager`);
    const carte = [...d.querySelectorAll('#suggestions article')].map((a) => net(a.textContent)).find((t) => t.includes('Avant-après'));
    expect(carte, '« Quoi itérer » ne montre pas l’ad mesurée par export seulement').toBeTruthy();
    expect(carte).toContain('Dépense300 €');
    expect(carte).toContain('Coût / achat15,00 €');
  });
});
