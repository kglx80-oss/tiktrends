import 'server-only';
import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import { decryptSecret, metaDailySync, metaAdsetsSync, type MetaDailyRow, type MetaAdsetInfo } from '@tiktrends/integrations';
import {
  rollupDaily, evaluationWindow, brandMediansFrom, rankByCpa, matchByName, matchByBatchVariant,
  checkProtocol, summarizeProtocol, computeVerdict, deriveMetrics, DEFAULT_VERDICT_CONFIG,
  type DailyRow, type VerdictConfig, type ProtocolAd, type ProtocolRules, type AdMetrics,
} from '@tiktrends/core';

/**
 * ADSMAP · mesure quotidienne de la carte.
 *
 * Jusqu'ici tout le module savait calculer et rien ne mesurait : le moteur de
 * verdict, le contrôle de protocole et les intervalles existaient, mais aucune
 * donnée réelle ne les atteignait. ADSMAP restait un tableur mieux dessiné.
 *
 * Ce job referme la chaîne, dans cet ordre et pas un autre :
 *
 *   rattacher → ingérer les journées → contrôler le protocole → conclure
 *
 * L'ordre compte. Le protocole se contrôle AVANT le verdict parce qu'il décide
 * de ce qu'un verdict a le droit d'affirmer (§6.2) : hors protocole, le moteur
 * se dégrade en RELATIVE_WINNER au lieu de couronner l'ad que Meta a choisi de
 * servir.
 *
 * Deux règles de prudence traversent le fichier :
 *
 *  - **on ne devine jamais un rattachement.** Une annonce ambiguë reste non
 *    rattachée. Un mauvais rattachement produirait des chiffres faux dans une
 *    interface qui les présente comme mesurés · personne ne les contesterait.
 *  - **on n'écrase jamais un verdict humain.** `validated` appartient à
 *    l'équipe ; le job ne touche qu'à `computed`.
 *
 * Best-effort par marque : une marque en échec n'arrête pas les suivantes.
 */

/** Au-delà, on ne redemande pas l'historique : les lots anciens sont clos. */
const MAX_LOOKBACK_DAYS = 120;
/** Repères de marque · fenêtre du §6.4. */
const MEDIAN_WINDOW_DAYS = 90;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface AdsMapSyncReport {
  brands: number;
  adsMatched: number;
  adsUnmatched: number;
  daysIngested: number;
  batchesChecked: number;
  verdicts: number;
  errors: number;
}

/* -------------------------------------------------------------------------- */
/*  Rattachement                                                              */
/* -------------------------------------------------------------------------- */

interface CarteAd {
  id: string;
  workspaceId: string;
  conceptId: string;
  batchId: string | null;
  batchNumber: number | null;
  creativeId: string | null;
  variantCode: string;
  format: string;
  generatedName: string | null;
  externalIds: { ad_id?: string; adset_id?: string; campaign_id?: string } | null;
  launchedAt: Date | null;
  status: string;
}

/**
 * Trouve l'identifiant Meta d'une ad de la carte.
 *
 * L'identifiant déjà connu l'emporte toujours : une fois posé, il ne se
 * redevine pas. Les deux replis ne servent qu'au premier passage, et leur
 * résultat est épinglé aussitôt · le flou n'a lieu qu'une fois.
 */
