'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { analyzeAdAsset } from '@tiktrends/ai';
import { normalizeAnalysis, summarizeAnalysis, costFor, type AssetAnalysis } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { reserveCredits, refundCredits, unlimitedCredits } from '../../lib/credits';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { guardedAnthropic } from '../../lib/spend-guard';

/**
 * ADSMAP · agent A0, analyse d'asset (§8.2).
 *
 * La mémoire de Jarvis lit `hookType`, `openingType`, `talent` et la tranche de
 * durée depuis la table `creatives`. Ces colonnes existent depuis le début et
 * sont vides · c'est exactement ce qui sépare « le mécanisme listicle marche
 * ici » de « les accroches chiffrées gagnent 3 fois sur 8 tests concluants ».
 *
 * L'agent DÉCRIT, il ne juge pas. Le jugement appartient au moteur de verdict,
 * sur des chiffres · confondre les deux ferait rentrer l'opinion par la fenêtre
 * au moment précis où le module cherche à s'en passer.
 *
 * Trois précautions traversent le fichier :
 *
 *  - **on ne réanalyse pas ce qu'un humain a corrigé.** `analysisModel` à `manuel`
 *    protège une saisie humaine d'un passage de l'agent.
 *  - **on n'écrase pas une valeur connue par un `null`.** Un modèle qui ne sait
 *    pas ne doit pas effacer ce qu'on savait.
 *  - **on rembourse quand l'analyse ne produit rien.** Un appel sans matière
 *    n'est pas un service rendu.
 */

const ACTION = 'asset_analysis' as const;
/** Au-delà, un lot d'analyse devient long et cher · on borne et on le dit. */
const MAX_LOT = 25;

interface Sujet {
  adId: string;
  creativeId: string | null;
  assetUrl: string | null;
  format: string;
  transcript: string | null;
  ocrText: string | null;
  durationS: number | null;
  copy: string | null;
  analysisModel: string | null;
}

/** Écrit l'analyse sans jamais effacer ce qu'on savait déjà. */
async function persist(creativeId: string, a: AssetAnalysis, modele: string): Promise<void> {
  // `?? undefined` et non `?? null` : dans Drizzle, `undefined` laisse la colonne
  // intacte là où `null` l'efface. La nuance décide si un modèle hésitant détruit
  // une donnée acquise.
  await db!.update(schema.creatives).set({
    hookType: a.hookType ?? undefined,
    openingType: a.openingType ?? undefined,
    talent: a.talent ?? undefined,
    durationS: a.durationS ?? undefined,
    productFirstSec: a.productFirstSec ?? undefined,
    ctaFirstSec: a.ctaFirstSec ?? undefined,
    cutsFirst10s: a.cutsFirst10s ?? undefined,
    hasCaptions: a.hasCaptions ?? undefined,
    analysis: {
      hookSpoken: a.hookSpoken, claims: a.claims, proofElements: a.proofElements,
      unmapped: a.unmapped, summary: summarizeAnalysis(a),
    },
    analysisModel: modele,
    analysisConfidence: a.confidence,
    analyzedAt: new Date(),
  }).where(eq(schema.creatives.id, creativeId));
}

/**
 * Garantit la créa porteuse · même raison qu'à la synchro : `creatives` est la
 * table des assets, et une ad de la carte peut ne pas encore en avoir.
 */
async function ensureCreative(sujet: Sujet, brandId: string): Promise<string | null> {
  if (sujet.creativeId) return sujet.creativeId;
  const type = sujet.format.startsWith('video') ? 'video' : sujet.format === 'image_carousel' ? 'carousel' : 'image';
  const [c] = await db!.insert(schema.creatives).values({
    brandId, fingerprintHash: `adsmap:${sujet.adId}`, type,
  }).returning({ id: schema.creatives.id });
  if (!c) return null;
  await db!.update(schema.ads).set({ creativeId: c.id }).where(eq(schema.ads.id, sujet.adId));
  return c.id;
}

