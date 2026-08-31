'use server';

import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { SIGNAL_LABEL, estimateCost, type RadarSignal } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { runRadarForBrand, radarState, type RadarState } from '../../lib/radar';
import { spendStatus } from '../../lib/spend-guard';
import { ensureGraphPath, nextVariant } from '../../lib/adsmap-path';
import { revalidatePath } from 'next/cache';

/**
 * Le radar, côté écran.
 *
 * ── Ce qu'on affiche AVANT d'armer ───────────────────────────────────────────
 *
 * Le coût. Pas après, pas dans une note de bas de page : c'est la première
 * fonction du produit qui dépense sans qu'on ait cliqué, et une fonction qui
 * tourne toute seule doit annoncer sa facture avant qu'on l'allume, pas
 * l'expliquer une fois qu'elle est arrivée.
 *
 * On montre le PIRE cas · trente nuits pleines au plafond choisi. Un coût moyen
 * serait plus flatteur et moins utile : personne ne se fait surprendre par une
 * moyenne, on se fait surprendre par un maximum.
 */

export interface RadarFindingRow {
  externalId: string;
  advertiser: string | null;
  signal: RadarSignal | null;
  signalLabel: string;
  daysRunning: number;
  format: string | null;
  hookType: string | null;
  openingType: string | null;
  summary: string | null;
  reason: string | null;
  reportedAt: string | null;
}

export interface RadarView {
  state: RadarState;
  findings: RadarFindingRow[];
  /** État du plafond global · le radar n'a pas de budget à lui. */
  spend: { spentUsd: number; capUsd: number; summary: string };
}

