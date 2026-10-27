import 'server-only';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  DEFAULT_VERDICT_CONFIG, manquesAvantTest, etatLotSpatial,
  type VerdictConfig, type VerdictValue, type FaitsAdSpatial, type FaitsLotSpatial, type ContexteLots, type AgregatMesures,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { effectiveAccess } from '../../../../lib/access';
import { canAccess, denyReason, FEATURES, roleAtLeast } from '../../../../lib/rbac';

/**
 * Spatial · Résultats · lectures serveur partagées par les écrans de la rubrique.
 * LECTURE SEULE · aucune écriture, aucun appel externe, aucun modèle. Les
 * écritures passent par les actions serveur existantes (`app/actions/adsmap-*`).
 *
 * Mêmes gardes que l'Adsmap V5 · session, fonction `adsmap` (rôle + formule Plus),
 * marque active · et, pour les écrans réservés (lots, import), le rôle admin.
 * Mêmes portées · une ad n'a pas de colonne marque, elle s'y rattache par le
 * graphe (concept → angle → désir → persona → marque), comme `listAdsAction`.
 */

const feature = (k: string) => FEATURES.find((f) => f.key === k)!;

export type GardeResultats =
  | { ok: true; s: NonNullable<Awaited<ReturnType<typeof getSession>>>; marque: { id: string; nom: string }; admin: boolean; jarvis: boolean }
  | { ok: false; raison: 'plan' | 'role' | 'marque' };

