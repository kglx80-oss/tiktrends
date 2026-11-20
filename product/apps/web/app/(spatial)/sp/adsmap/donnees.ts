import 'server-only';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  DEFAULT_VERDICT_CONFIG, conclusionLot, manquesAvantTest, etatLotSpatial, presentationLot, referenceConclusion, lireOrigineHypothese, lireProvenanceJarvis, lireProvenanceCommentaire, lireProvenanceNote, sommeRetenues,
  compteAConclure, compteAImporter, idsLotsConclus,
  type EstimationHypothese, type OrigineHypotheseLibre, type ProvenanceJarvis, type ProvenanceCommentaire, type ProvenanceNote, type VerdictConfig, type VerdictValue, type FaitsAdSpatial, type FaitsLotSpatial, type ContexteLots, type AgregatMesures,
  type FaitsHypotheseAd, type CompteAConclure, type FaitsVerdictSpatial, type SeuilMinimumMoteur, type VarianteFinPrevue,
  type CompteAImporter, type FaitsLotAImporter,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { getActiveBrand } from '../../../../lib/brands';
import { effectiveAccess } from '../../../../lib/access';
import { canAccess, denyReason, FEATURES, roleAtLeast } from '../../../../lib/rbac';
import { jointureCreaDeLaMarque, vignetteAd } from '../../../../lib/adsmap-medias';
import { lireJourneesRetenues } from '../../../../lib/adsmap-mesures';

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
  | {
    ok: true; s: NonNullable<Awaited<ReturnType<typeof getSession>>>; marque: { id: string; nom: string }; admin: boolean; jarvis: boolean;
    /** La fonction `lots` de la matrice (liste complète, composer) · inchangée · sans elle, « Lots de test » ne montre que « À conclure ». */
    lots: boolean;
    /** Pourquoi la fonction `import` est fermée à cette personne (rôle, formule) · `null` ouverte · le geste « Importer les mesures du lot #n » de la fiche d'un lot. */
    refusImport: 'role' | 'plan' | null;
  }
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
  return { ok: true, s, marque: { id: brand.id, nom: brand.name }, admin: roleAtLeast(s.role, 'admin'), jarvis: canAccess(acces, feature('jarvis')), lots: canAccess(acces, feature('lots')), refusImport: denyReason(acces, feature('import')) };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/**
 * Une clé de l'agrégat, extraite en base en TEXTE JSON (`(agg->'spend')::text`) · relue ici comme
 * `chargerLots` lit l'agrégat entier · un nombre reste un nombre, une chaîne reste une chaîne (que
 * `num` écarte), quel que soit le pilote (aucun ne transforme du texte).
 */
const jsonLu = (t: string | null): unknown => {
  if (t == null) return null;
  try { return JSON.parse(t) as unknown; } catch { return null; }
};

export interface AdLue extends FaitsAdSpatial {
  lotId: string | null;
  concept: string;
  nomGenere: string | null;
  bande: 'low' | 'med' | 'high' | null;
  /** Hypothèse libre · sa provenance (`source_ref_json.hypotheseLibre`) · `null` pour une ad ordinaire. */
  origine: OrigineHypotheseLibre | null;
  /** L'estimation d'équipe (`ice_*`, 0068) · notes `null` tant qu'elles ne sont pas données. */
  estimation: EstimationHypothese;
  /** `ad_type` · `iteration` dit une itération d'une gagnante (bilan par provenance, `provenanceDuTest`). */
  typeAd: string;
  /** Provenance « Jarvis » (`source_ref_json.jarvis`, posée par le serveur après relecture) · `null` sans elle. */
  jarvis?: ProvenanceJarvis | null;
  /** Provenance « Commentaire » (`source_ref_json.commentaire`, posée par le serveur après relecture) · `null` sans elle. */
  commentaire?: ProvenanceCommentaire | null;
  /** Provenance « Note de la lignée » (`source_ref_json.note`, posée par le serveur après relecture) · `null` sans elle. */
  note?: ProvenanceNote | null;
}

