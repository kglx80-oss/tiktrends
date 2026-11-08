import 'server-only';
import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import { decryptSecret, metaDailySync, metaAdsetsSync, type MetaDailyRow, type MetaAdsetInfo } from '@tiktrends/integrations';
import { matchByName, matchByBatchVariant, porteuseSynchro, type EntreeMesure, type ProtocoleAd } from '@tiktrends/core';
import { refreshDecisions } from './decisions';
import { daterJalons } from './jarvis-memory';
import { jointureCreaDeLaMarque } from './adsmap-medias';
import { adsDeLaMarque, journaliserRemontee, recalculerVerdicts } from './adsmap-mesures';

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
 *  - **on n'écrit les mesures d'une marque que sur SES créas.** Une ad liée à
 *    la créa d'une autre marque (`porteuseSynchro` → `etrangere`) garde son
 *    rattachement et son verdict, mais rien n'est écrit sur la créa étrangère
 *    et le lien n'est pas réécrit · la réparation se décide ailleurs. Le compte
 *    rendu les compte (`adsCreaEtrangere`).
 *
 * Best-effort par marque : une marque en échec n'arrête pas les suivantes.
 */

/** Au-delà, on ne redemande pas l'historique : les lots anciens sont clos. */
const MAX_LOOKBACK_DAYS = 120;