/** La garde de la rubrique · `reserve` = fonction de la matrice (`lots`, `import`) à exiger en plus. */
export async function gardeResultats(reserve?: 'lots' | 'import'): Promise<GardeResultats> {
  const s = await getSession();
  if (!s) redirect('/login');
  const acces = effectiveAccess(s);
  const adsmap = feature('adsmap');
  if (!canAccess(acces, adsmap)) return { ok: false, raison: denyReason(acces, adsmap) === 'plan' ? 'plan' : 'role' };
  // Comme les pages V5 `lots` et `import` · un rôle insuffisant revient à la vue d'ensemble.
  if (reserve && !canAccess(acces, feature(reserve))) redirect('/adsmap');
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { ok: false, raison: 'marque' };
  return { ok: true, s, marque: { id: brand.id, nom: brand.name }, admin: roleAtLeast(s.role, 'admin'), jarvis: canAccess(acces, feature('jarvis')) };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const url = (...c: Array<string | null | undefined>) => c.find((x) => !!x && /^https?:\/\//i.test(x)) ?? null;

export interface AdLue extends FaitsAdSpatial {
  lotId: string | null;
  concept: string;
  nomGenere: string | null;
  bande: 'low' | 'med' | 'high' | null;
}

export interface LotLu extends FaitsLotSpatial {
  ads: AdLue[];
  creeLe: string;
}

export interface DonneesLots {
  lots: LotLu[];
  /** Les ads de la marque rangées dans aucun lot. */
  horsLot: AdLue[];
  config: VerdictConfig;
  /** Faux tant que la marque n'a enregistré aucun seuil · `config` est alors le défaut du moteur. */
  configEnregistree: boolean;
  structure: 'abo_one_adset_per_ad' | 'abo_single_adset' | 'cbo_tolerated';
  ctx: ContexteLots;
}

/** Tous les lots de la marque, leurs variantes et leurs verdicts · en deux requêtes. */
export async function chargerLots(workspaceId: string, brandId: string, maintenant = new Date()): Promise<DonneesLots> {
  if (!db) return { lots: [], horsLot: [], config: DEFAULT_VERDICT_CONFIG, configEnregistree: false, structure: 'abo_one_adset_per_ad', ctx: { maintenant, fenetreJours: DEFAULT_VERDICT_CONFIG.evaluationWindowDays } };
  const [lignes, lots, [vc], [tp]] = await Promise.all([
    db.select({
      ad: {
        id: schema.ads.id, batchId: schema.ads.batchId, variantCode: schema.ads.variantCode, status: schema.ads.status,
        hypothesis: schema.ads.hypothesis, testedVariable: schema.ads.testedVariable, platform: schema.ads.platform,
        adType: schema.ads.adType, offerId: schema.ads.offerId, landingPageId: schema.ads.landingPageId,
        assetUrl: schema.ads.assetUrl, generatedName: schema.ads.generatedName,
      },
      concept: schema.concepts.title, callout: schema.concepts.callout, prelaunch: schema.concepts.prelaunchScore,
      thumb: schema.creatives.thumbUrl, storage: schema.creatives.storageUrl,
      v: {
        computed: schema.verdicts.computed, validated: schema.verdicts.validated, status: schema.verdicts.status,
        comparable: schema.verdicts.comparable, agg: schema.verdicts.metricsAgg, adId: schema.verdicts.adId,
      },
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .leftJoin(schema.creatives, eq(schema.creatives.id, schema.ads.creativeId))
      .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)))
      .orderBy(asc(schema.ads.variantCode))
      .limit(2000),
    db.select({
      id: schema.batches.id, number: schema.batches.number, goal: schema.batches.goal, status: schema.batches.status,
      launchedAt: schema.batches.launchedAt, protocolCheck: schema.batches.protocolCheck, createdAt: schema.batches.createdAt,
    }).from(schema.batches).where(eq(schema.batches.brandId, brandId)).orderBy(desc(schema.batches.number)),
    db.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brandId)).limit(1),
    db.select({ structure: schema.testProtocols.structure }).from(schema.testProtocols).where(eq(schema.testProtocols.brandId, brandId)).limit(1),
  ]);
  const config: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((vc?.config as Partial<VerdictConfig>) ?? {}) };

  const ads: AdLue[] = lignes.map((r) => {
    const agg = (r.v?.agg ?? {}) as Record<string, unknown>;
    const bande = (r.prelaunch as { band?: unknown } | null)?.band;
    return {
      id: r.ad.id,
      lotId: r.ad.batchId,
      variante: r.ad.variantCode,
      statut: r.ad.status,
      hypothese: r.ad.hypothesis,
      variable: r.ad.testedVariable,
      plateforme: r.ad.platform,
      texte: r.callout?.trim() || r.concept || null,
      image: url(r.thumb, r.storage, r.ad.assetUrl),
      manques: manquesAvantTest({ adType: r.ad.adType, hypothesis: r.ad.hypothesis, testedVariable: r.ad.testedVariable, offerId: r.ad.offerId, landingPageId: r.ad.landingPageId }),
      concept: r.concept,
      nomGenere: r.ad.generatedName,
      bande: bande === 'low' || bande === 'med' || bande === 'high' ? bande : null,
      verdict: r.v?.adId ? {
        calcule: (r.v.computed ?? null) as VerdictValue | null,
        retenu: (r.v.validated ?? null) as VerdictValue | null,
        statut: r.v.status === 'validated' ? 'validated' : 'computed',
        comparable: !!r.v.comparable,
        raison: typeof agg.reason === 'string' ? agg.reason : null,
        depense: num(agg.spend), impressions: num(agg.impressions), achats: num(agg.purchases), cpa: num(agg.cpa),
      } : null,
    };
  });

  const parLot = new Map<string, AdLue[]>();
  for (const a of ads) if (a.lotId) parLot.set(a.lotId, [...(parLot.get(a.lotId) ?? []), a]);

  return {
    lots: lots.map((b) => {
      const pc = (b.protocolCheck ?? null) as { compliant?: unknown; summary?: unknown } | null;
      return {
        id: b.id, numero: b.number, but: b.goal, statut: b.status,
        lanceLe: b.launchedAt ? (b.launchedAt as Date).toISOString() : null,
        creeLe: (b.createdAt as Date).toISOString(),
        ads: parLot.get(b.id) ?? [],
        protocole: pc ? { conforme: typeof pc.compliant === 'boolean' ? pc.compliant : null, resume: typeof pc.summary === 'string' ? pc.summary : null } : null,
      };
    }),
    horsLot: ads.filter((a) => !a.lotId),
    config,
    configEnregistree: !!vc,
    structure: tp?.structure ?? 'abo_one_adset_per_ad',
    ctx: { maintenant, fenetreJours: config.evaluationWindowDays },
  };
}

