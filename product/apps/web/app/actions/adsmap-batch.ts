'use server';

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  buildUniqueNames, checkAdReady, formatViolations, resolveCampaignName,
  DEFAULT_VERDICT_CONFIG, type VerdictConfig, type AdShape,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { briefConceptBeforeLaunch } from '../../lib/jarvis-memory';

/**
 * ADSMAP · préparation d'un lot de test (§6.1, §6.2, §8.6).
 *
 * Tout le module savait juger un lot APRÈS coup : contrôle de protocole, verdicts
 * dégradés quand la comparaison ne tient pas. Rien ne permettait d'en préparer un.
 * Le maillon manquait au début de la chaîne, pas à la fin · le rattachement
 * quotidien des métriques repose sur un nom d'annonce que personne n'avait
 * d'endroit pour poser.
 *
 * Cet écran fait trois choses, et refuse tout le reste :
 *
 *  1. Il dit ce qui manque à chaque ad pour être lançable (invariant §2.4). C'est
 *     `checkAdReady`, écrit il y a longtemps et jamais appelé jusqu'ici.
 *  2. Il génère les noms attendus côté régie, relisibles par le parser · c'est ce
 *     qui rend les métriques rattachables sans saisie d'identifiant.
 *  3. Il rappelle le protocole à respecter AVANT de dépenser, pas après.
 *
 * Il ne crée rien dans Meta. Créer des campagnes par API demanderait une
 * permission d'écriture sur le compte publicitaire du client · un brief à
 * recopier coûte deux minutes et n'engage personne.
 */

const DEFAULT_PATTERN = '{brand}_B{batch}_{concept}_{variant}_{variable}';
const DEFAULT_CAMPAIGN = '[ADSMAP] TEST {brand} B{batch}';

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export interface BatchAd {
  id: string;
  concept: string;
  variantCode: string;
  status: string;
  format: string;
  testedVariable: string | null;
  hypothesis: string | null;
  /** Ce qui manque pour lancer · null quand l'ad est prête. */
  blocking: string | null;
  /** Nom attendu côté régie · vide tant que le lot n'a pas été préparé. */
  generatedName: string | null;
  /** Nom d'ad set proposé · un ad set par ad, c'est le protocole par défaut. */
  adsetName: string;
  /**
   * Ce que les trois mémoires disent de cette ad AVANT qu'elle coûte.
   *
   * C'est le dernier moment où l'avis sert à quelque chose : après le
   * lancement, il ne reste qu'à constater.
   */
  prelaunch?: { recommendation: string; summary: string } | null;
}

export interface BatchDetail {
  id: string;
  number: number;
  goal: string | null;
  status: string;
  launchedAt: string | null;
  ads: BatchAd[];
  /** Le brief à recopier dans le gestionnaire de publicités. */
  brief: {
    campaignName: string;
    structure: string;
    dailyBudgetPerAd: number;
    durationDays: number;
    audienceRule: string;
    /** Budget total engagé si le lot part tel quel · le chiffre qui fait réfléchir. */
    totalBudget: number;
    /** Ce que le lot pourra conclure, compte tenu des seuils de la marque. */
    conclusiveness: string;
  };
  /** Résumé du dernier contrôle de protocole, s'il a déjà tourné. */
  protocolSummary: string | null;
}

async function settings(brandId: string) {
  const [[p], [v], [b]] = await Promise.all([
    db!.select().from(schema.testProtocols).where(eq(schema.testProtocols.brandId, brandId)).limit(1),
    db!.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brandId)).limit(1),
    db!.select({ np: schema.brands.namingPattern }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1),
  ]);
  const verdict: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((v?.config as Partial<VerdictConfig>) ?? {}) };
  return {
    protocol: {
      structure: p?.structure ?? 'abo_one_adset_per_ad',
      dailyBudgetPerAd: p?.dailyBudgetPerAd ?? 20,
      durationDays: p?.durationDays ?? 7,
      audienceRule: p?.audienceRule ?? 'broad, même audience pour toutes les ads du lot',
      campaignNamePattern: p?.campaignNamePattern ?? DEFAULT_CAMPAIGN,
    },
    verdict,
    namingPattern: b?.np ?? DEFAULT_PATTERN,
  };
}

const STRUCTURE_LABEL: Record<string, string> = {
  abo_one_adset_per_ad: 'ABO · un ad set par annonce',
  abo_single_adset: 'ABO · un seul ad set',
  cbo_tolerated: 'CBO toléré (verdicts relatifs seulement)',
};

