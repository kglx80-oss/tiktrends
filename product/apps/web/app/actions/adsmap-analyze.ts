'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { analyzeAdAsset } from '@tiktrends/ai';
import {
  normalizeAnalysis, summarizeAnalysis, costFor,
  usableImageUrl, isSharePage, writtenDossier, sourceTag, sourceOf, estimateAnalysisCost,
  WRITTEN_CONFIDENCE_CAP,
  type AssetAnalysis, type AnalysisSource,
} from '@tiktrends/core';
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
  /** Lien tel qu'il est en base · peut mener à une page, pas à un fichier. */
  assetUrl: string | null;
  /** Le même, seulement s'il peut réellement être ouvert comme une image. */
  imageUrl: string | null;
  format: string;
  transcript: string | null;
  ocrText: string | null;
  durationS: number | null;
  copy: string | null;
  /** Ce que le brief écrit dit de cette ad · le repli quand l'asset manque. */
  dossier: string | null;
  analysisModel: string | null;
}

/** Écrit l'analyse sans jamais effacer ce qu'on savait déjà. */
async function persist(creativeId: string, a: AssetAnalysis, modele: string, source: AnalysisSource): Promise<void> {
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
      source,
    },
    analysisModel: sourceTag(modele, source),
    // Le brief dit ce qu'on VOULAIT faire, l'asset dit ce qui a été fait ·
    // l'écart entre les deux est ce qui fait rater un test. Une description
    // écrite ne peut donc pas revendiquer la même certitude, même si le modèle
    // se dit sûr de lui.
    analysisConfidence: source === 'written' ? Math.min(a.confidence, WRITTEN_CONFIDENCE_CAP) : a.confidence,
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
    conceptTitle: schema.concepts.title, mechanism: schema.angles.mechanism,
    testedVariable: schema.ads.testedVariable, variableValue: schema.ads.variableValue,
    adType: schema.ads.adType,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
    .where(and(...conds))
    .limit(MAX_LOT * 4);

  // Les apprentissages validés sur ces ads · ce qu'on a retenu APRÈS coup est
  // souvent la phrase la plus descriptive du dossier.
  const ids = rows.map((r) => r.adId);
  const appris = ids.length
    ? await db!.select({ adId: schema.learnings.adId, statement: schema.learnings.statement })
        .from(schema.learnings)
        .where(and(
          inArray(schema.learnings.adId, ids),
          eq(schema.learnings.status, 'validated'),
          eq(schema.learnings.refuted, false),
        ))
    : [];
  const parAd = new Map<string, string[]>();
  for (const a of appris) {
    if (!a.adId) continue;
    parAd.set(a.adId, [...(parAd.get(a.adId) ?? []), a.statement]);
  }

  return rows.map((r) => ({
    adId: r.adId, creativeId: r.creativeId, assetUrl: r.assetUrl,
    imageUrl: usableImageUrl(r.assetUrl),
    format: r.format,
    transcript: [r.transcript, r.ocrText].filter(Boolean).join('\n') || null,
    ocrText: r.ocrText, durationS: r.durationS, analysisModel: r.analysisModel,
    copy: [r.callout, r.valueBlock].filter(Boolean).join('\n') || null,
    dossier: writtenDossier({
      conceptTitle: r.conceptTitle, hypothesis: r.hypothesis,
      testedVariable: r.testedVariable, variableValue: r.variableValue,
      mechanism: r.mechanism, callout: r.callout, valueBlock: r.valueBlock,
      format: r.format, adType: r.adType, learnings: parAd.get(r.adId),
    }),
  }));
}

export interface AnalyzeResult {
  analyzed?: number;
  /** Décrites à partir du brief seul · confiance plafonnée, et on le dit. */
  fromWritten?: number;
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

    // Sans image NI matière écrite, un modèle remplit quand même le formulaire ·
    // et ces valeurs entreraient dans les statistiques comme si elles avaient
    // été observées.
    const aDeQuoi = (s: Sujet) => !!(s.imageUrl || s.transcript || s.copy || s.dossier);
    for (const s of sujets.filter((x) => !aDeQuoi(x))) {
      skipped.push({
        adId: s.adId,
        reason: isSharePage(s.assetUrl)
          ? 'Le lien mène à une page de partage, pas à un fichier · et le brief est trop vide pour décrire à sa place.'
          : 'Ni visuel ni texte · rien à décrire.',
      });
    }
    sujets = sujets.filter(aDeQuoi).slice(0, MAX_LOT);

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
    let depuisTexte = 0;

