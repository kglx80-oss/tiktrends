'use server';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  toCsv, COL_HYPOTHESIS, SHEET_STATUS, SHEET_VERDICT, SHEET_STAGE, SHEET_VARIABLE, SHEET_FORMAT, SHEET_AD_TYPE,
  sheetDate, sheetNumber, type SheetRow,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { runAdsMapSyncForBrand } from '../../lib/adsmap-sync';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';

/**
 * ADSMAP · lecture du graphe pour la vue Table et l'export.
 *
 * La vue Table est volontairement livrée avant le canvas : elle valide tout le
 * modèle de données (filiation, verdicts, invariants) sans dépendre du rendu, et
 * c'est elle qui porte la compatibilité descendante avec le tableur.
 */

/** Une ligne de la vue Table · déjà résolue en libellés lisibles. */
export interface AdRow {
  id: string;
  status: string;
  batchNumber: number | null;
  author: string | null;
  concept: string;
  /** Sert la passerelle ADSMAP → Studio · null si le concept a été supprimé. */
  conceptId: string | null;
  desire: string | null;
  angle: string | null;
  iterationReason: string | null;   // « Itération HOOK depuis v1 »
  hypothesis: string | null;
  format: string;
  adType: string;
  briefUrl: string | null;
  assetUrl: string | null;
  variantCode: string;
  testedVariable: string | null;
  platform: string;
  launchedAt: string | null;
  // Calculé
  verdict: string | null;
  comparable: boolean | null;
  failedStage: string | null;
  killFlag: string | null;
  cpa: number | null;
  cpaHi: number | null;
  spend: number | null;
  purchases: number | null;
  learnings: string[];
  legacyFlags: string[];
}

export interface AdFilters {
  batchId?: string;
  status?: string;
  verdict?: string;
  comparableOnly?: boolean;
}

const guard = adsmapGuard;

/**
 * Lit les ads de la marque active avec tout leur contexte (concept, angle, désir,
 * persona, batch, verdict, filiation, apprentissages) en un nombre borné de
 * requêtes · pas de N+1 sur une table qui a vocation à dépasser le millier de lignes.
 */