/**
 * Ce que le lot pourra conclure, avant qu'un euro soit dépensé.
 *
 * C'est le calcul qu'on ne fait jamais et qui coûte le plus cher : un lot dont
 * le budget ne permet pas d'atteindre le seuil de conclusion produira sept jours
 * plus tard une colonne entière de « non concluant ». Autant le savoir avant.
 */
function conclusiveness(budgetParAd: number, jours: number, cfg: VerdictConfig): string {
  const requis = cfg.minSpendMultiple * cfg.targetCpa;
  const prevu = budgetParAd * jours;
  if (prevu >= requis) {
    return `Chaque ad atteindra ${Math.round(prevu)} € sur ${jours} jours, au-dessus des ${Math.round(requis)} € nécessaires pour conclure sur le CPA.`;
  }
  const jourMin = Math.ceil(requis / Math.max(1, budgetParAd));
  const budgetMin = Math.ceil(requis / Math.max(1, jours));
  return `Attention · à ${budgetParAd} €/jour sur ${jours} jours, chaque ad n’atteindra que ${Math.round(prevu)} € alors qu’il en faut ${Math.round(requis)} pour conclure. Passe à ${budgetMin} €/jour, ou à ${jourMin} jours.`;
}

/** Fiche d'un lot · tout ce qu'il faut pour le lancer, en un aller-retour. */
export async function batchDetailAction(batchId: string): Promise<{ detail?: BatchDetail; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const [b] = await db!.select().from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.brandId, g.brand.id))).limit(1);
    if (!b) return { error: 'Lot introuvable sur cette marque.' };

    const cfg = await settings(g.brand.id);
    const rows = await db!.select({
      ad: schema.ads, concept: schema.concepts.title,
      callout: schema.concepts.callout, mechanism: schema.angles.mechanism,
    })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .where(eq(schema.ads.batchId, batchId))
      .orderBy(asc(schema.ads.variantCode));

    // L'avis de pré-lancement, ad par ad · réclamé en parallèle parce qu'il lit
    // trois mémoires et qu'un lot de dix ads le paierait dix fois en série.
    const avis = await Promise.all(rows.map((r) =>
      briefConceptBeforeLaunch(g.brand.id, g.s.workspaceId, {
        mechanism: r.mechanism ?? null,
        format: r.ad.format,
        candidateHook: r.callout || r.concept || null,
      }).catch(() => null)));

    const ads: BatchAd[] = rows.map((r, i) => {
      // On évalue l'invariant comme si l'ad passait en « prêt » · c'est le sens
      // de la question posée à cet écran, même quand elle est encore brouillon.
      const shape: AdShape = {
        status: 'ready',
        adType: r.ad.adType,
        hypothesis: r.ad.hypothesis,
        testedVariable: r.ad.testedVariable,
        offerId: r.ad.offerId,
        landingPageId: r.ad.landingPageId,
      };
      return {
        id: r.ad.id,
        concept: r.concept ?? '—',
        variantCode: r.ad.variantCode,
        status: r.ad.status,
        format: r.ad.format,
        testedVariable: r.ad.testedVariable,
        hypothesis: r.ad.hypothesis,
        blocking: formatViolations(checkAdReady(shape)),
        generatedName: r.ad.generatedName,
        adsetName: `B${b.number} · ${r.ad.variantCode}`,
        prelaunch: avis[i] ? { recommendation: avis[i]!.recommendation, summary: avis[i]!.summary } : null,
      };
    });

    const proto = (b.protocolCheck ?? null) as { summary?: string } | null;

    return {
      detail: {
        id: b.id, number: b.number, goal: b.goal, status: b.status,
        launchedAt: b.launchedAt ? (b.launchedAt as Date).toISOString() : null,
        ads,
        brief: {
          campaignName: resolveCampaignName(cfg.protocol.campaignNamePattern, g.brand.name, b.number),
          structure: STRUCTURE_LABEL[cfg.protocol.structure] ?? cfg.protocol.structure,
          dailyBudgetPerAd: cfg.protocol.dailyBudgetPerAd,
          durationDays: cfg.protocol.durationDays,
          audienceRule: cfg.protocol.audienceRule,
          totalBudget: cfg.protocol.dailyBudgetPerAd * cfg.protocol.durationDays * ads.length,
          conclusiveness: conclusiveness(cfg.protocol.dailyBudgetPerAd, cfg.protocol.durationDays, cfg.verdict),
        },
        protocolSummary: proto?.summary ?? null,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:batch-detail', e, { subject: 'la lecture du lot', workspaceId: g.s.workspaceId }) };
  }
}