export interface LotLu extends FaitsLotSpatial {
  ads: AdLue[];
  creeLe: string;
  /** `planned_end_at` (ISO) · `null` sans fin prévue · lue par la liste « Lot » de l'import (`casMesuresLot`). */
  finPrevue: string | null;
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

/**
 * La PORTÉE des ads lues pour les lots · la liste (`chargerLots`) et les comptes
 * du rail (`chargerFaitsRail`) la partagent · même espace, même
 * graphe (concept → angle → désir → persona → marque), même ordre, même borne ·
 * sinon la pastille et la liste pourraient voir deux ensembles de variantes.
 * L'ordre finit par l'identifiant · à la borne, les deux lectures retiennent
 * les MÊMES ads (un code de variante seul départage mal · « v1 » dans chaque lot).
 */
const LIMITE_ADS_LOTS = 2000;
const adsDeLaMarque = (workspaceId: string, brandId: string) => and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId));
const ORDRE_ADS_LOTS = [asc(schema.ads.variantCode), asc(schema.ads.id)] as const;
/** Le verdict tel que l'état d'un lot le lit · sa valeur, son statut, et l'instant de son dernier calcul (`computed_at` · une mesure arrêtée avant la fin de la fenêtre, `mesureArretee`). */
const verdictLu = (v: { status: string | null; computed: string | null; computedAt: Date | null }): Pick<FaitsVerdictSpatial, 'statut' | 'calcule' | 'calculeLe'> => ({
  calcule: (v.computed ?? null) as VerdictValue | null,
  statut: v.status === 'validated' ? 'validated' : 'computed',
  calculeLe: v.computedAt ? v.computedAt.toISOString() : null,
});

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
        sourceRef: schema.ads.sourceRef, iceImpact: schema.ads.iceImpact, iceConfidence: schema.ads.iceConfidence, iceEffort: schema.ads.iceEffort,
      },
      concept: schema.concepts.title, callout: schema.concepts.callout, prelaunch: schema.concepts.prelaunchScore,
      thumb: schema.creatives.thumbUrl, storage: schema.creatives.storageUrl,
      v: {
        computed: schema.verdicts.computed, validated: schema.verdicts.validated, status: schema.verdicts.status,
        comparable: schema.verdicts.comparable, agg: schema.verdicts.metricsAgg, adId: schema.verdicts.adId, computedAt: schema.verdicts.computedAt,
      },
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .leftJoin(schema.creatives, jointureCreaDeLaMarque(brandId))
      .where(adsDeLaMarque(workspaceId, brandId))
      .orderBy(...ORDRE_ADS_LOTS)
      .limit(LIMITE_ADS_LOTS),
    db.select({
      id: schema.batches.id, number: schema.batches.number, goal: schema.batches.goal, status: schema.batches.status,
      launchedAt: schema.batches.launchedAt, plannedEndAt: schema.batches.plannedEndAt, protocolCheck: schema.batches.protocolCheck, createdAt: schema.batches.createdAt,
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
      // Un objet du stockage privé passe par la route gardée de l'ad · jamais son adresse brute (image cassée, clé nommée).
      image: vignetteAd(r.ad.id, { miniature: r.thumb, fichier: r.storage, lien: r.ad.assetUrl }),
      manques: manquesAvantTest({ adType: r.ad.adType, hypothesis: r.ad.hypothesis, testedVariable: r.ad.testedVariable, offerId: r.ad.offerId, landingPageId: r.ad.landingPageId }),
      concept: r.concept,
      nomGenere: r.ad.generatedName,
      bande: bande === 'low' || bande === 'med' || bande === 'high' ? bande : null,
      origine: lireOrigineHypothese(r.ad.sourceRef),
      estimation: { impact: r.ad.iceImpact, confiance: r.ad.iceConfidence, effort: r.ad.iceEffort },
      typeAd: r.ad.adType,
      jarvis: lireProvenanceJarvis(r.ad.sourceRef),
      commentaire: lireProvenanceCommentaire(r.ad.sourceRef),
      note: lireProvenanceNote(r.ad.sourceRef),
      verdict: r.v?.adId ? {
        ...verdictLu(r.v),
        retenu: (r.v.validated ?? null) as VerdictValue | null,
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
        finPrevue: b.plannedEndAt ? (b.plannedEndAt as Date).toISOString() : null,
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

/** Un lot vu par les deux comptes du rail · ce que « à conclure » (`FaitsEtatLot`) et « à importer » (`FaitsLotAImporter`) lisent, son identité. */
export type LotRailLu = FaitsLotAImporter & { id: string; numero: number };

export interface FaitsRail { lots: LotRailLu[]; ctx: ContexteLots; seuil: SeuilMinimumMoteur }

/**
 * LA lecture des deux comptes du rail · « à conclure » (`compteAConclure`, la
 * pastille de Résultats, l'Accueil) et « à importer » (`compteAImporter`, la
 * pastille juste sous Résultats) lisaient les MÊMES variantes deux fois
 * (`chargerFaitsAConclure` de #1080, `chargerFaitsAImporter` de #1090) ·
 * elles n'en font plus qu'une, et la coquille la partage entre ses deux
 * pastilles (`PartageRail`, `lib/spatial/coquille.ts`). La MÊME portée que `chargerLots`
 * (lots de la marque, ads sous `adsDeLaMarque`), le même ordre
 * (`ORDRE_ADS_LOTS`, départagé par l'identifiant), la même borne
 * (`LIMITE_ADS_LOTS`) · par variante · son lot, son statut, sa plateforme, son
 * verdict (statut, valeur calculée) et les DEUX nombres de l'agrégat que le
 * minimum du moteur lit (dépense, impressions, extraits en base · le reste de
 * l'agrégat ne quitte pas la base) · par lot · son statut, son lancement, sa
 * fin prévue (`planned_end_at`, que « à importer » lit désormais). Les
 * réglages du verdict de la MARQUE (le seuil du moteur, la fenêtre). Les
 * règles restent au noyau.
 *
 * Coût mesuré · `MESURE_LECTURE_RAIL` plus bas.
 */
export async function chargerFaitsRail(workspaceId: string, brandId: string, maintenant = new Date()): Promise<FaitsRail> {
  if (!db) return { lots: [], ctx: { maintenant, fenetreJours: DEFAULT_VERDICT_CONFIG.evaluationWindowDays }, seuil: DEFAULT_VERDICT_CONFIG };
  const [lignes, lots, [vc]] = await Promise.all([
    db.select({
      lot: schema.ads.batchId, statut: schema.ads.status, plateforme: schema.ads.platform,
      adId: schema.verdicts.adId, status: schema.verdicts.status, computed: schema.verdicts.computed, computedAt: schema.verdicts.computedAt,
      depense: sql<string | null>`(${schema.verdicts.metricsAgg}->'spend')::text`, impressions: sql<string | null>`(${schema.verdicts.metricsAgg}->'impressions')::text`,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(adsDeLaMarque(workspaceId, brandId))
      .orderBy(...ORDRE_ADS_LOTS)
      .limit(LIMITE_ADS_LOTS),
    db.select({ id: schema.batches.id, numero: schema.batches.number, statut: schema.batches.status, lanceLe: schema.batches.launchedAt, finPrevue: schema.batches.plannedEndAt })
      .from(schema.batches).where(eq(schema.batches.brandId, brandId)).orderBy(desc(schema.batches.number)),
    db.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brandId)).limit(1),
  ]);
  const config: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((vc?.config as Partial<VerdictConfig>) ?? {}) };
  const parLot = new Map<string, LotRailLu['ads'][number][]>();
  for (const r of lignes) {
    if (!r.lot) continue;
    const v = {
      statut: r.statut, plateforme: r.plateforme,
      verdict: r.adId ? { ...verdictLu({ status: r.status, computed: r.computed, computedAt: r.computedAt as Date | null }), depense: num(jsonLu(r.depense)), impressions: num(jsonLu(r.impressions)) } : null,
    };
    const du = parLot.get(r.lot);
    if (du) du.push(v); else parLot.set(r.lot, [v]);
  }
  const iso = (d: unknown) => (d ? (d as Date).toISOString() : null);
  return {
    lots: lots.map((b) => ({ id: b.id, numero: b.numero, statut: b.statut, lanceLe: iso(b.lanceLe), finPrevue: iso(b.finPrevue), ads: parLot.get(b.id) ?? [] })),
    ctx: { maintenant, fenetreJours: config.evaluationWindowDays },
    seuil: config,
  };
}

/**
 * Le banc des lectures des comptes du rail (pglite, 4 cœurs partagés, médiane
 * de 15 lectures après 3 à vide, trois passages · comptes et lots identiques à
 * `chargerLots` + la règle à chaque passage).
 *
 * Historique · `MESURE_A_CONCLURE` (#1080) · la pastille de Résultats lisait
 * `chargerLots` (créa, concept, provenances, agrégats) sur CHAQUE page ·
 * 16 variantes 8,5 à 10,0 ms → 3,9 à 5,4 ms · 480 · 55 à 67 → 8,6 à 9,4 ms ·
 * 2 000 · 116 à 184 → 27 à 30 ms (`chargerFaitsAConclure`). `MESURE_A_IMPORTER`
 * (#1090) · `chargerLots` + la règle → `chargerFaitsAImporter` · 4,3 à 5,3 →
 * 2,7 à 3,4 ms · 16,9 à 18,2 → 7,6 à 8,0 ms · 73 à 100 → 39 à 45 ms (témoin
 * « à conclure » 2,5 à 2,7 · 5,5 à 5,6 · 18,6 à 19,2 ms). Les deux lectures
 * parcouraient les mêmes variantes, à chaque page, pour chaque admin.
 *
 * Ici · avant · les deux lectures de la coquille d'un admin (#1080 puis #1090,
 * telles que main les lançait, en parallèle) · après · `chargerFaitsRail`, UNE
 * fois, les deux comptes tirés d'elle · témoin · `chargerFaitsAConclure` de
 * #1080 seule (les deux lectures de main recopiées telles quelles dans le
 * banc, 04d6270b), mesurée dans le MÊME passage (la charge de la machine pèse sur
 * les trois colonnes à la fois). Semis · 8 lots × 2, 60 × 8, 250 × 8 (la
 * borne `LIMITE_ADS_LOTS` atteinte), variantes Meta diffusées, un verdict sur
 * trois sous le minimum du moteur, une variante sur quatre sans verdict, un
 * lot sur deux avec une fin prévue. Égalité vérifiée à chaque taille · mêmes
 * lots et mêmes variantes par lot que chacune des deux lectures de main et que
 * `chargerLots`, même compte « à conclure ».
 * Lecture · médianes 35 à 45 % sous les deux lectures (une requête de
 * variantes au lieu de deux) · 1,1 à 1,6 fois le témoin (sept colonnes par
 * variante au lieu de quatre, dont deux clés de l'agrégat extraites en base),
 * là où les deux lectures en coûtaient 2,0 à 2,7 fois.
 */
export const MESURE_LECTURE_RAIL = [
  { variantes: 16, avantMs: [6.3, 7.0, 9.9], apresMs: [3.4, 3.8, 5.3], temoinAConclureMs: [3.1, 3.3, 4.8] },
  { variantes: 480, avantMs: [17.2, 17.6, 19.3], apresMs: [10.2, 10.4, 10.6], temoinAConclureMs: [6.7, 7.0, 8.7] },
  { variantes: 2000, avantMs: [60.5, 62.0, 66.1], apresMs: [38.3, 41.0, 41.5], temoinAConclureMs: [23.3, 23.6, 25.8] },
] as const;

/**
 * Le partage de LA lecture entre les pastilles d'une même coquille · la
 * première pastille qui la demande la lance, la seconde attend la MÊME
 * promesse · une page, une lecture. Sans partage (l'Accueil), une lecture à soi.
 */
export interface PartageRail { faits?: Promise<FaitsRail> }

export function faitsRailPartages(workspaceId: string, brandId: string, maintenant = new Date(), partage?: PartageRail): Promise<FaitsRail> {
  if (!partage) return chargerFaitsRail(workspaceId, brandId, maintenant);
  return (partage.faits ??= chargerFaitsRail(workspaceId, brandId, maintenant));
}

/**
 * Ce que l'Accueil lit des états des lots · LE compte « à conclure »
 * (`compteAConclure`) ET les lots conclus (`idsLotsConclus` · toutes leurs
 * variantes arbitrées, écartés de « En diffusion » et de « fin prévue
 * passée ») · tirés de LA même lecture (`faitsRailPartages`).
 */
export async function lireEtatsAccueil(workspaceId: string, brandId: string, maintenant = new Date()): Promise<{ aConclure: CompteAConclure; conclus: Set<string> }> {
  const f = await faitsRailPartages(workspaceId, brandId, maintenant);
  return { aConclure: compteAConclure(f.lots, f.ctx), conclus: idsLotsConclus(f.lots, f.ctx) };
}

/** LE compte « à conclure » de la marque · la pastille du rail et l'Accueil le lisent ici (règle `compteAConclure`, inchangée). */
export async function compterAConclure(workspaceId: string, brandId: string, maintenant = new Date(), partage?: PartageRail): Promise<CompteAConclure> {
  const f = await faitsRailPartages(workspaceId, brandId, maintenant, partage);
  return compteAConclure(f.lots, f.ctx);
}

/** LE compte « à importer » de la marque · les lots dont les mesures MANQUENT (règle `compteAImporter` → `casMesuresLot`). */
export async function compterAImporter(workspaceId: string, brandId: string, maintenant = new Date(), partage?: PartageRail): Promise<CompteAImporter> {
  const f = await faitsRailPartages(workspaceId, brandId, maintenant, partage);
  return compteAImporter(f.lots, f.ctx, f.seuil);
}

/**
 * Les variantes d'UN lot, vues par le diagnostic « fin prévue passée »
 * (`diagnosticFinPrevue`) · statut, plateforme, verdict calculé et ce que son
 * agrégat dit (dépense, impressions) · et le minimum du moteur de la marque.
 * Même portée que la liste (`adsDeLaMarque` · espace ET graphe de la marque),
 * le lot de la marque · LECTURE SEULE, une seule ligne par variante. L'Accueil
 * ne l'appelle que pour le plus ancien lot à fin prévue passée.
 */
export async function chargerVariantesFinPrevue(workspaceId: string, brandId: string, lotId: string): Promise<{ variantes: VarianteFinPrevue[]; seuil: SeuilMinimumMoteur; fenetreJours: number }> {
  if (!db) return { variantes: [], seuil: DEFAULT_VERDICT_CONFIG, fenetreJours: DEFAULT_VERDICT_CONFIG.evaluationWindowDays };
  const [lignes, [vc]] = await Promise.all([
    db.select({ statut: schema.ads.status, plateforme: schema.ads.platform, adId: schema.verdicts.adId, computed: schema.verdicts.computed, status: schema.verdicts.status, computedAt: schema.verdicts.computedAt, agg: schema.verdicts.metricsAgg })
      .from(schema.ads)
      .innerJoin(schema.batches, and(eq(schema.batches.id, schema.ads.batchId), eq(schema.batches.brandId, brandId)))
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(adsDeLaMarque(workspaceId, brandId), eq(schema.ads.batchId, lotId)))
      .orderBy(...ORDRE_ADS_LOTS)
      .limit(LIMITE_ADS_LOTS),
    db.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brandId)).limit(1),
  ]);
  const config: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((vc?.config as Partial<VerdictConfig>) ?? {}) };
  return {
    variantes: lignes.map((r) => {
      const agg = (r.agg ?? {}) as Record<string, unknown>;
      return {
        statut: r.statut, plateforme: r.plateforme,
        verdict: r.adId ? { ...verdictLu({ status: r.status, computed: r.computed, computedAt: r.computedAt as Date | null }), impressions: num(agg.impressions), depense: num(agg.spend) } : null,
      };
    }),
    seuil: config,
    fenetreJours: config.evaluationWindowDays,
  };
}