async function load(workspaceId: string, brandId: string, adIds?: string[]): Promise<Sujet[]> {
  const conds = [eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)];
  if (adIds?.length) conds.push(inArray(schema.ads.id, adIds));

  const rows = await db!.select({
    adId: schema.ads.id, creativeId: schema.ads.creativeId, assetUrl: schema.ads.assetUrl,
    format: schema.ads.format, hypothesis: schema.ads.hypothesis,
    transcript: schema.creatives.transcript, ocrText: schema.creatives.ocrText,
    durationS: schema.creatives.durationS, analysisModel: schema.creatives.analysisModel,
    valueBlock: schema.concepts.valueBlock, callout: schema.concepts.callout,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
    .where(and(...conds))
    .limit(MAX_LOT * 4);

  return rows.map((r) => ({
    adId: r.adId, creativeId: r.creativeId, assetUrl: r.assetUrl, format: r.format,
    transcript: [r.transcript, r.ocrText].filter(Boolean).join('\n') || null,
    ocrText: r.ocrText, durationS: r.durationS, analysisModel: r.analysisModel,
    copy: [r.callout, r.valueBlock].filter(Boolean).join('\n') || null,
  }));
}

export interface AnalyzeResult {
  analyzed?: number;
  /** Ads laissées de côté, avec la raison · on ne fait pas semblant d'avoir tout traité. */
  skipped?: Array<{ adId: string; reason: string }>;
  summary?: string;
  error?: string;
}

/**
 * Analyse les ads d'une marque qui n'ont pas encore de description.
 *
 * `adIds` cible des ads précises ; sans lui, on prend celles qui n'ont jamais été
 * analysées, dans la limite du lot. Les crédits sont réservés PAR ad analysée,
 * après avoir écarté celles qui n'ont pas de matière · réserver d'abord et
 * rembourser ensuite ferait payer une file d'attente.
 */
export async function analyzeAssetsAction(adIds?: string[]): Promise<AnalyzeResult> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  const client = guardedAnthropic({ action: 'adsmap-analyze' });
  if (!client) return { error: 'L’IA n’est pas configurée sur le serveur.' };

  try {
    let sujets = await load(g.s.workspaceId, g.brand.id, adIds);
    if (!adIds?.length) {
      // Sans cible explicite, on ne repasse pas sur ce qui est déjà décrit.
      sujets = sujets.filter((s) => !s.analysisModel);
    }
    // Une saisie humaine ne se fait pas écraser par un passage de l'agent.
    const protegees = sujets.filter((s) => s.analysisModel === 'manuel');
    sujets = sujets.filter((s) => s.analysisModel !== 'manuel');

    const skipped: Array<{ adId: string; reason: string }> = protegees.map((s) => ({
      adId: s.adId, reason: 'Description corrigée à la main · l’agent ne la remplace pas.',
    }));

    // Sans image ni texte, un modèle remplit quand même le formulaire · et ces
    // valeurs entreraient dans les statistiques comme si elles étaient observées.
    const sansMatiere = sujets.filter((s) => !s.assetUrl && !s.transcript && !s.copy);
    for (const s of sansMatiere) skipped.push({ adId: s.adId, reason: 'Ni visuel ni texte · rien à décrire.' });
    sujets = sujets.filter((s) => s.assetUrl || s.transcript || s.copy).slice(0, MAX_LOT);

    if (!sujets.length) {
      return {
        analyzed: 0, skipped,
        summary: skipped.length
          ? `Rien à analyser · ${skipped.length} ad(s) écartée(s), le détail est ci-dessous.`
          : 'Toutes les ads de cette marque sont déjà décrites.',
      };
    }

    const gratuit = unlimitedCredits(g.s.user.email);
    const cout = costFor(ACTION, 1);
    let analyzed = 0;

    for (const s of sujets) {
      if (!gratuit && !(await reserveCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:${s.adId}`))) {
        skipped.push({ adId: s.adId, reason: 'Crédits insuffisants · recharge pour continuer.' });
        break;
      }
      try {
        const brut = await analyzeAdAsset(client, {
          imageUrl: s.assetUrl, transcript: s.transcript, copy: s.copy,
          knownDurationS: s.durationS, format: s.format,
        });
        if (!brut) {
          // Aucun service rendu · on ne facture pas.
          if (!gratuit) await refundCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:vide:${s.adId}`);
          skipped.push({ adId: s.adId, reason: 'L’agent n’a rien pu décrire à partir de cet asset.' });
          continue;
        }
        const creativeId = await ensureCreative(s, g.brand.id);
        if (!creativeId) {
          if (!gratuit) await refundCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:echec:${s.adId}`);
          skipped.push({ adId: s.adId, reason: 'Impossible de rattacher l’analyse à un asset.' });
          continue;
        }
        await persist(creativeId, normalizeAnalysis(brut), process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5');
        analyzed++;
      } catch (e) {
        if (!gratuit) await refundCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:erreur:${s.adId}`);
        skipped.push({
          adId: s.adId,
          reason: logAndTranslate('adsmap:analyze-one', e, { subject: 'l’analyse de cet asset', workspaceId: g.s.workspaceId }),
        });
      }
    }

    if (analyzed) invalidateJarvisMemory(g.brand.id);

    const parts = [`${analyzed} ad(s) décrite(s)`];
    if (skipped.length) parts.push(`${skipped.length} écartée(s)`);
    return {
      analyzed, skipped,
      summary: parts.join(' · ') + '.' + (analyzed ? ' La mémoire de Jarvis s’enrichit d’autant.' : ''),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:analyze', e, { subject: 'l’analyse des assets', workspaceId: g.s.workspaceId }) };
  }
}

export interface AnalysisCoverage { total: number; described: number; manual: number; withoutAsset: number }

/**
 * Où en est la description du catalogue.
 *
 * Affiché parce qu'une statistique calculée sur trois ads décrites sur cent est
 * une statistique fausse · la couverture dit à quel point on peut s'y fier.
 */
export async function analysisCoverageAction(): Promise<{ coverage?: AnalysisCoverage; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    const rows = await db!.select({
      adId: schema.ads.id, assetUrl: schema.ads.assetUrl,
      model: schema.creatives.analysisModel, transcript: schema.creatives.transcript,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
      .where(and(eq(schema.ads.workspaceId, g.s.workspaceId), eq(schema.personas.brandId, g.brand.id)));

    return {
      coverage: {
        total: rows.length,
        described: rows.filter((r) => !!r.model).length,
        manual: rows.filter((r) => r.model === 'manuel').length,
        withoutAsset: rows.filter((r) => !r.assetUrl && !r.transcript).length,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:coverage', e, { subject: 'la couverture d’analyse', workspaceId: g.s.workspaceId }) };
  }
}
