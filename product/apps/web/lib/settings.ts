import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { PLAN_PRICE, PLAN_CREDITS, type Plan } from './rbac';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const PLAN_CONFIG_KEY = 'plan_config';

export interface PlanConfig {
  prices: Record<Plan, number>;
  credits: Record<Plan, number>;
}

function sanitize(raw: unknown, fallback: Record<Plan, number>): Record<Plan, number> {
  const out = { ...fallback };
  if (raw && typeof raw === 'object') {
    for (const p of PLANS) {
      const v = (raw as Record<string, unknown>)[p];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[p] = Math.round(v);
    }
  }
  return out;
}

/** Config des plans effective : overrides en base fusionnés avec les défauts du code. */
export async function getPlanConfig(): Promise<PlanConfig> {
  const fallback: PlanConfig = { prices: { ...PLAN_PRICE }, credits: { ...PLAN_CREDITS } };
  if (!db) return fallback;
  try {
    const [row] = await db.select({ value: schema.appSettings.value }).from(schema.appSettings).where(eq(schema.appSettings.key, PLAN_CONFIG_KEY)).limit(1);
    const v = (row?.value ?? {}) as { prices?: unknown; credits?: unknown };
    return { prices: sanitize(v.prices, PLAN_PRICE), credits: sanitize(v.credits, PLAN_CREDITS) };
  } catch { return fallback; }
}

export async function setPlanConfig(cfg: PlanConfig): Promise<void> {
  if (!db) return;
  const value = { prices: sanitize(cfg.prices, PLAN_PRICE), credits: sanitize(cfg.credits, PLAN_CREDITS) };
  await db.insert(schema.appSettings).values({ key: PLAN_CONFIG_KEY, value })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value, updatedAt: new Date() } });
}