/**
 * Les ads de la marque telles que la carte d'hypothèse les lit · le lot de
 * chacune avec son état présenté, son jour de diffusion et la conclusion du
 * lot ENTIER contre les autres lots de la marque (`conclusionLot`) · les ads
 * hors lot sans lot. Une seule lecture, partagée par la page Hypothèses et par
 * le résultat sous un commentaire ou une note (`lib/studios/resultat-fil.ts`) ·
 * rien n'est écrit.
 */
export function faitsHypotheses(d: DonneesLots): Array<FaitsHypotheseAd & { ad: AdLue }> {
  return [
    ...d.lots.flatMap((l) => {
      const p = presentationLot(l, d.ctx);
      const conclusion = conclusionLot(l, p.etat, referenceConclusion(d.lots, l.id));
      return l.ads.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, origine: a.origine, estimation: a.estimation, lot: { id: l.id, numero: l.numero, etat: p.etat, jour: p.etat === 'diffusion' ? p.jour : null, conclusion } }));
    }),
    ...d.horsLot.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, origine: a.origine, estimation: a.estimation, lot: null })),
  ];
}

/** La mesure Meta de la marque · connexion (sans rien déchiffrer) et date de la dernière synchro. */
export async function chargerConnexion(brandId: string): Promise<{ metaConnecte: boolean; mesureLe: string | null }> {
  if (!db) return { metaConnecte: false, mesureLe: null };
  const [b] = await db.select({ compte: schema.brands.metaAdAccountId, jeton: schema.brands.metaToken, le: schema.brands.adsmapSyncedAt })
    .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  return { metaConnecte: !!b?.compte && !!b?.jeton, mesureLe: b?.le ? (b.le as Date).toISOString() : null };
}

