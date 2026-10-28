import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { analyseSurvie, bilanHypotheses, perfParAngle, type CreaLancee, type VerdictValue } from '@tiktrends/core';
import { ADVANTAGES, AI_STACK, CAPABILITIES, COMPETITORS, GAPS } from '../../../../../lib/intel';
import { Intelligence } from '../../../../../spatial/vues/admin/Intelligence';
import { bandeauSeul, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Intelligence marché » · porte de l'ancien `/admin/intelligence`
 * (`porteAdmin` · admin de l'espace ET fondateur), avant toute lecture. Les
 * calculs sont purs (noyau · `analyseSurvie`, `bilanHypotheses`,
 * `perfParAngle`) · la page lit les colonnes nécessaires, rien d'autre.
 */
export default async function IntelligenceSpatial() {
  await porteAdmin();
  const [b, survie, bilan, perf] = await Promise.all([bandeauSeul(), lireSurvie(), lireBilan(), lirePerf()]);
  return <Intelligence bandeau={b} capacites={CAPABILITIES} ecarts={GAPS} avantages={ADVANTAGES} pile={AI_STACK} concurrents={COMPETITORS} survie={survie} bilan={bilan} perf={perf} />;
}

async function lireSurvie() {
  if (!db) return null;
  const rows = await db.select({ j: schema.marketCreatives.daysRunning }).from(schema.marketCreatives);
  return analyseSurvie(rows.map((r) => r.j ?? 0));
}

async function lireBilan() {
  if (!db) return null;
  const gens = await db.select({ input: schema.generations.input }).from(schema.generations).where(eq(schema.generations.kind, 'ad'));
  return bilanHypotheses(gens.map((g) => {
    const rec = (g.input ?? {}) as { angle?: string | null; rating?: 'up' | 'down' | null };
    return { angle: rec.angle ?? null, rating: rec.rating ?? null };
  }));
}

/** Ad lancée → génération (lien AD-level, le plus sûr) → angle. Les rattachements ambigus sont écartés, pas devinés. */
async function lirePerf() {
  if (!db) return null;
  const rows = await db.select({ sourceRef: schema.ads.sourceRef, computed: schema.verdicts.computed, comparable: schema.verdicts.comparable, metricsAgg: schema.verdicts.metricsAgg })
    .from(schema.ads).innerJoin(schema.verdicts, eq(schema.verdicts.adId, schema.ads.id));
  const genId = (r: { sourceRef: unknown }) => (r.sourceRef as { generationId?: string } | null)?.generationId;
  const ids = Array.from(new Set(rows.map(genId).filter((x): x is string => !!x)));
  const angle = new Map<string, string | null>();
  if (ids.length) {
    for (const g of await db.select({ id: schema.generations.id, input: schema.generations.input }).from(schema.generations).where(inArray(schema.generations.id, ids))) {
      angle.set(g.id, ((g.input ?? {}) as { angle?: string | null }).angle ?? null);
    }
  }
  const creas: CreaLancee[] = rows.map((r) => {
    const id = genId(r);
    const agg = (r.metricsAgg ?? null) as { spend?: number; ctr?: number } | null;
    return { angle: id ? angle.get(id) ?? null : null, verdict: (r.computed ?? null) as VerdictValue | null, comparable: !!r.comparable, spend: agg?.spend ?? null, ctr: agg?.ctr ?? null };
  });
  return perfParAngle(creas);
}