export interface AdsMapSyncReport {
  brands: number;
  adsMatched: number;
  adsUnmatched: number;
  /** Ads rattachées dont la créa liée est d'une AUTRE marque · mesures non écrites sur cette créa, lien intact. */
  adsCreaEtrangere: number;
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
  /** La créa liée lue par la jointure BORNÉE à la marque · `null` si elle est d'une autre marque. */
  creaDeLaMarque: string | null;
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
  const porteuse = porteuseSynchro(ad.creativeId, ad.creaDeLaMarque);
  if (porteuse.cas === 'propre') return porteuse.creativeId;
  // Créa d'une autre marque · on n'y écrit rien, et on ne réécrit pas le lien.
  if (porteuse.cas === 'etrangere') return null;
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

/** Une journée lue chez Meta, au format des journées retenues · les mêmes champs que `metrics_daily` relu. */
const enEntree = (r: MetaDailyRow): EntreeMesure => ({
  debut: r.date, fin: r.date,
  mesures: {
    spend: r.spend, impressions: r.impressions, reach: r.reach, clicks: r.clicks, linkClicks: r.linkClicks,
    purchases: r.purchases, purchaseValue: r.purchaseValue, video3s: r.video3s, thruplays: r.thruplays, videoP50: r.videoP50,
  },
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
    creaDeLaMarque: schema.creatives.id,
    variantCode: schema.ads.variantCode, format: schema.ads.format, generatedName: schema.ads.generatedName,
    externalIds: schema.ads.externalIds, launchedAt: schema.ads.launchedAt, status: schema.ads.status,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
    .leftJoin(schema.creatives, jointureCreaDeLaMarque(brand.id))
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

  // 4 · Ingestion · sur une créa DE LA MARQUE seulement. Une ad liée à la créa
  // d'une autre marque est écartée ici et ici seulement : son rattachement, ses
  // repères et son verdict suivent leur cours (ses journées lues comptent pour
  // elle, sans être écrites nulle part).
  const nonEcrites = new Map<string, EntreeMesure[]>();
  for (const r of rattachees) {
    if (porteuseSynchro(r.ad.creativeId, r.ad.creaDeLaMarque).cas === 'etrangere') {
      report.adsCreaEtrangere++;
      console.warn('[adsmap] créa étrangère', JSON.stringify({ brandId: brand.id, adId: r.ad.id, creativeId: r.ad.creativeId }));
      nonEcrites.set(r.ad.id, r.rows.map(enEntree));
      continue;
    }
    const creativeId = await ensureCreative(r.ad, brand.id);
    if (!creativeId) { nonEcrites.set(r.ad.id, r.rows.map(enEntree)); continue; }
    report.daysIngested += await ingest(creativeId, r.externalAdId, r.rows, r.adset);
  }

  // 5 · Protocole et verdicts · LA logique de l'import (`recalculerVerdicts`),
  // sur les journées RETENUES de la marque · les journées Meta qu'on vient
  // d'écrire, relues, ET les entrées d'export des jours que la connexion n'a
  // pas. Une ad mesurée par fichier puis synchronisée garde ses journées
  // d'export · le verdict est le même quel que soit le chemin. Le protocole
  // frais (ensemble, budget, CBO) vient de Meta · le protocole se contrôle AVANT
  // le verdict (§6.2), dans `verdictsDesMesures`.
  const protocoleFrais = new Map<string, ProtocoleAd>(rattachees.map((r) => [r.ad.id, {
    nomAnnonce: r.rows[0]!.adName, campagne: r.rows[0]!.campaignName, campagneId: r.rows[0]!.campaignId,
    ensemble: r.rows[0]!.adsetName, ensembleId: r.rows[0]!.adsetId,
    budgetJour: r.adset?.dailyBudget ?? null, cbo: r.adset?.campaignBudgetOptimization ?? false,
  }]));
  const ads = await adsDeLaMarque(brand.workspaceId, brand.id);
  const v = await recalculerVerdicts(brand, ads, new Set(rattachees.map((r) => r.ad.id)), { maintenant: aujourdhui, protocoleFrais, metaNonEcrites: nonEcrites });
  report.batchesChecked += v.lots;
  report.verdicts += v.verdicts;

  await db.update(schema.brands).set({ adsmapSyncedAt: aujourdhui }).where(eq(schema.brands.id, brand.id));

  // La file de décisions se recalcule ICI, juste après la mesure. Attendre que
  // quelqu'un ouvre l'écran la ferait arriver en retard sur les chiffres qui la
  // remplissent · et c'est le matin qu'on veut la trouver prête.
  try {
    await refreshDecisions(brand.workspaceId, brand.id);
  } catch (e) {
    // Best-effort : une file non recalculée n'invalide pas la mesure qui précède.
    console.error('[adsmap] décisions', brand.id, (e as Error).message);
  }

  // Les verdicts calculés viennent de changer · c'est ICI qu'un seuil se
  // franchit, donc ici qu'il se date (chantier L0). Avant, la date venait de la
  // première lecture de la mémoire, c'est-à-dire de qui regardait. Idempotent
  // (`on conflict do nothing`) et silencieux : `daterJalons` n'échoue jamais.
  await daterJalons(brand.id, brand.workspaceId);
}

/* -------------------------------------------------------------------------- */
/*  Point d'entrée                                                            */
/* -------------------------------------------------------------------------- */

const vide = (): AdsMapSyncReport =>
  ({ brands: 0, adsMatched: 0, adsUnmatched: 0, adsCreaEtrangere: 0, daysIngested: 0, batchesChecked: 0, verdicts: 0, errors: 0 });

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
  if (!b.account || !token) {
    await journaliserRemontee({ workspaceId: b.workspaceId, brandId: b.id, source: 'meta', declencheur: 'bouton', ok: false, erreur: 'meta_not_connected' });
    throw new Error('meta_not_connected');
  }

  report.brands = 1;
  // Le journal des remontées (Connexions · dernière remontée, erreur) · il n'arrête jamais la mesure.
  try {
    await syncBrand({ id: b.id, name: b.name, workspaceId: b.workspaceId, account: b.account, token }, report);
  } catch (e) {
    await journaliserRemontee({ workspaceId: b.workspaceId, brandId: b.id, source: 'meta', declencheur: 'bouton', ok: false, erreur: e });
    throw e;
  }
  await journaliserRemontee({ workspaceId: b.workspaceId, brandId: b.id, source: 'meta', declencheur: 'bouton', ok: true, resume: resumeRemontee(report) });
  return report;
}

/** Le compte rendu d'un passage, en nombres seulement · ce que le journal garde. */
const resumeRemontee = (r: AdsMapSyncReport) => ({ variantes: r.adsMatched, journees: r.daysIngested, verdicts: r.verdicts, lots: r.batchesChecked });
const ecart = (apres: AdsMapSyncReport, avant: AdsMapSyncReport): AdsMapSyncReport =>
  Object.fromEntries(Object.keys(apres).map((k) => [k, apres[k as keyof AdsMapSyncReport] - avant[k as keyof AdsMapSyncReport]])) as unknown as AdsMapSyncReport;

/** Mesure la carte de toutes les marques dont le compte publicitaire est connecté. */
export async function runAdsMapSync(): Promise<AdsMapSyncReport> {
  const report = vide();
  if (!db) return report;

  const brands = await db.select({
    id: schema.brands.id, name: schema.brands.name, workspaceId: schema.brands.workspaceId,
    account: schema.brands.metaAdAccountId, token: schema.brands.metaToken, suspendue: schema.brands.adsmapRemonteeSuspendueLe,
  }).from(schema.brands);

  for (const b of brands) {
    const token = decryptSecret(b.token);
    if (!b.account || !token) continue;
    // Remontée nocturne suspendue pour cette marque (réglage de Connexions) · « Mesurer maintenant » reste possible.
    if (b.suspendue) continue;
    report.brands++;
    const avant = { ...report };
    try {
      await syncBrand({ id: b.id, name: b.name, workspaceId: b.workspaceId, account: b.account, token }, report);
      await journaliserRemontee({ workspaceId: b.workspaceId, brandId: b.id, source: 'meta', declencheur: 'nuit', ok: true, resume: resumeRemontee(ecart(report, avant)) });
    } catch (e) {
      report.errors++;
      console.error('[adsmap] sync', b.id, (e as Error).message);
      await journaliserRemontee({ workspaceId: b.workspaceId, brandId: b.id, source: 'meta', declencheur: 'nuit', ok: false, erreur: e });
    }
  }

  console.log(
    `[adsmap] done · marques=${report.brands} rattachées=${report.adsMatched} non rattachées=${report.adsUnmatched} ` +
    `créa étrangère=${report.adsCreaEtrangere} ` +
    `jours=${report.daysIngested} lots=${report.batchesChecked} verdicts=${report.verdicts} erreurs=${report.errors}`,
  );
  return report;
}