/**
 * La somme des journées RETENUES des annonces de la marque, pour chaque période
 * `[depuis, jusqua[` · la connexion Meta d'abord, l'export ensuite
 * (`lireJourneesRetenues`, la lecture partagée avec les verdicts et l'Accueil).
 * Une seule lecture couvre toutes les périodes (la période et la précédente).
 */
export async function chargerMesures(brandId: string, periodes: ReadonlyArray<readonly [Date, Date]>): Promise<AgregatMesures[]> {
  const vide = (): AgregatMesures => ({ depense: 0, impressions: 0, vues3s: 0, achats: 0, ventes: 0, importees: 0 });
  if (!db || !periodes.length) return periodes.map(vide);
  const jour = (d: Date) => d.toISOString().slice(0, 10);
  const veille = (d: Date) => jour(new Date(d.getTime() - 86_400_000));
  const du = periodes.reduce((m, [a]) => (jour(a) < m ? jour(a) : m), jour(periodes[0]![0]));
  const au = periodes.reduce((m, [, b]) => (veille(b) > m ? veille(b) : m), veille(periodes[0]![1]));
  const lu = await lireJourneesRetenues(brandId, { du, au });
  return periodes.map(([a, b]) => sommeRetenues(lu.entrees, jour(a), veille(b)));
}

