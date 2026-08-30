'use server';

import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { SIGNAL_LABEL, estimateCost, type RadarSignal } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { runRadarForBrand, radarState, type RadarState } from '../../lib/radar';
import { spendStatus } from '../../lib/spend-guard';
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