/** Les états des lots, dans l'ordre de la liste. */
export const etatsLots = (d: DonneesLots) => d.lots.map((l) => etatLotSpatial(l, d.ctx));

/** La mesure Meta de la marque · connexion (sans rien déchiffrer) et date de la dernière synchro. */
export async function chargerConnexion(brandId: string): Promise<{ metaConnecte: boolean; mesureLe: string | null }> {
  if (!db) return { metaConnecte: false, mesureLe: null };
  const [b] = await db.select({ compte: schema.brands.metaAdAccountId, jeton: schema.brands.metaToken, le: schema.brands.adsmapSyncedAt })
    .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  return { metaConnecte: !!b?.compte && !!b?.jeton, mesureLe: b?.le ? (b.le as Date).toISOString() : null };
}

/** La somme des journées mesurées des annonces de la marque sur [depuis, jusqua[ (`metrics_daily`). */
export async function chargerMesures(brandId: string, depuis: Date, jusqua: Date): Promise<AgregatMesures> {
  const vide: AgregatMesures = { depense: 0, impressions: 0, vues3s: 0, achats: 0, ventes: 0 };
  if (!db) return vide;
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  const [r] = await db.select({
    depense: sql<number>`coalesce(sum(${schema.metricsDaily.spend}), 0)`,
    impressions: sql<number>`coalesce(sum(${schema.metricsDaily.impressions}), 0)`,
    vues3s: sql<number>`coalesce(sum(${schema.metricsDaily.v3s}), 0)`,
    achats: sql<number>`coalesce(sum(${schema.metricsDaily.conv}), 0)`,
    ventes: sql<number>`coalesce(sum(${schema.metricsDaily.revenue}), 0)`,
  })
    .from(schema.metricsDaily)
    .innerJoin(schema.adInstances, eq(schema.metricsDaily.adInstanceId, schema.adInstances.id))
    .innerJoin(schema.creatives, eq(schema.adInstances.creativeId, schema.creatives.id))
    .where(and(eq(schema.creatives.brandId, brandId), gte(schema.metricsDaily.date, jour(depuis)), lt(schema.metricsDaily.date, jour(jusqua))));
  return r ? { depense: Number(r.depense), impressions: Number(r.impressions), vues3s: Number(r.vues3s), achats: Number(r.achats), ventes: Number(r.ventes) } : vide;
}

export interface ApprentissageLu {
  id: string; adId: string | null; enonce: string; statut: string; refute: boolean; source: string | null; creeLe: string;
}

/** Les apprentissages de la marque, les plus récents d'abord. */
export async function chargerApprentissages(workspaceId: string, brandId: string): Promise<ApprentissageLu[]> {
  if (!db) return [];
  const rows = await db.select({
    id: schema.learnings.id, adId: schema.learnings.adId, statement: schema.learnings.statement, status: schema.learnings.status,
    refuted: schema.learnings.refuted, evidence: schema.learnings.evidence, createdAt: schema.learnings.createdAt,
  }).from(schema.learnings)
    .where(and(eq(schema.learnings.workspaceId, workspaceId), eq(schema.learnings.brandId, brandId)))
    .orderBy(desc(schema.learnings.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id, adId: r.adId, enonce: r.statement, statut: r.status, refute: r.refuted,
    source: typeof (r.evidence as { source?: unknown } | null)?.source === 'string' ? (r.evidence as { source: string }).source : null,
    creeLe: (r.createdAt as Date).toISOString(),
  }));
}
