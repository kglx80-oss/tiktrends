import 'server-only';
import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import {
  DEFAULT_VERDICT_CONFIG, motifEchecRemontee, retenirMesures, verdictsDesMesures, cleEntreeMesure,
  type AdAMesurer, type CandidatMesure, type DeclencheurRemontee, type EntreeMesure, type MesuresLigne,
  type ProtocolRules, type ProtocoleLigne, type RemonteeJournal, type SourceRemontee, type VerdictConfig,
} from '@tiktrends/core';

/**
 * ADSMAP · lectures et écritures des MESURES IMPORTÉES (export Ads Manager) et
 * du journal des remontées. Les règles (rattachement, priorité, verdicts)
 * vivent au noyau · ici, seulement ce qui se lit et s'écrit en base.
 *
 * Portée · tout passe par la marque · une ad n'a pas de colonne marque, elle s'y
 * rattache par le graphe (concept → angle → désir → persona → marque), comme la
 * synchro. Une ad d'une autre marque n'est donc jamais candidate.
 */

/** Une ad de la marque · ce qu'il faut pour la rattacher, la mesurer et rendre son verdict. */
export interface AdDeLaMarque extends CandidatMesure {
  workspaceId: string;
  lotId: string | null;
  statut: string;
  lanceLe: string | null;
}

/** Les ads de la marque qui peuvent recevoir des mesures · tout sauf les brouillons (rien n'a été diffusé). */
export async function adsDeLaMarque(workspaceId: string, brandId: string): Promise<AdDeLaMarque[]> {
  if (!db) return [];
  const rows = await db.select({
    id: schema.ads.id, workspaceId: schema.ads.workspaceId, batchId: schema.ads.batchId, batchNumber: schema.batches.number,
    variantCode: schema.ads.variantCode, generatedName: schema.ads.generatedName, externalIds: schema.ads.externalIds,
    status: schema.ads.status, launchedAt: schema.ads.launchedAt,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
    .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)));
  return rows.filter((r) => r.status !== 'draft').map((r) => ({
    id: r.id, workspaceId: r.workspaceId, lotId: r.batchId, lot: r.batchNumber ?? null, variante: r.variantCode,
    nomRegie: r.generatedName, idMeta: (r.externalIds as { ad_id?: string } | null)?.ad_id ?? null,
    statut: r.status, lanceLe: r.launchedAt ? (r.launchedAt as Date).toISOString().slice(0, 10) : null,
  }));
}

export interface EntreeCsvLue extends EntreeMesure { protocole: ProtocoleLigne; nomAnnonce: string | null; importeLe: string }

/** Les entrées CSV déjà en base pour ces ads, bornées à la marque. */
export async function entreesCsv(brandId: string, adIds: readonly string[]): Promise<Map<string, EntreeCsvLue[]>> {
  const out = new Map<string, EntreeCsvLue[]>();
  if (!db || !adIds.length) return out;
  const rows = await db.select().from(schema.mesuresCsv)
    .where(and(eq(schema.mesuresCsv.brandId, brandId), inArray(schema.mesuresCsv.adId, [...adIds])));
  for (const r of rows) {
    const opt = (v: number | null) => (v === null ? undefined : v);
    const mesures: MesuresLigne = {
      spend: r.spend, impressions: r.impressions, linkClicks: r.linkClicks, purchases: r.purchases,
      reach: opt(r.reach), clicks: opt(r.clicks), purchaseValue: opt(r.purchaseValue), video3s: opt(r.video3s),
      thruplays: opt(r.thruplays), videoP50: opt(r.videoP50), addToCart: opt(r.addToCart), landingViews: opt(r.landingViews),
    };
    for (const k of Object.keys(mesures) as Array<keyof MesuresLigne>) if (mesures[k] === undefined) delete mesures[k];
    out.set(r.adId, [...(out.get(r.adId) ?? []), {
      debut: r.dateDebut, fin: r.dateFin, mesures, nomAnnonce: r.nomAnnonce,
      protocole: { campagne: r.campagne, campagneId: r.campagneId, ensemble: r.ensemble, ensembleId: r.ensembleId, budgetJour: r.budgetJour, cbo: r.cbo },
      importeLe: (r.importeLe as Date).toISOString(),
    }]);
  }
  return out;
}

export interface MesuresMetaLues { jours: Map<string, EntreeMesure[]>; protocole: Map<string, ProtocoleLigne & { nomAnnonce: string | null }> }

/**
 * Les journées que la CONNEXION Meta a écrites pour ces ads (`metrics_daily`) ·
 * par l'identifiant épinglé, sur une créa DE LA MARQUE seulement (même borne que
 * `chargerMesures`). Lecture seule · la synchro reste seule à écrire là.
 */
