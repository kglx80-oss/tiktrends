'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { ttSearchAds, type InspoAd } from '@tiktrends/integrations';
import { analyzeCompetitor, type CompetitorInsights } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { guardedAnthropic } from '../../lib/spend-guard';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export interface CompetitorAggregates {
  adCount: number;
  byPlatform: Record<string, number>;
  byMedia: Record<string, number>;
  topCtas: Array<{ label: string; n: number }>;
  landingDomains: Array<{ label: string; n: number }>;
  avgDaysRunning: number;
  longestRunning: number;
}
export interface CompetitorReport {
  name: string;
  analyzedAt: string;
  source: 'trendtrack' | 'none';
  aggregates: CompetitorAggregates;
  ads: InspoAd[];
  insights: CompetitorInsights | null;
  note?: string;
}

const memKey = (name: string) => `competitor:${name.toLowerCase().slice(0, 120)}`;

async function guardBrand(brandId: string): Promise<{ workspaceId: string; email: string | null } | null> {
  const s = await getSession();
  if (!s || !db || !roleAtLeast(s.role, 'admin')) return null;
  const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  return b ? { workspaceId: s.workspaceId, email: s.user.email } : null;
}

function aggregate(ads: InspoAd[]): CompetitorAggregates {
  const byPlatform: Record<string, number> = {};
  const byMedia: Record<string, number> = {};
  const cta: Record<string, number> = {};
  const dom: Record<string, number> = {};
  let days = 0, longest = 0;
  for (const a of ads) {
    byPlatform[a.platform] = (byPlatform[a.platform] ?? 0) + 1;
    const m = (a.mediaType || a.format || 'inconnu').toLowerCase().includes('vid') ? 'video' : (a.mediaType || a.format || 'autre');
    byMedia[m] = (byMedia[m] ?? 0) + 1;
    if (a.callToAction) cta[a.callToAction] = (cta[a.callToAction] ?? 0) + 1;
    if (a.landingDomain) dom[a.landingDomain] = (dom[a.landingDomain] ?? 0) + 1;
    days += a.daysRunning || 0;
    longest = Math.max(longest, a.daysRunning || 0);
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([label, n]) => ({ label, n }));
  return {
    adCount: ads.length, byPlatform, byMedia, topCtas: top(cta), landingDomains: top(dom),
    avgDaysRunning: ads.length ? Math.round(days / ads.length) : 0, longestRunning: longest,
  };
}

export async function analyzeCompetitorAction(formData: FormData): Promise<void> {
  const brandId = norm(formData.get('brandId'));
  const name = norm(formData.get('name'));
  const g = await guardBrand(brandId);
  if (!g || !db || !name) redirect('/brands');
  const back = `/brands/${brandId}/competitors/${encodeURIComponent(name)}`;

  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!apiKey) redirect(`${back}?e=nolibrary`);

  // 1) Récupération des créas du concurrent (recherche par marque, Meta = couverture max).
  let ads: InspoAd[] = [];
  try {
    const r = await ttSearchAds({ apiKey }, { search: name, searchIn: 'brand', status: 'all', sortBy: 'newest', limit: 40, offset: 0 });
    ads = r.ads;
  } catch {
    redirect(`${back}?e=fetch`);
  }
  if (ads.length === 0) redirect(`${back}?e=noresult`);

  const aggregates = aggregate(ads);

  // 2) Analyse IA des patterns (si clé présente), débit crédits.
  let insights: CompetitorInsights | null = null;
  let note: string | undefined;
  const client = guardedAnthropic({ action: 'competitor' });
  if (client) {
    const cost = costFor('report');
    const unlimited = unlimitedCredits(g.email);
    // Débit atomique avant l'analyse, remboursé si elle échoue.
    if (!unlimited && !(await reserveCredits(g.workspaceId, cost, `Analyse concurrent · ${name}`))) {
      note = `Créas récupérées, mais crédits insuffisants pour l'analyse IA (${cost} requis).`;
    } else {
      try {
        insights = await analyzeCompetitor(client, { name, ads: ads.map((a) => ({ body: a.body, callToAction: a.callToAction, format: a.format, platform: a.platform })) });
      } catch {
        if (!unlimited) await refundCredits(g.workspaceId, cost, 'Remboursement · analyse concurrent');
        note = "Créas récupérées, mais l'analyse IA a échoué. Réessaie.";
      }
    }
  } else {
    note = "Créas récupérées. Active l'IA (clé serveur) pour l'analyse des patterns.";
  }

  const report: CompetitorReport = {
    name, analyzedAt: new Date().toISOString(), source: 'trendtrack',
    aggregates, ads: ads.slice(0, 24), insights, note,
  };

  // 3) Mise en cache (agent_memory) pour ne pas rebrûler de crédits à chaque visite.
  await db.insert(schema.agentMemory)
    .values({ brandId, key: memKey(name), value: report })
    .onConflictDoUpdate({ target: [schema.agentMemory.brandId, schema.agentMemory.key], set: { value: report, updatedAt: new Date() } });

  redirect(`${back}?ok=1`);
}

/** Lecture du rapport en cache (pour l'affichage de la page). */
export async function getCompetitorReport(brandId: string, name: string): Promise<CompetitorReport | null> {
  if (!db) return null;
  const [row] = await db.select({ value: schema.agentMemory.value }).from(schema.agentMemory)
    .where(and(eq(schema.agentMemory.brandId, brandId), eq(schema.agentMemory.key, memKey(name)))).limit(1);
  return (row?.value as CompetitorReport | undefined) ?? null;
}
