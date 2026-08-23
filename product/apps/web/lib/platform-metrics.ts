import 'server-only';
import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { PLAN_PRICE, type Plan } from './rbac';

export interface WorkspaceRow {
  id: string; name: string; plan: Plan; credits: number; members: number; createdAt: string; active30: boolean;
}
export interface PlatformMetrics {
  workspaces: number;
  paying: number;
  usersTotal: number;
  brandsTotal: number;
  mrr: number;
  arr: number;
  arpa: number;
  byPlan: Record<Plan, number>;
  new30: number;
  active30: number;
  atRisk: number;
  churnRiskPct: number;
  creditsConsumed30: number;
  creditsConsumedAll: number;
  generationsTotal: number;
  ticketsOpen: number;
  ticketsTotal: number;
  rows: WorkspaceRow[];
}

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
async function n(q: Promise<{ n: number }[]>): Promise<number> { try { return (await q)[0]?.n ?? 0; } catch { return 0; } }

export async function computePlatformMetrics(prices: Record<Plan, number> = PLAN_PRICE): Promise<PlatformMetrics> {
  const empty: PlatformMetrics = {
    workspaces: 0, paying: 0, usersTotal: 0, brandsTotal: 0, mrr: 0, arr: 0, arpa: 0,
    byPlan: { starter: 0, core: 0, plus: 0, business: 0 }, new30: 0, active30: 0, atRisk: 0,
    churnRiskPct: 0, creditsConsumed30: 0, creditsConsumedAll: 0, generationsTotal: 0, ticketsOpen: 0, ticketsTotal: 0, rows: [],
  };
  if (!db) return empty;

  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const wsList = await db.select().from(schema.workspaces).orderBy(desc(schema.workspaces.createdAt));

  // Membres par espace + espaces actifs (activité de crédits sur 30j).
  const [memberRows, activeRows] = await Promise.all([
    db.select({ ws: schema.workspaceMembers.workspaceId, n: count() }).from(schema.workspaceMembers).groupBy(schema.workspaceMembers.workspaceId),
    db.select({ ws: schema.creditLedger.workspaceId }).from(schema.creditLedger).where(gte(schema.creditLedger.createdAt, cutoff)).groupBy(schema.creditLedger.workspaceId),
  ]);
  const memberMap = Object.fromEntries(memberRows.map((r) => [r.ws, Number(r.n)]));
  const activeSet = new Set(activeRows.map((r) => r.ws));

  const byPlan: Record<Plan, number> = { starter: 0, core: 0, plus: 0, business: 0 };
  let mrr = 0, paying = 0, new30 = 0;
  const rows: WorkspaceRow[] = wsList.map((w) => {
    const plan = (PLANS.includes(w.plan as Plan) ? w.plan : 'starter') as Plan;
    byPlan[plan] += 1;
    const price = prices[plan];
    mrr += price;
    if (price > 0) paying += 1;
    const created = w.createdAt as Date;
    if (created >= cutoff) new30 += 1;
    return {
      id: w.id, name: w.name, plan, credits: w.creditsBalance, members: memberMap[w.id] ?? 0,
      createdAt: created.toISOString(), active30: activeSet.has(w.id),
    };
  });

  const active30 = rows.filter((r) => r.active30).length;
  const atRisk = rows.length - active30;

  const [usersTotal, brandsTotal, generationsTotal, ticketsOpen, ticketsTotal, consumed30, consumedAll] = await Promise.all([
    n(db.select({ n: count() }).from(schema.users)),
    n(db.select({ n: count() }).from(schema.brands)),
    n(db.select({ n: count() }).from(schema.generations)),
    n(db.select({ n: count() }).from(schema.tickets).where(eq(schema.tickets.status, 'open'))),
    n(db.select({ n: count() }).from(schema.tickets)),
    n(db.select({ n: sql<number>`coalesce(-sum(${schema.creditLedger.delta}), 0)` }).from(schema.creditLedger).where(and(lt(schema.creditLedger.delta, 0), gte(schema.creditLedger.createdAt, cutoff)))),
    n(db.select({ n: sql<number>`coalesce(-sum(${schema.creditLedger.delta}), 0)` }).from(schema.creditLedger).where(lt(schema.creditLedger.delta, 0))),
  ]);

  return {
    workspaces: rows.length, paying, usersTotal, brandsTotal,
    mrr, arr: mrr * 12, arpa: paying ? Math.round(mrr / paying) : 0,
    byPlan, new30, active30, atRisk,
    churnRiskPct: rows.length ? Math.round((atRisk / rows.length) * 100) : 0,
    creditsConsumed30: Number(consumed30), creditsConsumedAll: Number(consumedAll),
    generationsTotal, ticketsOpen, ticketsTotal, rows,
  };
}