function resoudre(ad: CarteAd, candidats: Array<{ adId: string; adName: string }>): { adId: string; source: 'pinned' | 'name' | 'batch' } | null {
  const connu = ad.externalIds?.ad_id;
  if (connu) return { adId: connu, source: 'pinned' };

  if (ad.generatedName) {
    const m = matchByName(ad.generatedName, candidats);
    if (m) return { adId: m, source: 'name' };
  }
  if (ad.batchNumber !== null) {
    const m = matchByBatchVariant(ad.batchNumber, ad.variantCode, candidats);
    if (m) return { adId: m, source: 'batch' };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Ingestion des journées                                                    */
/* -------------------------------------------------------------------------- */

const CREATIVE_TYPE: Record<string, 'video' | 'image' | 'carousel'> = {
  video_ugc: 'video', video_vsl: 'video', video_demo: 'video', video_story: 'video',
  static: 'image', gif: 'image', image_carousel: 'carousel',
};

/**
 * Garantit la créa porteuse d'une ad de la carte.
 *
 * `ad_instances.creative_id` est obligatoire : c'est la table qui porte la face
 * plateforme d'un asset, et le schéma refuse une instance orpheline. Une ad
 * importée du Sheet ou poussée depuis le Studio n'a pas encore d'asset analysé ·
 * on crée alors la coquille, que l'agent d'analyse remplira. Rien n'est dupliqué :
 * c'est la même table `creatives` que le reste du produit.
 */
async function ensureCreative(ad: CarteAd, brandId: string): Promise<string | null> {
  if (ad.creativeId) return ad.creativeId;
  const [c] = await db.insert(schema.creatives).values({
    brandId,
    fingerprintHash: `adsmap:${ad.id}`,
    type: CREATIVE_TYPE[ad.format] ?? 'video',
  }).returning({ id: schema.creatives.id });
  if (!c) return null;
  await db.update(schema.ads).set({ creativeId: c.id }).where(eq(schema.ads.id, ad.id));
  return c.id;
}

/** Écrit l'instance plateforme et ses journées · upsert, donc rejouable. */
async function ingest(
  creativeId: string, externalAdId: string, rows: MetaDailyRow[], adset: MetaAdsetInfo | undefined,
): Promise<number> {
  const tete = rows[0];
  const [inst] = await db.insert(schema.adInstances).values({
    creativeId, externalAdId, platform: 'meta',
    campaignName: tete?.campaignName ?? null,
    adsetName: tete?.adsetName ?? null,
    externalAdsetId: tete?.adsetId ?? null,
    externalCampaignId: tete?.campaignId ?? null,
    adsetDailyBudget: adset?.dailyBudget ?? null,
    status: adset?.status ?? null,
  }).onConflictDoUpdate({
    target: [schema.adInstances.platform, schema.adInstances.externalAdId],
    set: {
      creativeId,
      campaignName: tete?.campaignName ?? null,
      adsetName: tete?.adsetName ?? null,
      externalAdsetId: tete?.adsetId ?? null,
      externalCampaignId: tete?.campaignId ?? null,
      adsetDailyBudget: adset?.dailyBudget ?? null,
      status: adset?.status ?? null,
    },
  }).returning({ id: schema.adInstances.id });
  if (!inst) return 0;

  if (!rows.length) return 0;
  await db.insert(schema.metricsDaily).values(rows.map((r) => ({
    adInstanceId: inst.id, date: r.date,
    spend: r.spend, impressions: r.impressions, reach: r.reach, clicks: r.clicks,
    conv: r.purchases, revenue: r.purchaseValue,
    v3s: r.video3s, p25: r.videoP25, p50: r.videoP50, p75: r.videoP75, p100: r.videoP100,
    thruplays: r.thruplays, linkClicks: r.linkClicks, landingViews: r.landingViews, addToCart: r.addToCart,
  }))).onConflictDoUpdate({
    target: [schema.metricsDaily.adInstanceId, schema.metricsDaily.date],
    set: {
      // Meta réattribue les conversions plusieurs jours après coup : une journée
      // déjà vue peut légitimement changer, donc on remplace au lieu d'ignorer.
      spend: sql`excluded.spend`, impressions: sql`excluded.impressions`, reach: sql`excluded.reach`,
      clicks: sql`excluded.clicks`, conv: sql`excluded.conv`, revenue: sql`excluded.revenue`,
      v3s: sql`excluded.v3s`, p25: sql`excluded.p25`, p50: sql`excluded.p50`,
      p75: sql`excluded.p75`, p100: sql`excluded.p100`, thruplays: sql`excluded.thruplays`,
      linkClicks: sql`excluded.link_clicks`, landingViews: sql`excluded.landing_views`, addToCart: sql`excluded.add_to_cart`,
    },
  });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/*  Marque                                                                    */
/* -------------------------------------------------------------------------- */

interface Rattachee { ad: CarteAd; externalAdId: string; rows: MetaDailyRow[]; adset: MetaAdsetInfo | undefined }

/** Journées Meta ramenées au format attendu par l'agrégation pure. */
const toDaily = (r: MetaDailyRow): DailyRow => ({
  date: r.date, spend: r.spend, impressions: r.impressions, linkClicks: r.linkClicks,
  purchases: r.purchases, purchaseValue: r.purchaseValue,
  video3s: r.video3s || undefined, thruplays: r.thruplays || undefined, videoP50: r.videoP50 || undefined,
});

async function syncBrand(
  brand: { id: string; name: string; workspaceId: string; account: string; token: string },
  report: AdsMapSyncReport,
): Promise<void> {
  // 1 · Les ads de la carte qui ont quelque chose à mesurer. Les brouillons n'ont
  // rien lancé ; les terminées ont déjà leur verdict et ne changeront plus.
  const rows = await db.select({
    id: schema.ads.id, workspaceId: schema.ads.workspaceId, conceptId: schema.ads.conceptId,
    batchId: schema.ads.batchId, batchNumber: schema.batches.number, creativeId: schema.ads.creativeId,
    variantCode: schema.ads.variantCode, format: schema.ads.format, generatedName: schema.ads.generatedName,
    externalIds: schema.ads.externalIds, launchedAt: schema.ads.launchedAt, status: schema.ads.status,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
    .where(and(eq(schema.personas.brandId, brand.id), inArray(schema.ads.status, ['live', 'paused'])));

  const carte = rows as CarteAd[];
  if (!carte.length) return;

  // 2 · Fenêtre de synchro · on ne redemande pas tout l'historique chaque nuit.
  const aujourdhui = new Date();
  const lancements = carte.map((a) => a.launchedAt).filter((d): d is Date => !!d).map((d) => d.getTime());
  const plancher = aujourdhui.getTime() - MAX_LOOKBACK_DAYS * 86_400_000;
  const since = new Date(Math.max(plancher, lancements.length ? Math.min(...lancements) : plancher));

  const [daily, adsets] = await Promise.all([
    metaDailySync(brand.account, brand.token, { since, until: aujourdhui }),
    metaAdsetsSync(brand.account, brand.token).catch(() => [] as MetaAdsetInfo[]),
  ]);
  if (!daily.length) return;

  // 3 · Rattachement · un candidat par annonce du compte, nom compris.
  const parAd = new Map<string, MetaDailyRow[]>();
  for (const r of daily) parAd.set(r.adId, [...(parAd.get(r.adId) ?? []), r]);
  const candidats = [...parAd.entries()].map(([adId, rs]) => ({ adId, adName: rs[0]!.adName }));
  const adsetById = new Map(adsets.map((a) => [a.adsetId, a]));

  const rattachees: Rattachee[] = [];
  const pris = new Set<string>();
  for (const ad of carte) {
    const r = resoudre(ad, candidats.filter((c) => !pris.has(c.adId)));
    if (!r) { report.adsUnmatched++; continue; }
    const rs = parAd.get(r.adId);
    if (!rs?.length) { report.adsUnmatched++; continue; }
    pris.add(r.adId);
    report.adsMatched++;

    // On épingle l'identifiant dès le premier rattachement réussi : les passages
    // suivants n'auront plus à deviner, même si l'équipe renomme l'annonce.
    if (r.source !== 'pinned') {
      await db.update(schema.ads).set({
        externalIds: { ad_id: r.adId, adset_id: rs[0]!.adsetId ?? undefined, campaign_id: rs[0]!.campaignId ?? undefined },
      }).where(eq(schema.ads.id, ad.id));
    }
    rattachees.push({ ad, externalAdId: r.adId, rows: rs, adset: rs[0]!.adsetId ? adsetById.get(rs[0]!.adsetId) : undefined });
  }
  if (!rattachees.length) return;

  // 4 · Ingestion.
  for (const r of rattachees) {
    const creativeId = await ensureCreative(r.ad, brand.id);
    if (!creativeId) continue;
    report.daysIngested += await ingest(creativeId, r.externalAdId, r.rows, r.adset);
  }

  // 5 · Réglages de la marque · sans eux, le moteur tournerait sur des seuils
  // génériques et produirait des verdicts que l'équipe ne reconnaîtrait pas.
  const [[vc], [tp]] = await Promise.all([
    db.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brand.id)).limit(1),
    db.select().from(schema.testProtocols).where(eq(schema.testProtocols.brandId, brand.id)).limit(1),
  ]);
  const cfg: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((vc?.config as Partial<VerdictConfig>) ?? {}) };
  const regles: ProtocolRules = {
    structure: tp?.structure ?? 'abo_one_adset_per_ad',
    campaignNamePattern: tp?.campaignNamePattern ?? '[ADSMAP] TEST {brand} B{batch}',
    budgetVarianceTolerance: tp?.budgetVarianceTolerance ?? 0.2,
    minSpendShare: cfg.minSpendShare,
  };

  // 6 · Repères de marque · sur 90 jours, toutes ads rattachées confondues.
  const debutMedianes = ymd(new Date(aujourdhui.getTime() - MEDIAN_WINDOW_DAYS * 86_400_000));
  const medianes = brandMediansFrom(
    rattachees.map((r) => rollupDaily(r.rows.map(toDaily), { since: debutMedianes }).metrics),
  );

  // 7 · Agrégat de chaque ad sur SA fenêtre d'évaluation · une ad lancée hier et
  // une ad lancée il y a un mois ne se comparent pas sur la même durée.
  const agreges = new Map<string, { metrics: AdMetrics; days: number }>();
  for (const r of rattachees) {
    const depart = r.ad.launchedAt ? ymd(r.ad.launchedAt) : rollupDaily(r.rows.map(toDaily)).firstDate;
    const fenetre = depart ? evaluationWindow(depart, cfg.evaluationWindowDays) : undefined;
    const roll = rollupDaily(r.rows.map(toDaily), fenetre);
    agreges.set(r.ad.id, {
      metrics: roll.metrics,
      days: depart ? Math.min(cfg.evaluationWindowDays, daysBetween(depart, ymd(aujourdhui)) + 1) : roll.days,
    });
  }

  // 8 · Protocole, lot par lot · il décide de ce que le verdict a le droit de dire.
  const lots = new Map<string, Rattachee[]>();
  for (const r of rattachees) if (r.ad.batchId) lots.set(r.ad.batchId, [...(lots.get(r.ad.batchId) ?? []), r]);

  const comparableParAd = new Map<string, boolean>();
  const partParAd = new Map<string, number>();
  const rangParAd = new Map<string, number>();

  for (const [batchId, membres] of lots) {
    const numero = membres[0]!.ad.batchNumber ?? 0;
    const protoAds: ProtocolAd[] = membres.map((r) => ({
      adId: r.ad.id,
      adName: r.rows[0]!.adName,
      adsetId: r.rows[0]!.adsetId,
      campaignId: r.rows[0]!.campaignId,
      campaignName: r.rows[0]!.campaignName,
      adsetDailyBudget: r.adset?.dailyBudget ?? null,
      spend: agreges.get(r.ad.id)?.metrics.spend ?? 0,
      campaignBudgetOptimization: r.adset?.campaignBudgetOptimization ?? false,
    }));
    const check = checkProtocol(protoAds, regles, { brandName: brand.name, batchNumber: numero });

    await db.update(schema.batches).set({
      protocolCheck: { ...check, summary: summarizeProtocol(check), checkedAt: aujourdhui.toISOString() },
    }).where(eq(schema.batches.id, batchId));
    report.batchesChecked++;

    // Le rang sert au gagnant RELATIF : hors protocole, « meilleure du lot » est
    // la seule chose qu'on puisse encore affirmer.
    const rangs = rankByCpa(membres.map((r) => ({
      adId: r.ad.id, cpa: deriveMetrics(agreges.get(r.ad.id)!.metrics, cfg.ciLevelOneSided).cpa,
    })));
    for (const r of membres) {
      comparableParAd.set(r.ad.id, check.compliant && !check.underDelivered.includes(r.ad.id));
      partParAd.set(r.ad.id, check.spendShare[r.ad.id] ?? 0);
      rangParAd.set(r.ad.id, rangs[r.ad.id] ?? 0);
    }
  }

  // 9 · Verdicts.
  for (const r of rattachees) {
    const agg = agreges.get(r.ad.id);
    if (!agg) continue;
    const res = computeVerdict({
      metrics: agg.metrics, config: cfg, brandMedians: medianes,
      // Une ad hors lot n'a pas de protocole à respecter, mais elle n'a pas non
      // plus de témoin : on ne peut pas la déclarer comparable.
      comparable: comparableParAd.get(r.ad.id) ?? false,
      spendShare: partParAd.get(r.ad.id),
      batchRank: rangParAd.get(r.ad.id),
      daysElapsed: agg.days,
    });

    await db.insert(schema.verdicts).values({
      adId: r.ad.id, workspaceId: r.ad.workspaceId,
      computed: res.computed, comparable: res.comparable,
      failedStage: res.failedStage, killFlag: res.killFlag,
      metricsAgg: {
        ...res.derived, spend: agg.metrics.spend, impressions: agg.metrics.impressions,
        purchases: agg.metrics.purchases, daysElapsed: agg.days, daysRemaining: res.daysRemaining,
        reason: res.reason, syncedAt: aujourdhui.toISOString(),
      },
      computedAt: aujourdhui,
    }).onConflictDoUpdate({
      target: schema.verdicts.adId,
      set: {
        computed: sql`excluded.computed`, comparable: sql`excluded.comparable`,
        failedStage: sql`excluded.failed_stage`, killFlag: sql`excluded.kill_flag`,
        metricsAgg: sql`excluded.metrics_agg_json`, computedAt: sql`excluded.computed_at`,
        // `validated`, `status` et `override_reason` restent intacts : ce sont
        // des décisions humaines, et un job nocturne ne défait pas un arbitrage.
      },
    });
    report.verdicts++;
  }

  await db.update(schema.brands).set({ adsmapSyncedAt: aujourdhui }).where(eq(schema.brands.id, brand.id));
}

/* -------------------------------------------------------------------------- */
/*  Point d'entrée                                                            */
/* -------------------------------------------------------------------------- */

const vide = (): AdsMapSyncReport =>
  ({ brands: 0, adsMatched: 0, adsUnmatched: 0, daysIngested: 0, batchesChecked: 0, verdicts: 0, errors: 0 });

/**
 * Mesure la carte d'une seule marque · c'est ce que déclenche le bouton
 * « Mesurer maintenant ». Les erreurs remontent ici plutôt que d'être avalées :
 * quelqu'un attend la réponse à l'écran, il a droit à la raison de l'échec.
 */
export async function runAdsMapSyncForBrand(brandId: string): Promise<AdsMapSyncReport> {
  const report = vide();
  if (!db) return report;

  const [b] = await db.select({
    id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId,
    account: schema.brands.metaAdAccountId, token: schema.brands.metaToken,
  }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!b) return report;

  const token = decryptSecret(b.token);
  if (!b.account || !token) throw new Error('meta_not_connected');

  report.brands = 1;
  await syncBrand({ id: b.id, name: b.name, workspaceId: b.workspaceId, account: b.account, token }, report);
  return report;
}

/** Mesure la carte de toutes les marques dont le compte publicitaire est connecté. */
export async function runAdsMapSync(): Promise<AdsMapSyncReport> {
  const report = vide();
  if (!db) return report;

  const brands = await db.select({
    id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId,
    account: schema.brands.metaAdAccountId, token: schema.brands.metaToken,
  }).from(schema.brands);

  for (const b of brands) {
    const token = decryptSecret(b.token);
    if (!b.account || !token) continue;
    report.brands++;
    try {
      await syncBrand({ id: b.id, name: b.name, workspaceId: b.workspaceId, account: b.account, token }, report);
    } catch (e) {
      report.errors++;
      console.error('[adsmap] sync', b.id, (e as Error).message);
    }
  }

  console.log(
    `[adsmap] done · marques=${report.brands} rattachées=${report.adsMatched} non rattachées=${report.adsUnmatched} ` +
    `jours=${report.daysIngested} lots=${report.batchesChecked} verdicts=${report.verdicts} erreurs=${report.errors}`,
  );
  return report;
}