export async function listAdsAction(filters: AdFilters = {}): Promise<{ rows?: AdRow[]; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  try {
    const conds = [eq(schema.ads.workspaceId, g.s.workspaceId)];
    if (filters.batchId) conds.push(eq(schema.ads.batchId, filters.batchId));
    if (filters.status) conds.push(eq(schema.ads.status, filters.status as typeof schema.ads.$inferSelect.status));

    // Une seule requête pour la hiérarchie : ad -> concept -> angle -> désir -> persona.
    const base = await db!.select({
      ad: schema.ads,
      conceptTitle: schema.concepts.title,
      angleLabel: schema.angles.label,
      desireLabel: schema.desires.label,
      batchNumber: schema.batches.number,
      authorName: schema.users.name,
      authorEmail: schema.users.email,
      verdict: schema.verdicts,
    })
      .from(schema.ads)
      .leftJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .leftJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .leftJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
      .leftJoin(schema.users, eq(schema.batches.authorId, schema.users.id))
      .leftJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id))
      .where(and(...conds))
      .orderBy(desc(schema.ads.createdAt))
      .limit(1000);

    if (!base.length) return { rows: [] };
    const ids = base.map((r) => r.ad.id);

    // Filiation et apprentissages : deux requêtes groupées, pas une par ligne.
    const [edges, apprentissages] = await Promise.all([
      db!.select({
        childAdId: schema.iterationEdges.childAdId,
        changedVariable: schema.iterationEdges.changedVariable,
        mode: schema.iterationEdges.mode,
        parentVariant: schema.ads.variantCode,
      })
        .from(schema.iterationEdges)
        .leftJoin(schema.ads, eq(schema.iterationEdges.parentAdId, schema.ads.id))
        .where(inArray(schema.iterationEdges.childAdId, ids)),
      db!.select({ adId: schema.learnings.adId, statement: schema.learnings.statement })
        .from(schema.learnings)
        .where(and(inArray(schema.learnings.adId, ids), eq(schema.learnings.status, 'validated'))),
    ]);

    const edgeBy = new Map(edges.map((e) => [e.childAdId, e]));
    const learnBy = new Map<string, string[]>();
    for (const l of apprentissages) {
      if (!l.adId) continue;
      learnBy.set(l.adId, [...(learnBy.get(l.adId) ?? []), l.statement]);
    }

    let rows: AdRow[] = base.map((r) => {
      const e = edgeBy.get(r.ad.id);
      const agg = (r.verdict?.metricsAgg ?? null) as { cpa?: number; cpaHi?: number; spend?: number; purchases?: number } | null;
      return {
        id: r.ad.id,
        status: r.ad.status,
        batchNumber: r.batchNumber ?? null,
        author: r.authorName || r.authorEmail || null,
        concept: r.conceptTitle ?? '(concept supprimé)',
        conceptId: r.ad.conceptId ?? null,
        desire: r.desireLabel ?? null,
        angle: r.angleLabel ?? null,
        iterationReason: e ? `${SHEET_VARIABLE[e.changedVariable] ?? e.changedVariable} depuis ${e.parentVariant ?? 'parent'}` : null,
        hypothesis: r.ad.hypothesis,
        format: r.ad.format,
        adType: r.ad.adType,
        briefUrl: r.ad.briefUrl,
        assetUrl: r.ad.assetUrl,
        variantCode: r.ad.variantCode,
        testedVariable: r.ad.testedVariable,
        platform: r.ad.platform,
        launchedAt: r.ad.launchedAt ? (r.ad.launchedAt as Date).toISOString() : null,
        verdict: r.verdict?.validated ?? r.verdict?.computed ?? null,
        comparable: r.verdict?.comparable ?? null,
        failedStage: r.verdict?.failedStage ?? null,
        killFlag: r.verdict?.killFlag ?? null,
        cpa: agg?.cpa ?? null,
        cpaHi: agg?.cpaHi ?? null,
        spend: agg?.spend ?? null,
        purchases: agg?.purchases ?? null,
        learnings: learnBy.get(r.ad.id) ?? [],
        legacyFlags: r.ad.legacyFlags ?? [],
      };
    });

    // Filtres qui portent sur des colonnes calculées.
    if (filters.verdict) rows = rows.filter((r) => r.verdict === filters.verdict);
    if (filters.comparableOnly) rows = rows.filter((r) => r.comparable === true);

    return { rows };
  } catch (e) {
    return { error: logAndTranslate('adsmap:list', e, { subject: 'la lecture du tableau', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Export CSV aux 19 colonnes du Sheet d'origine, colonnes calculées en option.
 * Renvoie le contenu · l'écriture du fichier se fait côté navigateur, ce qui
 * évite un aller-retour de stockage pour un fichier éphémère.
 */
export async function exportAdsCsvAction(filters: AdFilters = {}, withComputed = true): Promise<{ csv?: string; filename?: string; error?: string }> {
  const g = await guard();
  if ('error' in g) return { error: g.error };

  const res = await listAdsAction(filters);
  if (res.error) return { error: res.error };

  const rows: SheetRow[] = (res.rows ?? []).map((r) => ({
    'Status': SHEET_STATUS[r.status] ?? r.status,
    'BATCH #': r.batchNumber ?? '',
    'Autheur': r.author ?? '',
    'Ad Concept': r.concept,
    '📎 Désire': r.desire ?? '',
    '📎 Angle(s)': r.angle ?? '',
    "Motif d'Iteration": r.iterationReason ?? '',
    [COL_HYPOTHESIS]: r.hypothesis ?? '',
    'Ad Format': SHEET_FORMAT[r.format] ?? r.format,
    'Ad Type': SHEET_AD_TYPE[r.adType] ?? r.adType,
    'Lien du Brief créa': r.briefUrl ?? '',
    "Lien de l'Ad": r.assetUrl ?? '',
    'Résultats': r.verdict ? (SHEET_VERDICT[r.verdict] ?? r.verdict) : '',
    'Apprentissages': r.learnings.join(' · '),
    'Ad Variable': r.testedVariable ? (SHEET_VARIABLE[r.testedVariable] ?? r.testedVariable) : '',
    'Test Result': r.verdict ? (SHEET_VERDICT[r.verdict] ?? r.verdict) : '',
    'Learnings': r.learnings.join(' · '),
    'Date de lancement': sheetDate(r.launchedAt),
    'Plateforme': r.platform === 'meta' ? 'Meta' : 'TikTok',
    // Colonnes ADSMAP, après les 19.
    'Verdict calculé': r.verdict ? (SHEET_VERDICT[r.verdict] ?? r.verdict) : '',
    'Comparable': r.comparable === null ? '' : r.comparable ? 'Oui' : 'Non',
    'CPA': sheetNumber(r.cpa),
    'CPA borne haute': sheetNumber(r.cpaHi),
    'Étape défaillante': r.failedStage ? (SHEET_STAGE[r.failedStage] ?? r.failedStage) : '',
    'Signal de coupe': r.killFlag ? (SHEET_STAGE[r.killFlag] ?? r.killFlag) : '',
    'Variante': r.variantCode,
    'Parent': r.iterationReason ?? '',
    'Dépense': sheetNumber(r.spend),
    'Achats': r.purchases ?? '',
  }));

  const jour = new Date().toISOString().slice(0, 10);
  return {
    csv: toCsv(rows, { withComputed }),
    filename: `adsmap_${g.brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${jour}.csv`,
  };
}

/** Lots de la marque active · alimente le filtre et l'en-tête de la vue Table. */
export async function listBatchesAction(): Promise<Array<{ id: string; number: number; status: string; goal: string | null; ads: number }>> {
  const g = await guard();
  if ('error' in g) return [];
  const rows = await db!.select({
    id: schema.batches.id, number: schema.batches.number, status: schema.batches.status,
    goal: schema.batches.goal, ads: sql<number>`count(${schema.ads.id})`,
  })
    .from(schema.batches)
    .leftJoin(schema.ads, eq(schema.ads.batchId, schema.batches.id))
    .where(eq(schema.batches.brandId, g.brand.id))
    .groupBy(schema.batches.id)
    .orderBy(desc(schema.batches.number));
  return rows.map((r) => ({ ...r, ads: Number(r.ads) }));
}

export interface SyncResult {
  ok?: true;
  /** Une phrase qui dit ce qui s'est passé, y compris quand il ne s'est rien passé. */
  summary?: string;
  unmatched?: number;
  error?: string;
}

/**
 * Mesure la carte de la marque active, à la demande.
 *
 * Le job nocturne suffit au régime de croisière, mais pas au lancement d'un lot :
 * on ne demande pas à quelqu'un qui vient de mettre trois ads en ligne d'attendre
 * demain matin pour savoir si le rattachement a fonctionné.
 *
 * Réservé aux admins · l'appel consomme du quota d'API sur un compte publicitaire.
 */
export async function syncAdsMapAction(): Promise<SyncResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  try {
    const r = await runAdsMapSyncForBrand(g.brand.id);
    invalidateJarvisMemory(g.brand.id);

    if (!r.adsMatched && !r.adsUnmatched) {
      return { ok: true, summary: 'Aucune ad en test dans la carte · passe une ad en « En test » pour qu’elle soit mesurée.' };
    }
    if (!r.adsMatched) {
      return {
        ok: true, unmatched: r.adsUnmatched,
        summary: `Aucune des ${r.adsUnmatched} ad(s) en test n’a pu être reliée à une annonce du compte. Vérifie le nom généré, ou colle l’identifiant Meta sur l’ad.`,
      };
    }
    const parts = [
      `${r.adsMatched} ad(s) rattachée(s)`,
      `${r.daysIngested} journée(s) de données`,
      r.batchesChecked ? `${r.batchesChecked} lot(s) contrôlé(s)` : null,
      `${r.verdicts} verdict(s) recalculé(s)`,
    ].filter(Boolean);
    const reste = r.adsUnmatched ? ` · ${r.adsUnmatched} ad(s) non rattachée(s).` : '';
    return { ok: true, unmatched: r.adsUnmatched, summary: parts.join(' · ') + '.' + reste };
  } catch (e) {
    if ((e as Error).message === 'meta_not_connected') {
      return { error: 'Le compte publicitaire Meta n’est pas connecté pour cette marque · va dans Connexions.' };
    }
    return { error: logAndTranslate('adsmap:sync', e, { subject: 'la mesure de la carte', workspaceId: g.s.workspaceId }) };
  }
}