export async function mesuresMeta(brandId: string, ads: ReadonlyArray<{ id: string; idMeta: string | null }>): Promise<MesuresMetaLues> {
  const jours = new Map<string, EntreeMesure[]>();
  const protocole = new Map<string, ProtocoleLigne & { nomAnnonce: string | null }>();
  const epinglees = ads.filter((a) => a.idMeta);
  if (!db || !epinglees.length) return { jours, protocole };
  const parIdMeta = new Map(epinglees.map((a) => [a.idMeta!, a.id]));
  const rows = await db.select({
    ext: schema.adInstances.externalAdId, campagne: schema.adInstances.campaignName, ensemble: schema.adInstances.adsetName,
    ensembleId: schema.adInstances.externalAdsetId, campagneId: schema.adInstances.externalCampaignId, budget: schema.adInstances.adsetDailyBudget,
    date: schema.metricsDaily.date, spend: schema.metricsDaily.spend, impressions: schema.metricsDaily.impressions,
    linkClicks: schema.metricsDaily.linkClicks, conv: schema.metricsDaily.conv, revenue: schema.metricsDaily.revenue,
    v3s: schema.metricsDaily.v3s, thruplays: schema.metricsDaily.thruplays, p50: schema.metricsDaily.p50,
  })
    .from(schema.metricsDaily)
    .innerJoin(schema.adInstances, eq(schema.metricsDaily.adInstanceId, schema.adInstances.id))
    .innerJoin(schema.creatives, eq(schema.adInstances.creativeId, schema.creatives.id))
    .where(and(eq(schema.creatives.brandId, brandId), eq(schema.adInstances.platform, 'meta'), inArray(schema.adInstances.externalAdId, [...parIdMeta.keys()])));
  for (const r of rows) {
    const adId = parIdMeta.get(r.ext);
    if (!adId) continue;
    const n = (v: number | null) => v ?? 0;
    jours.set(adId, [...(jours.get(adId) ?? []), {
      debut: r.date, fin: r.date,
      mesures: { spend: n(r.spend), impressions: n(r.impressions), linkClicks: n(r.linkClicks), purchases: n(r.conv), purchaseValue: n(r.revenue), video3s: n(r.v3s), thruplays: n(r.thruplays), videoP50: n(r.p50) },
    }]);
    if (!protocole.has(adId)) protocole.set(adId, { nomAnnonce: null, campagne: r.campagne, campagneId: r.campagneId, ensemble: r.ensemble, ensembleId: r.ensembleId, budgetJour: r.budget, cbo: false });
  }
  return { jours, protocole };
}

/** Les jours mesurés par la connexion, par ad · ce que `retenirMesures` laisse à Meta. */
export const joursDe = (m: MesuresMetaLues) => new Map([...m.jours].map(([k, es]) => [k, new Set(es.map((e) => e.debut))]));

/** Les entrées CSV déjà en base, indexées par clé d'écriture · pour dire « identique » ou « remplacée ». */
export function existantesParCle(csv: ReadonlyMap<string, readonly EntreeCsvLue[]>): Map<string, MesuresLigne> {
  const out = new Map<string, MesuresLigne>();
  for (const [adId, es] of csv) for (const e of es) out.set(cleEntreeMesure(adId, e), e.mesures);
  return out;
}

/**
 * Recalcule les verdicts des lots touchés par un import · mêmes règles que la
 * synchro (`verdictsDesMesures`), sur les journées RETENUES (connexion d'abord,
 * fichier ensuite). N'écrit que `computed`, `comparable`, `metrics_agg` · un
 * verdict arbitré par l'équipe reste ce qu'il est.
 */