export interface CandidateAd { id: string; concept: string; variantCode: string; status: string; blocking: string | null }

/** Les ads qui n'appartiennent à aucun lot · le vivier dans lequel on compose. */
export async function candidatesAction(): Promise<{ rows?: CandidateAd[]; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    const rows = await db!.select({ ad: schema.ads, concept: schema.concepts.title })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(
        eq(schema.personas.brandId, g.brand.id),
        isNull(schema.ads.batchId),
        inArray(schema.ads.status, ['draft', 'proposed', 'ready']),
      ))
      .orderBy(desc(schema.ads.createdAt))
      .limit(200);

    return {
      rows: rows.map((r) => ({
        id: r.ad.id, concept: r.concept, variantCode: r.ad.variantCode, status: r.ad.status,
        blocking: formatViolations(checkAdReady({
          status: 'ready', adType: r.ad.adType, hypothesis: r.ad.hypothesis,
          testedVariable: r.ad.testedVariable, offerId: r.ad.offerId, landingPageId: r.ad.landingPageId,
        })),
      })),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:candidates', e, { subject: 'la lecture des ads disponibles', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Écriture                                                                  */
/* -------------------------------------------------------------------------- */

/** Ouvre un lot · le numéro suit celui de la marque, il n'est pas saisi. */
export async function createBatchAction(goal: string): Promise<{ id?: string; number?: number; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    const [dernier] = await db!.select({ n: sql<number>`coalesce(max(${schema.batches.number}), 0)` })
      .from(schema.batches).where(eq(schema.batches.brandId, g.brand.id));
    const numero = Number(dernier?.n ?? 0) + 1;

    const [row] = await db!.insert(schema.batches).values({
      workspaceId: g.s.workspaceId, brandId: g.brand.id, number: numero,
      authorId: g.s.user.id, goal: goal.trim().slice(0, 300) || null, status: 'planned',
    }).returning({ id: schema.batches.id });
    if (!row) return { error: 'Création impossible.' };
    return { id: row.id, number: numero };
  } catch (e) {
    return { error: logAndTranslate('adsmap:batch-create', e, { subject: 'la création du lot', workspaceId: g.s.workspaceId }) };
  }
}

/** Range ou retire une ad d'un lot · rien d'autre ne change. */
export async function setBatchAdAction(input: { batchId: string; adId: string; inBatch: boolean }): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    const [b] = await db!.select({ id: schema.batches.id, status: schema.batches.status }).from(schema.batches)
      .where(and(eq(schema.batches.id, input.batchId), eq(schema.batches.brandId, g.brand.id))).limit(1);
    if (!b) return { error: 'Lot introuvable sur cette marque.' };
    // Un lot en test ou analysé est un témoin : y ajouter une ad en cours de route
    // rendrait les dépenses incomparables, donc les verdicts faux.
    if (b.status === 'testing' || b.status === 'analyzed') {
      return { error: 'Ce lot est déjà lancé · y ajouter une ad maintenant rendrait les dépenses incomparables. Ouvre le lot suivant.' };
    }

    await db!.update(schema.ads)
      .set({ batchId: input.inBatch ? input.batchId : null, updatedAt: new Date() })
      .where(and(eq(schema.ads.id, input.adId), eq(schema.ads.workspaceId, g.s.workspaceId)));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:batch-assign', e, { subject: 'la composition du lot', workspaceId: g.s.workspaceId }) };
  }
}

export interface PrepareResult {
  named?: number;
  /** Ads laissées en arrière · avec la raison, ad par ad. */
  skipped?: Array<{ variantCode: string; reason: string }>;
  ready?: number;
  error?: string;
}

/**
 * Prépare le lot : génère les noms, passe en « prêt » ce qui peut l'être.
 *
 * Le nom est généré pour TOUTES les ads du lot, y compris celles qui ne sont pas
 * encore prêtes · c'est un identifiant, pas une récompense, et le préparer tôt
 * évite d'avoir à repasser. Le passage en `ready`, lui, respecte strictement
 * l'invariant §2.4 : une ad sans hypothèse, sans variable, sans offre ou sans
 * page de destination reste en brouillon, et l'écran dit laquelle et pourquoi.
 */