export interface ApprentissageLu {
  id: string; adId: string | null; enonce: string; statut: string; refute: boolean; source: string | null; creeLe: string;
  /** `scope`, `confidence` · le « Vaut pour » et la confiance déclarée du tiroir. */
  portee: string; confiance: number;
  /** `evidence.regle.le` · quand il est passé dans les règles de la marque · `null` sinon. */
  versRegles: string | null;
}

/** Les apprentissages de la marque, les plus récents d'abord. */
export async function chargerApprentissages(workspaceId: string, brandId: string): Promise<ApprentissageLu[]> {
  if (!db) return [];
  const rows = await db.select({
    id: schema.learnings.id, adId: schema.learnings.adId, statement: schema.learnings.statement, status: schema.learnings.status,
    refuted: schema.learnings.refuted, evidence: schema.learnings.evidence, createdAt: schema.learnings.createdAt,
    scope: schema.learnings.scope, confidence: schema.learnings.confidence,
  }).from(schema.learnings)
    .where(and(eq(schema.learnings.workspaceId, workspaceId), eq(schema.learnings.brandId, brandId)))
    .orderBy(desc(schema.learnings.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id, adId: r.adId, enonce: r.statement, statut: r.status, refute: r.refuted,
    source: typeof (r.evidence as { source?: unknown } | null)?.source === 'string' ? (r.evidence as { source: string }).source : null,
    creeLe: (r.createdAt as Date).toISOString(),
    portee: r.scope, confiance: r.confidence,
    versRegles: typeof (r.evidence as { regle?: { le?: unknown } } | null)?.regle?.le === 'string' ? (r.evidence as { regle: { le: string } }).regle.le : null,
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le NOM de ce que chaque décision concerne (test, lot, concept, angle, désir),
 * lu dans la marque active · clé `kind:id`. Lecture seule. Une cible hors de la
 * marque, supprimée ou mal formée n'a pas d'entrée · l'écran le dit.
 */
export async function chargerCiblesDecisions(workspaceId: string, brandId: string, cibles: ReadonlyArray<{ kind: string; id: string }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!db) return out;
  const ids = (k: string) => [...new Set(cibles.filter((c) => c.kind === k && UUID.test(c.id)).map((c) => c.id))];
  const [ads, lots, concepts, angles, desirs] = [ids('ad'), ids('batch'), ids('concept'), ids('angle'), ids('desire')];
  const dansLaMarque = and(eq(schema.personas.brandId, brandId), eq(schema.desires.workspaceId, workspaceId));
  await Promise.all([
    ads.length && db.select({ id: schema.ads.id, code: schema.ads.variantCode, titre: schema.concepts.title }).from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id)).innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.ads.id, ads), dansLaMarque))
      .then((r) => r.forEach((x) => out.set(`ad:${x.id}`, `${x.code} · ${x.titre}`))),
    lots.length && db.select({ id: schema.batches.id, n: schema.batches.number, but: schema.batches.goal }).from(schema.batches)
      .where(and(inArray(schema.batches.id, lots), eq(schema.batches.brandId, brandId)))
      .then((r) => r.forEach((x) => out.set(`batch:${x.id}`, `#${x.n}${x.but?.trim() ? ` · ${x.but.trim()}` : ''}`))),
    concepts.length && db.select({ id: schema.concepts.id, l: schema.concepts.title }).from(schema.concepts)
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id)).innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.concepts.id, concepts), dansLaMarque))
      .then((r) => r.forEach((x) => out.set(`concept:${x.id}`, x.l))),
    angles.length && db.select({ id: schema.angles.id, l: schema.angles.label }).from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.angles.id, angles), dansLaMarque))
      .then((r) => r.forEach((x) => out.set(`angle:${x.id}`, x.l))),
    desirs.length && db.select({ id: schema.desires.id, l: schema.desires.label }).from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.desires.id, desirs), dansLaMarque))
      .then((r) => r.forEach((x) => out.set(`desire:${x.id}`, x.l))),
  ]);
  return out;
}