export async function recalculerVerdicts(
  brand: { id: string; name: string; workspaceId: string },
  ads: readonly AdDeLaMarque[],
  touchees: ReadonlySet<string>,
  maintenant = new Date(),
): Promise<{ verdicts: number; lots: number }> {
  if (!db) return { verdicts: 0, lots: 0 };
  const lotsTouches = new Set(ads.filter((a) => touchees.has(a.id) && a.lotId).map((a) => a.lotId!));
  const concernees = ads.filter((a) => touchees.has(a.id) || (a.lotId && lotsTouches.has(a.lotId)));

  const [csv, meta, [vc], [tp]] = await Promise.all([
    entreesCsv(brand.id, ads.map((a) => a.id)),
    mesuresMeta(brand.id, ads),
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

  const aMesurer = (a: AdDeLaMarque): AdAMesurer => {
    const joursMeta = meta.jours.get(a.id) ?? [];
    const fichier = csv.get(a.id) ?? [];
    const { retenues } = retenirMesures(new Set(joursMeta.map((e) => e.debut)), fichier);
    // Le protocole · la ligne de fichier la plus récente, sinon l'instance synchronisée.
    const dernier = [...fichier].sort((x, y) => (x.importeLe < y.importeLe ? 1 : -1))[0];
    const protocole = dernier ? { ...dernier.protocole, nomAnnonce: dernier.nomAnnonce }
      : meta.protocole.get(a.id) ?? { nomAnnonce: null, campagne: null, campagneId: null, ensemble: null, ensembleId: null, budgetJour: null, cbo: false };
    return { id: a.id, lotId: a.lotId, lotNumero: a.lot, lanceLe: a.lanceLe, entrees: [...joursMeta, ...retenues], protocole };
  };
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const r = verdictsDesMesures(concernees.map(aMesurer), { config: cfg, regles, marque: brand.name, aujourdhui, reperes: ads.map(aMesurer) });

  const sources = new Map(concernees.map((a) => [a.id, { csv: (csv.get(a.id) ?? []).length > 0, meta: (meta.jours.get(a.id) ?? []).length > 0 }]));
  for (const p of r.protocoles) {
    await db.update(schema.batches).set({
      protocolCheck: { ...p.check, summary: p.resume, checkedAt: maintenant.toISOString(), source: 'csv' },
    }).where(and(eq(schema.batches.id, p.lotId), eq(schema.batches.brandId, brand.id)));
  }
  const parAd = new Map(concernees.map((a) => [a.id, a]));
  for (const v of r.verdicts) {
    const s = sources.get(v.adId);
    await db.insert(schema.verdicts).values({
      adId: v.adId, workspaceId: parAd.get(v.adId)!.workspaceId,
      computed: v.res.computed, comparable: v.res.comparable, failedStage: v.res.failedStage, killFlag: v.res.killFlag,
      metricsAgg: {
        ...v.res.derived, spend: v.metrics.spend, impressions: v.metrics.impressions, purchases: v.metrics.purchases,
        daysElapsed: v.jours, daysRemaining: v.res.daysRemaining, reason: v.res.reason, syncedAt: maintenant.toISOString(),
        source: s?.meta && s.csv ? 'meta+csv' : s?.csv ? 'csv' : 'meta',
      },
      computedAt: maintenant,
    }).onConflictDoUpdate({
      target: schema.verdicts.adId,
      set: {
        computed: sql`excluded.computed`, comparable: sql`excluded.comparable`,
        failedStage: sql`excluded.failed_stage`, killFlag: sql`excluded.kill_flag`,
        metricsAgg: sql`excluded.metrics_agg_json`, computedAt: sql`excluded.computed_at`,
      },
    });
  }
  return { verdicts: r.verdicts.length, lots: r.protocoles.length };
}

/* ───────────────────────── journal des remontées ───────────────────────── */

/**
 * Inscrit une remontée au journal · ne fait JAMAIS échouer l'appelant (une
 * mesure réussie ne devient pas un échec parce que son journal n'a pas pu
 * s'écrire). L'échec est un code (`motifEchecRemontee`), jamais le message brut.
 */
export async function journaliserRemontee(e: {
  workspaceId: string; brandId: string; source: SourceRemontee; declencheur: DeclencheurRemontee;
  ok: boolean; erreur?: unknown; resume?: RemonteeJournal['resume'];
}): Promise<void> {
  if (!db) return;
  try {
    await db.insert(schema.remontees).values({
      workspaceId: e.workspaceId, brandId: e.brandId, source: e.source, declencheur: e.declencheur, ok: e.ok,
      motif: e.ok ? null : motifEchecRemontee(e.erreur instanceof Error ? e.erreur.message : String(e.erreur ?? '')),
      resume: e.resume ?? null,
    });
  } catch (x) {
    console.error('[adsmap] journal des remontées', e.brandId, (x as Error).message);
  }
}

/** Les dernières remontées de la marque, la plus récente d'abord. */
export async function lireRemontees(brandId: string, limite = 10): Promise<RemonteeJournal[]> {
  if (!db) return [];
  const rows = await db.select().from(schema.remontees).where(eq(schema.remontees.brandId, brandId))
    .orderBy(sql`${schema.remontees.le} desc`).limit(limite);
  return rows.map((r) => ({
    source: r.source === 'csv' ? 'csv' : 'meta',
    declencheur: r.declencheur === 'nuit' || r.declencheur === 'import' ? r.declencheur : 'bouton',
    le: (r.le as Date).toISOString(), ok: r.ok,
    motif: (r.motif as RemonteeJournal['motif']) ?? null,
    resume: (r.resume as RemonteeJournal['resume']) ?? null,
  }));
}

/** Le réglage de la remontée nocturne et la dernière mesure réussie de la marque · lecture seule. */
export async function lireReglageRemontee(brandId: string): Promise<{ suspendueLe: string | null; derniereReussie: string | null }> {
  if (!db) return { suspendueLe: null, derniereReussie: null };
  const [b] = await db.select({ suspendue: schema.brands.adsmapRemonteeSuspendueLe, mesure: schema.brands.adsmapSyncedAt })
    .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  return {
    suspendueLe: b?.suspendue ? (b.suspendue as Date).toISOString() : null,
    derniereReussie: b?.mesure ? (b.mesure as Date).toISOString() : null,
  };
}
