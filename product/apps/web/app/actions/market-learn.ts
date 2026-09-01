'use server';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { MARKET_COLS, toMarketAd } from '../../lib/market-rows';
import { analyzeAdAsset } from '@tiktrends/ai';
import { ttSearchAds, ttGetTranscript, ttTranscriptSupported, type InspoAd } from '@tiktrends/integrations';
import {
  normalizeAnalysis, summarizeAnalysis, costFor,
  computeMarketStats, contrastMarketVsBrand, summarizeMarket,
  type MarketAd, type MarketRow, type Contrast, type BrandRow,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { reserveCredits, refundCredits, unlimitedCredits } from '../../lib/credits';
import { guardedAnthropic } from '../../lib/spend-guard';
import { jarvisStats, invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { GUARD } from '../../lib/guard-error';

/**
 * Faire apprendre Jarvis des meilleures créas du marché.
 *
 * La veille rapportait jusqu'ici un texte et une vignette. Jarvis en tirait des
 * « patterns » : de l'opinion sur des mots. Or l'agent A0 sait déjà décrire une
 * créa — accroche, ouverture, présence à l'écran, promesses, preuves — dans une
 * taxonomie fermée, et il n'était appliqué qu'à NOS pubs.
 *
 * Ce fichier le retourne vers l'extérieur. Même agent, même taxonomie, mais
 * appliqué aux concurrents · c'est ce qui rend les deux mémoires COMPARABLES, et
 * c'est toute la valeur : « le marché ouvre sur un visage qui parle, toi tu
 * gagnes avec le produit en main » est une décision, là où chaque moitié prise
 * seule n'est qu'une donnée.
 *
 * ── Une prudence qui gouverne tout le fichier ────────────────────────────────
 *
 * On ne connaît AUCUN chiffre de performance des concurrents. Le seul signal
 * disponible est la persistance : une pub qui tourne encore après trois semaines
 * est une pub que son annonceur continue de payer. C'est un proxy, jamais une
 * mesure · le vocabulaire dit « éprouvée », jamais « gagnante », et le bloc
 * injecté dans les prompts le rappelle au modèle en toutes lettres.
 */

const ACTION = 'asset_analysis' as const;
/** Au-delà, un lot devient long et cher · on borne et on le dit. */
const MAX_LOT = 20;

/* -------------------------------------------------------------------------- */
/*  Analyse                                                                   */
/* -------------------------------------------------------------------------- */

export interface LearnResult {
  analyzed?: number;
  skipped?: Array<{ id: string; reason: string }>;
  summary?: string;
  error?: string;
}

const bucket = (sec: number | null): string | null => {
  if (sec === null || !Number.isFinite(sec)) return null;
  if (sec < 10) return '<10s';
  if (sec < 15) return '10-15s';
  if (sec < 30) return '15-30s';
  if (sec < 60) return '30-60s';
  return '>60s';
};

/**
 * Décrit un lot de créas concurrentes et les range.
 *
 * `ads` vient de la veille · on ne redemande rien à la source, on décrit ce qui
 * est déjà sous les yeux. Les créas déjà décrites sont sautées : les redécrire
 * coûterait sans rien apprendre, et fausserait les parts si le doublon passait.
 */
async function analyseLot(
  ads: InspoAd[], ctx: { workspaceId: string; brandId: string; email: string },
): Promise<LearnResult> {
  const client = guardedAnthropic({ workspaceId: ctx.workspaceId, action: 'market-learn' });
  if (!client) return { error: GUARD.aiOff() };

  const skipped: LearnResult['skipped'] = [];

  // Déjà décrites · la clé unique les protégerait, mais autant ne pas payer.
  const ids = ads.map((a) => a.id);
  const connues = ids.length
    ? await db!.select({ externalId: schema.marketCreatives.externalId })
        .from(schema.marketCreatives)
        .where(and(
          eq(schema.marketCreatives.workspaceId, ctx.workspaceId),
          inArray(schema.marketCreatives.externalId, ids),
        ))
    : [];
  const dejaVues = new Set(connues.map((c) => c.externalId));

  let candidats = ads.filter((a) => {
    if (dejaVues.has(a.id)) { skipped.push({ id: a.id, reason: 'Déjà décrite.' }); return false; }
    // Sans visuel NI texte, un modèle remplit quand même le formulaire · ces
    // valeurs entreraient dans les parts comme si elles avaient été observées.
    if (!a.thumbnailUrl && !a.mediaUrl && !a.body) {
      skipped.push({ id: a.id, reason: 'Ni visuel ni texte · rien à décrire.' });
      return false;
    }
    return true;
  });
  candidats = candidats.slice(0, MAX_LOT);

  if (!candidats.length) {
    return {
      analyzed: 0, skipped,
      summary: skipped.length ? `Rien de nouveau à décrire · ${skipped.length} créa(s) écartée(s).` : 'Aucune créa à décrire.',
    };
  }

  const gratuit = unlimitedCredits(ctx.email);
  const cout = costFor(ACTION, 1);
  let analyzed = 0;

  const apiKey = process.env.TRENDTRACK_API_KEY;

  for (const a of candidats) {
    if (!gratuit && !(await reserveCredits(ctx.workspaceId, cout, `market:analyze:${a.id}`))) {
      skipped.push({ id: a.id, reason: 'Crédits insuffisants · recharge pour continuer.' });
      break;
    }
    try {
      // La transcription change la nature de l'analyse : sans elle, A0 DEVINE
      // l'accroche depuis une vignette ; avec elle, il lit les mots prononcés.
      // Elle reste facultative · `ttGetTranscript` ne lève jamais et rend null
      // quand l'endpoint n'existe pas, l'analyse se dégrade au lieu de casser.
      const transcript = apiKey && ttTranscriptSupported()
        ? await ttGetTranscript({ apiKey }, a.id)
        : null;

      const brut = await analyzeAdAsset(client, {
        imageUrl: a.thumbnailUrl || a.mediaUrl || null,
        transcript,
        copy: a.body || null,
        format: a.mediaType || null,
      });
      if (!brut) {
        if (!gratuit) await refundCredits(ctx.workspaceId, cout, `market:analyze:vide:${a.id}`);
        skipped.push({ id: a.id, reason: 'L’agent n’a rien pu décrire.' });
        continue;
      }
      const n = normalizeAnalysis(brut);
      await db!.insert(schema.marketCreatives).values({
        workspaceId: ctx.workspaceId, brandId: ctx.brandId,
        platform: a.platform, externalId: a.id,
        advertiser: a.advertiserName ?? null,
        daysRunning: a.daysRunning ?? 0,
        reachDelta30d: a.reachDelta30d ?? null,
        liveAdsCount: a.liveAdsCount ?? null,
        format: a.mediaType ?? null,
        hookType: n.hookType, openingType: n.openingType, talent: n.talent,
        lengthBucket: bucket(n.durationS),
        analysis: {
          hookSpoken: n.hookSpoken, claims: n.claims, proofElements: n.proofElements,
          unmapped: n.unmapped, summary: summarizeAnalysis(n),
        },
        analysisConfidence: n.confidence,
        analyzedAt: new Date(),
      }).onConflictDoNothing();
      analyzed++;
    } catch (e) {
      if (!gratuit) await refundCredits(ctx.workspaceId, cout, `market:analyze:erreur:${a.id}`);
      skipped.push({
        id: a.id,
        reason: logAndTranslate('market:analyze-one', e, { subject: 'l’analyse de cette créa', workspaceId: ctx.workspaceId }),
      });
    }
  }

  if (analyzed) invalidateJarvisMemory(ctx.brandId);
  const parts = [`${analyzed} créa(s) concurrente(s) décrite(s)`];
  if (skipped.length) parts.push(`${skipped.length} écartée(s)`);
  // On dit quand les accroches sont devinées plutôt que lues · la différence de
  // fiabilité est trop grande pour rester implicite.
  if (analyzed && !ttTranscriptSupported()) {
    parts.push('sans transcription · les accroches sont déduites du visuel et du texte, pas des mots prononcés');
  }
  return { analyzed, skipped, summary: parts.join(' · ') + '.' };
}

/** Décrit des créas déjà sous les yeux · appelé depuis la Veille. */
export async function learnFromAdsAction(ads: InspoAd[]): Promise<LearnResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  if (!Array.isArray(ads) || !ads.length) return { error: 'Aucune créa transmise.' };

  try {
    return await analyseLot(ads.slice(0, MAX_LOT * 2), {
      workspaceId: g.s.workspaceId, brandId: g.brand.id, email: g.s.user.email,
    });
  } catch (e) {
    return { error: logAndTranslate('market:learn', e, { subject: 'l’apprentissage marché', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Va chercher les créas qui TIENNENT chez les marques suivies, puis les décrit.
 *
 * On trie par ancienneté de diffusion et non par nouveauté : ce qui vient de
 * sortir n'apprend rien, c'est ce qui dure qui porte le signal.
 */
export async function learnFromFollowedAction(): Promise<LearnResult> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!apiKey) return { error: 'La source de veille n’est pas configurée sur le serveur.' };

  try {
    const suivies = await db!.select({ name: schema.followedBrands.name })
      .from(schema.followedBrands)
      .where(and(
        eq(schema.followedBrands.workspaceId, g.s.workspaceId),
        eq(schema.followedBrands.platform, 'meta'),
      ))
      .limit(6);
    if (!suivies.length) {
      return { error: 'Aucune marque suivie · suis des concurrents depuis la Veille, puis relance.' };
    }

    const lots = await Promise.all(suivies.map((b) =>
      ttSearchAds({ apiKey }, {
        search: b.name, searchIn: 'brand', status: 'all',
        sortBy: 'longestRunning', order: 'desc', limit: 8, offset: 0,
      }).then((r) => r.ads).catch(() => [] as InspoAd[])));

    const ads = lots.flat();
    if (!ads.length) return { error: 'La source n’a rien renvoyé pour les marques suivies.' };

    return await analyseLot(ads, {
      workspaceId: g.s.workspaceId, brandId: g.brand.id, email: g.s.user.email,
    });
  } catch (e) {
    return { error: logAndTranslate('market:learn-followed', e, { subject: 'la lecture des marques suivies', workspaceId: g.s.workspaceId }) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                   */
/* -------------------------------------------------------------------------- */

export interface MarketView {
  rows: MarketRow[];
  contrasts: Contrast[];
  sampleSize: number;
  provenSize: number;
  advertisers: number;
  summary: string;
}

/** Lit les créas concurrentes décrites et en tire les parts de marché. */
export async function marketViewAction(): Promise<{ view?: MarketView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    // Même projection que la mémoire de Jarvis · deux définitions auraient fini
    // par donner deux chiffres de marché différents selon l'écran ouvert.
    const rows = await db!.select(MARKET_COLS).from(schema.marketCreatives)
      .where(and(
        eq(schema.marketCreatives.workspaceId, g.s.workspaceId),
        eq(schema.marketCreatives.brandId, g.brand.id),
      ))
      .orderBy(desc(schema.marketCreatives.analyzedAt))
      .limit(600);

    const ads: MarketAd[] = rows.map(toMarketAd);

    const marche = computeMarketStats(ads);

    // La confrontation n'a de sens qu'avec nos propres chiffres · c'est la même
    // source que le tableau de Jarvis, pas une seconde définition.
    const { stats, globalRate } = await jarvisStats(g.brand.id, g.s.workspaceId);
    const brandRows: BrandRow[] = stats.map((s) => ({
      dimension: s.dimension, key: s.key, hitRate: s.hitRate, nConclusive: s.nConclusive,
    }));
    const contrasts = contrastMarketVsBrand(marche, brandRows, globalRate);

    return {
      view: {
        rows: marche, contrasts,
        sampleSize: ads.length,
        provenSize: ads.filter((a) => a.daysRunning >= 21 || (a.reachDelta30d ?? 0) > 0).length,
        advertisers: new Set(ads.map((a) => a.advertiser).filter(Boolean)).size,
        summary: summarizeMarket(marche, contrasts, ads.length),
      },
    };
  } catch (e) {
    return { error: logAndTranslate('market:view', e, { subject: 'la lecture du marché', workspaceId: g.s.workspaceId }) };
  }
}

/** Combien de créas concurrentes sont décrites · sert les bandeaux. */
export async function marketCoverageAction(): Promise<{ described: number; advertisers: number }> {
  const g = await adsmapGuard();
  if ('error' in g) return { described: 0, advertisers: 0 };
  try {
    const [row] = await db!.select({
      n: sql<number>`count(*)`,
      a: sql<number>`count(distinct ${schema.marketCreatives.advertiser})`,
    })
      .from(schema.marketCreatives)
      .where(and(
        eq(schema.marketCreatives.workspaceId, g.s.workspaceId),
        eq(schema.marketCreatives.brandId, g.brand.id),
      ));
    return { described: Number(row?.n ?? 0), advertisers: Number(row?.a ?? 0) };
  } catch {
    return { described: 0, advertisers: 0 };
  }
}