export async function prepareBatchAction(batchId: string): Promise<PrepareResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  try {
    const [b] = await db!.select().from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.brandId, g.brand.id))).limit(1);
    if (!b) return { error: 'Lot introuvable sur cette marque.' };

    const cfg = await settings(g.brand.id);
    const rows = await db!.select({ ad: schema.ads, concept: schema.concepts.title })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .where(eq(schema.ads.batchId, batchId));
    if (!rows.length) return { error: 'Ce lot ne contient aucune ad · ajoute-en avant de le préparer.' };

    const skipped: Array<{ variantCode: string; reason: string }> = [];
    let named = 0;
    let ready = 0;

    // Les noms se génèrent pour le lot ENTIER, pas ad par ad : l'unicité est une
    // propriété de l'ensemble. Deux concepts de même titre sous deux angles
    // différents produiraient sinon le même nom, et les deux ads resteraient
    // sans mesure · `matchByName` refuse de trancher une ambiguïté, à raison.
    const noms = buildUniqueNames(cfg.namingPattern, rows.map((r) => ({
      brand: g.brand.name,
      batch: b.number,
      concept: r.concept ?? 'concept',
      variant: r.ad.variantCode,
      variable: r.ad.testedVariable ?? 'controle',
    })));

    for (const [i, r] of rows.entries()) {
      const nom = noms[i]!;

      const manque = formatViolations(checkAdReady({
        status: 'ready', adType: r.ad.adType, hypothesis: r.ad.hypothesis,
        testedVariable: r.ad.testedVariable, offerId: r.ad.offerId, landingPageId: r.ad.landingPageId,
      }));

      // Une ad déjà en test ne repasse pas par « prêt » · on se contente du nom.
      const lancable = !manque && (r.ad.status === 'draft' || r.ad.status === 'proposed' || r.ad.status === 'ready');
      await db!.update(schema.ads)
        .set({ generatedName: nom, ...(lancable ? { status: 'ready' as const } : {}), updatedAt: new Date() })
        .where(eq(schema.ads.id, r.ad.id));

      named++;
      if (manque) skipped.push({ variantCode: r.ad.variantCode, reason: manque });
      else if (lancable) ready++;
    }

    // Le lot passe en « prêt » seulement si TOUTES ses ads le sont : un lot à
    // moitié prêt lancé quand même donne des dépenses inégales, donc des verdicts
    // incomparables · c'est exactement ce que le protocole cherche à éviter.
    if (!skipped.length && b.status === 'planned') {
      await db!.update(schema.batches).set({ status: 'ready' }).where(eq(schema.batches.id, batchId));
    }

    return { named, ready, skipped };
  } catch (e) {
    return { error: logAndTranslate('adsmap:batch-prepare', e, { subject: 'la préparation du lot', workspaceId: g.s.workspaceId }) };
  }
}

/** Marque le lot comme lancé · date de départ des fenêtres d'évaluation. */
export async function launchBatchAction(batchId: string): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    const [b] = await db!.select({ id: schema.batches.id, status: schema.batches.status }).from(schema.batches)
      .where(and(eq(schema.batches.id, batchId), eq(schema.batches.brandId, g.brand.id))).limit(1);
    if (!b) return { error: 'Lot introuvable sur cette marque.' };

    const rows = await db!.select({ id: schema.ads.id, status: schema.ads.status })
      .from(schema.ads).where(eq(schema.ads.batchId, batchId));
    if (!rows.length) return { error: 'Ce lot ne contient aucune ad.' };
    const pasPretes = rows.filter((r) => r.status !== 'ready' && r.status !== 'live');
    if (pasPretes.length) {
      return { error: `${pasPretes.length} ad(s) ne sont pas prêtes · prépare le lot d’abord, il dira ce qui manque à chacune.` };
    }

    const maintenant = new Date();
    await db!.update(schema.ads)
      .set({ status: 'live', launchedAt: maintenant, updatedAt: maintenant })
      .where(and(eq(schema.ads.batchId, batchId), eq(schema.ads.status, 'ready')));
    await db!.update(schema.batches)
      .set({ status: 'testing', launchedAt: maintenant })
      .where(eq(schema.batches.id, batchId));

    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:batch-launch', e, { subject: 'le lancement du lot', workspaceId: g.s.workspaceId }) };
  }
}