export async function radarViewAction(): Promise<{ view?: RadarView; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };

  try {
    const [state, rows, spend] = await Promise.all([
      radarState(g.s.workspaceId, g.brand.id),
      db!.select({
        externalId: schema.marketCreatives.externalId,
        advertiser: schema.marketCreatives.advertiser,
        signal: schema.marketCreatives.radarSignal,
        daysRunning: schema.marketCreatives.daysRunning,
        format: schema.marketCreatives.format,
        hookType: schema.marketCreatives.hookType,
        openingType: schema.marketCreatives.openingType,
        analysis: schema.marketCreatives.analysis,
        reportedAt: schema.marketCreatives.reportedAt,
      })
        .from(schema.marketCreatives)
        .where(and(
          eq(schema.marketCreatives.workspaceId, g.s.workspaceId),
          isNotNull(schema.marketCreatives.radarSignal),
        ))
        .orderBy(desc(schema.marketCreatives.reportedAt))
        .limit(60),
      spendStatus(),
    ]);

    const findings: RadarFindingRow[] = rows.map((r) => {
      const a = (r.analysis ?? {}) as { summary?: string; radarReason?: string };
      const s = (r.signal ?? null) as RadarSignal | null;
      return {
        externalId: r.externalId,
        advertiser: r.advertiser,
        signal: s,
        signalLabel: s ? SIGNAL_LABEL[s] : '—',
        daysRunning: r.daysRunning,
        format: r.format,
        hookType: r.hookType,
        openingType: r.openingType,
        summary: a.summary ?? null,
        reason: a.radarReason ?? null,
        reportedAt: r.reportedAt ? (r.reportedAt as Date).toISOString() : null,
      };
    });

    return {
      view: {
        state, findings,
        spend: { spentUsd: spend.spentUsd, capUsd: spend.capUsd, summary: spend.summary },
      },
    };
  } catch (e) {
    return { error: logAndTranslate('adsmap:radar-view', e, { subject: 'le radar de veille', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Arme ou désarme le radar.
 *
 * Réservé aux administrateurs · allumer une dépense récurrente n'est pas une
 * préférence d'affichage. Le plafond est borné à 20 créas par nuit en dur : au
 * champ libre, une faute de frappe se paie.
 */
export async function setRadarAction(input: { armed: boolean; cap?: number }): Promise<{ state?: RadarState; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  const cap = Math.max(1, Math.min(Math.round(input.cap ?? 3), 20));

  try {
    await db!.update(schema.brands)
      .set({ radarArmed: input.armed, radarCap: cap })
      .where(eq(schema.brands.id, g.brand.id));
    revalidatePath('/adsmap/radar');
    return { state: await radarState(g.s.workspaceId, g.brand.id) };
  } catch (e) {
    return { error: logAndTranslate('adsmap:radar-set', e, { subject: 'le réglage du radar', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Déclenche un passage tout de suite.
 *
 * Utile pour voir ce que la nuit produira sans attendre la nuit. La dépense est
 * la même · on la dit dans le compte rendu plutôt que de laisser croire qu'un
 * essai manuel serait gratuit.
 */
export async function runRadarNowAction(): Promise<{ digest?: string; analyzed?: number; spentUsd?: number; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };

  try {
    const r = await runRadarForBrand(g.s.workspaceId, g.brand.id);
    revalidatePath('/adsmap/radar');
    return { digest: r.digest, analyzed: r.analyzed, spentUsd: r.spentUsd };
  } catch (e) {
    return { error: logAndTranslate('adsmap:radar-run', e, { subject: 'le passage du radar', workspaceId: g.s.workspaceId }) };
  }
}

/** Ce que coûterait un plafond donné · sert au réglage, avant de valider. */
export async function radarCostPreviewAction(cap: number): Promise<{ nightly: number; monthly: number }> {
  const n = estimateCost(Math.max(0, Math.min(Math.round(cap), 20)));
  return { nightly: n, monthly: Math.round(n * 30 * 100) / 100 };
}

/* -------------------------------------------------------------------------- */
/*  De la trouvaille au concept                                               */
/* -------------------------------------------------------------------------- */

/**
 * Le radar s'arrêtait sur le constat.
 *
 * Il disait « ce concurrent tient depuis 24 jours sur une ouverture que tu n'as
 * jamais testée », et regardait quelqu'un d'autre travailler. Entre l'avoir lu
 * et l'avoir essayé, il y avait un écran de rédaction, un rattachement à faire
 * à la main, et une nuit de sommeil · c'est-à-dire, en pratique, rien.
 *
 * ── Ce qui entre dans la carte, et sous quelle forme ─────────────────────────
 *
 * Le concept arrive `proposed`, l'ad arrive `draft`. Une trouvaille de veille ne
 * décide pas de la taxonomie de la marque · et une ad née d'une observation
 * extérieure n'est pas prête à tourner, elle est prête à être relue.
 *
 * ── Ce qu'on reprend du concurrent ───────────────────────────────────────────
 *
 * La MÉCANIQUE, jamais les mots · la consigne de rédaction l'impose et le
 * rappelle. On copie le ressort qui fait tenir, pas la créa qui tient.
 */
export async function conceptFromFindingAction(input: {
  externalId: string;
  hypothesis: string;
  headline: string;
  beats: string[];
}): Promise<{ conceptId?: string; adId?: string; error?: string }> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { error: g.error };

  const hypothese = input.hypothesis.trim();
  if (hypothese.length < 10) {
    return { error: 'Écris l’hypothèse : sans elle, le résultat de ce test n’apprendra rien à personne.' };
  }
  const titre = input.headline.trim().slice(0, 160);
  if (!titre) return { error: 'Le concept n’a pas d’accroche · relance la rédaction.' };

  try {
    const [f] = await db!.select({
      externalId: schema.marketCreatives.externalId,
      advertiser: schema.marketCreatives.advertiser,
      hookType: schema.marketCreatives.hookType,
      openingType: schema.marketCreatives.openingType,
      format: schema.marketCreatives.format,
    })
      .from(schema.marketCreatives)
      .where(and(
        eq(schema.marketCreatives.workspaceId, g.s.workspaceId),
        eq(schema.marketCreatives.externalId, input.externalId),
      ))
      .limit(1);
    if (!f) return { error: 'Cette trouvaille n’est plus dans la veille.' };

    // L'angle porte la mécanique observée, pas le nom du concurrent · un angle
    // « Nike » ne se réutilise pas, un angle « démonstration en une prise » si.
    const angleLabel = (f.openingType || f.hookType || titre).slice(0, 160);
    const path = await ensureGraphPath({
      workspaceId: g.s.workspaceId, brandId: g.brand.id,
      desireLabel: 'À qualifier (Radar)',
      angleLabel, mechanism: MECANIQUE[f.hookType ?? ''] ?? 'demo',
    });
    if (!path) return { error: 'Rattachement à la carte impossible.' };

    const [concept] = await db!.insert(schema.concepts).values({
      workspaceId: g.s.workspaceId, angleId: path.angleId, title: titre,
      valueBlock: input.beats.filter((b) => b?.trim()).join(' · ').slice(0, 2000) || null,
      adType: 'imitation', status: 'proposed',
      // La provenance est écrite · six mois plus tard, « d'où sortait cette
      // idée » est une question qu'on se pose vraiment.
      sourceRef: { radarExternalId: f.externalId, advertiser: f.advertiser },
    }).returning({ id: schema.concepts.id });
    if (!concept) return { error: 'La création du concept n’a rien renvoyé.' };

    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: g.s.workspaceId, conceptId: concept.id,
      variantCode: await nextVariant(concept.id),
      format: (f.format === 'static' ? 'static' : 'video_ugc') as typeof schema.ads.$inferInsert.format,
      adType: 'imitation', hypothesis: hypothese, status: 'draft',
    }).returning({ id: schema.ads.id });

    revalidatePath('/adsmap');
    revalidatePath('/adsmap/radar');
    return { conceptId: concept.id, adId: ad?.id };
  } catch (e) {
    return { error: logAndTranslate('adsmap:radar-concept', e, { subject: 'la création du concept', workspaceId: g.s.workspaceId }) };
  }
}

/** Type d'accroche observé → mécanisme d'angle Adsmap. */
const MECANIQUE: Record<string, string> = {
  problem: 'problem_agitate', pain: 'problem_agitate',
  demo: 'demo', product_demo: 'demo',
  testimonial: 'social_proof', review: 'social_proof', ugc: 'story',
  before_after: 'comparison', comparison: 'comparison', versus: 'us_vs_them',
  story: 'story', question: 'curiosity', curiosity: 'curiosity',
  stat: 'statistic_shock', number: 'statistic_shock',
  expert: 'authority', authority: 'authority',
  offer: 'scarcity', discount: 'scarcity', urgency: 'scarcity',
  list: 'listicle', listicle: 'listicle',
  myth: 'reverse', mistake: 'reverse',
};