    for (const s of sujets) {
      if (!gratuit && !(await reserveCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:${s.adId}`))) {
        skipped.push({ adId: s.adId, reason: 'Crédits insuffisants · recharge pour continuer.' });
        break;
      }
      try {
        // On tente l'asset quand il est ouvrable, et on retombe sur le brief
        // écrit s'il ne l'est pas · un lien mort ne doit pas coûter une
        // dimension entière de la mémoire.
        let source: AnalysisSource = s.imageUrl ? 'asset' : 'written';
        let brut = await analyzeAdAsset(client, {
          imageUrl: s.imageUrl, transcript: s.transcript,
          copy: s.imageUrl ? s.copy : (s.dossier ?? s.copy),
          knownDurationS: s.durationS, format: s.format,
        }).catch(async (e) => {
          // L'adresse paraissait bonne et ne l'était pas · le repli existe
          // précisément pour ces cas-là, et il vaut mieux qu'un échec.
          if (!s.imageUrl || !s.dossier) throw e;
          console.warn('[adsmap:analyze] asset injoignable, repli sur le brief', s.adId);
          source = 'written';
          return analyzeAdAsset(client, {
            imageUrl: null, transcript: s.transcript, copy: s.dossier,
            knownDurationS: s.durationS, format: s.format,
          });
        });

        // Une image ouverte mais muette · le brief peut encore dire quelque chose.
        if (!brut && source === 'asset' && s.dossier) {
          source = 'written';
          brut = await analyzeAdAsset(client, {
            imageUrl: null, transcript: s.transcript, copy: s.dossier,
            knownDurationS: s.durationS, format: s.format,
          });
        }

        if (!brut) {
          // Aucun service rendu · on ne facture pas.
          if (!gratuit) await refundCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:vide:${s.adId}`);
          skipped.push({ adId: s.adId, reason: 'L’agent n’a rien pu décrire, ni de l’asset ni du brief.' });
          continue;
        }
        const creativeId = await ensureCreative(s, g.brand.id);
        if (!creativeId) {
          if (!gratuit) await refundCredits(g.s.workspaceId, cout, `adsmap:asset_analysis:echec:${s.adId}`);
          skipped.push({ adId: s.adId, reason: 'Impossible de rattacher l’analyse à un asset.' });
          continue;
        }
        await persist(creativeId, normalizeAnalysis(brut), process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5', source);
        analyzed++;
        if (source === 'written') depuisTexte++;
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
    // La provenance se dit · une dimension déduite d'un brief ne vaut pas une
    // dimension lue sur la vidéo, et l'ignorer ferait décider sur du sable.
    if (depuisTexte) parts.push(`dont ${depuisTexte} depuis le brief écrit, faute d’asset ouvrable`);
    if (skipped.length) parts.push(`${skipped.length} écartée(s)`);
    return {
      analyzed, skipped, fromWritten: depuisTexte,
      summary: parts.join(' · ') + '.' + (analyzed ? ' La mémoire de Jarvis s’enrichit d’autant.' : ''),
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:analyze', e, { subject: 'l’analyse des assets', workspaceId: g.s.workspaceId }) };
  }
}

export interface AnalysisCoverage {
  total: number;
  described: number;
  manual: number;
  withoutAsset: number;
  /** Décrites à partir du brief seul · la mémoire doit savoir d'où elle tient ce qu'elle sait. */
  fromWritten: number;
  /** Restant à décrire, réparti par ce qu'on pourra réellement lire. */
  pendingAsset: number;
  pendingWritten: number;
  /** Ce que coûterait la PROCHAINE tranche · le lot est borné, la facture aussi. */
  nextBatch: number;
  nextCostUsd: number;
  /** Ce que coûterait la totalité · le chiffre qu'on veut voir avant de s'engager. */
  totalCostUsd: number;
}

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
      hypothesis: schema.ads.hypothesis, conceptTitle: schema.concepts.title,
      callout: schema.concepts.callout, valueBlock: schema.concepts.valueBlock,
      mechanism: schema.angles.mechanism, testedVariable: schema.ads.testedVariable,
      variableValue: schema.ads.variableValue, adType: schema.ads.adType,
    })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .leftJoin(schema.creatives, eq(schema.ads.creativeId, schema.creatives.id))
      .where(and(eq(schema.ads.workspaceId, g.s.workspaceId), eq(schema.personas.brandId, g.brand.id)));

    // Ce qui reste à faire, réparti par ce qu'on pourra RÉELLEMENT lire · un
    // décompte qui promettrait de décrire des liens Drive annoncerait un travail
    // qui n'aura pas lieu.
    const restantes = rows.filter((r) => !r.model);
    const dossierDe = (r: typeof rows[number]) => writtenDossier({
      conceptTitle: r.conceptTitle, hypothesis: r.hypothesis, callout: r.callout,
      valueBlock: r.valueBlock, mechanism: r.mechanism, testedVariable: r.testedVariable,
      variableValue: r.variableValue, adType: r.adType,
    });
    const parAsset = restantes.filter((r) => !!usableImageUrl(r.assetUrl));
    const parTexte = restantes.filter((r) => !usableImageUrl(r.assetUrl) && (!!r.transcript || !!dossierDe(r)));

    // La prochaine tranche est bornée par MAX_LOT · c'est ce plafond qui rend la
    // facture prévisible, et c'est donc lui qu'on chiffre.
    const tranche = [...parAsset, ...parTexte].slice(0, MAX_LOT);
    const trancheAsset = tranche.filter((r) => !!usableImageUrl(r.assetUrl)).length;

    return {
      coverage: {
        total: rows.length,
        described: rows.filter((r) => !!r.model).length,
        manual: rows.filter((r) => r.model === 'manuel').length,
        withoutAsset: rows.filter((r) => !r.assetUrl && !r.transcript).length,
        fromWritten: rows.filter((r) => sourceOf(r.model) === 'written').length,
        pendingAsset: parAsset.length,
        pendingWritten: parTexte.length,
        nextBatch: tranche.length,
        nextCostUsd: estimateAnalysisCost(trancheAsset, tranche.length - trancheAsset),
        totalCostUsd: estimateAnalysisCost(parAsset.length, parTexte.length),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:coverage', e, { subject: 'la couverture d’analyse', workspaceId: g.s.workspaceId }) };
  }
}
