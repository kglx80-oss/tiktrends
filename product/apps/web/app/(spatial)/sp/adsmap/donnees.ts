import 'server-only';
import { redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  DEFAULT_VERDICT_CONFIG, conclusionLot, manquesAvantTest, etatLotSpatial, presentationLot, referenceConclusion, lireOrigineHypothese, lireProvenanceJarvis, lireProvenanceCommentaire, lireProvenanceNote, sommeRetenues,
  type EstimationHypothese, type OrigineHypotheseLibre, type ProvenanceJarvis, type ProvenanceCommentaire, type ProvenanceNote, type VerdictConfig, type VerdictValue, type FaitsAdSpatial, type FaitsLotSpatial, type ContexteLots, type AgregatMesures,
  type FaitsHypotheseAd,
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
  return { ok: true, s, marque: { id: brand.id, nom: brand.name }, admin: roleAtLeast(s.role, 'admin'), jarvis: canAccess(acces, feature('jarvis')), lots: canAccess(acces, feature('lots')) };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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
        sourceRef: schema.ads.sourceRef, iceImpact: schema.ads.iceImpact, iceConfidence: schema.ads.iceConfidence, iceEffort: schema.ads.iceEffort,
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
      .leftJoin(schema.creatives, jointureCreaDeLaMarque(brandId))
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
