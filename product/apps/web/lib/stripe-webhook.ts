import 'server-only';
import { and, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { allocationDue, moisSuivant } from '@tiktrends/core';
import { PLAN_CREDITS, type Plan } from './rbac';
import { allouerFormule, convertirUniteEspace } from './credits';
import type { StripeIntent } from './stripe-events';

/**
 * Exécution des intentions Stripe (`routeStripeEvent`) · sortie de la route
 * pour être éprouvée sur une vraie base (`stripe-webhook-db.test.ts`).
 * Chaque paiement crédite · abonnement (allocation à chaque facture, et chaque
 * mois pour un annuel), recharge (crédits du pack).
 */
/**
 * Applique une formule à un espace : plan + statut, et renouvelle l'allocation SANS
 * effacer les crédits achetés en recharge (cf. allouerFormule, règle `allouerPoches`).
 */
async function applyPlan(workspaceId: string, plan: Plan, opts: { status?: string; subscriptionId?: string | null; refill?: boolean; facturation?: 'mensuel' | 'annuel' | null; finPeriode?: Date | null; maintenant?: Date }) {
  if (!db) return;
  const set: Record<string, unknown> = { plan };
  if (opts.status !== undefined) set.subscriptionStatus = opts.status;
  if (opts.subscriptionId !== undefined) set.stripeSubscriptionId = opts.subscriptionId;
  // Offre V2 · facturation (crédits mensuels d'un annuel) et échéance (préavis de bascule).
  if (opts.facturation) set.billingInterval = opts.facturation;
  if (opts.finPeriode) set.subscriptionPeriodEnd = opts.finPeriode;
  await db.update(schema.workspaces).set(set).where(eq(schema.workspaces.id, workspaceId));
  if (!opts.refill) return;

  await allouerFormule(workspaceId, PLAN_CREDITS[plan] ?? 0, `Abonnement ${plan} · allocation`);
  // Un annuel est payé une fois par an · l'allocation suivante est due dans un mois
  // (tâche planifiée `allocations-annuelles`). Un mensuel est alloué à chaque paiement.
  const [w] = await db.select({ f: schema.workspaces.billingInterval }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  await db.update(schema.workspaces).set({ nextAllocationAt: w?.f === 'annuel' ? moisSuivant(opts.maintenant ?? new Date()) : null }).where(eq(schema.workspaces.id, workspaceId));
}

async function workspaceIdFromCustomer(customerId: string | null): Promise<string | null> {
  if (!db || !customerId) return null;
  const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.stripeCustomerId, customerId)).limit(1);
  return w?.id ?? null;
}

/** Résout l'espace : métadonnées de l'événement d'abord, client Stripe en repli. */
async function resolveWorkspace(i: { workspaceId?: string | null; customerId?: string | null }): Promise<string | null> {
  return i.workspaceId || (await workspaceIdFromCustomer(i.customerId ?? null));
}

/** Exécute l'intention décidée par routeStripeEvent. */
export async function runIntent(intent: StripeIntent, maintenant: Date = new Date()): Promise<void> {
  if (!db || intent.kind === 'ignore') return;

  if (intent.kind === 'topup') {
    const workspaceId = await resolveWorkspace(intent);
    if (!workspaceId) return;
    await convertirUniteEspace(workspaceId); // `intent.credits` est dans la nouvelle unité (`creditsRecharge`)
    await db.update(schema.workspaces)
      .set({ creditsBalance: sql`${schema.workspaces.creditsBalance} + ${intent.credits}` })
      .where(eq(schema.workspaces.id, workspaceId));
    await db.insert(schema.creditLedger).values({ workspaceId, delta: intent.credits, reason: 'Recharge de crédits (Stripe)' });
    return;
  }

  if (intent.kind === 'cancel') {
    const workspaceId = await resolveWorkspace(intent);
    if (workspaceId) {
      await applyPlan(workspaceId, 'starter', { status: 'canceled', subscriptionId: null, refill: true, maintenant });
      await db.update(schema.workspaces).set({ billingInterval: null, nextAllocationAt: null }).where(eq(schema.workspaces.id, workspaceId));
    }
    return;
  }

  if (intent.kind === 'renew') {
    const workspaceId = await resolveWorkspace(intent);
    if (!workspaceId) return;
    const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    const plan = (w?.plan as Plan) || null;
    if (plan && plan !== 'starter') await applyPlan(workspaceId, plan, { status: 'active', refill: true, finPeriode: intent.finPeriode ?? null, maintenant });
    return;
  }

  // intent.kind === 'plan'
  const workspaceId = await resolveWorkspace(intent);
  if (!workspaceId) return;
  let refill = intent.refill === 'always';
  if (intent.refill === 'if-plan-changed') {
    const [cur] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    refill = cur?.plan !== intent.plan && intent.status === 'active';
  }
  await applyPlan(workspaceId, intent.plan, { status: intent.status, subscriptionId: intent.subscriptionId, refill, facturation: intent.facturation ?? null, finPeriode: intent.finPeriode ?? null, maintenant });
}


/**
 * Allocation mensuelle des abonnés ANNUELS · tâche planifiée quotidienne
 * (`/api/cron/allocations`). Chaque espace dû est « réservé » par un UPDATE
 * conditionnel sur sa date (deux passages concurrents n'allouent pas deux fois),
 * puis reçoit l'allocation de son forfait (`allouerFormule` · les crédits achetés
 * ne sont jamais touchés). Rend le nombre d'espaces alloués.
 */
export async function allouerAnnuelsDus(maintenant: Date = new Date()): Promise<number> {
  if (!db) return 0;
  const W = schema.workspaces;
  const dus = await db.select({ id: W.id, plan: W.plan, f: W.billingInterval, prochaine: W.nextAllocationAt, statut: W.subscriptionStatus })
    .from(W).where(and(eq(W.billingInterval, 'annuel'), lte(W.nextAllocationAt, maintenant)));
  let n = 0;
  for (const w of dus) {
    if (!allocationDue({ facturation: w.f, prochaine: w.prochaine as Date | null, statut: w.statut }, maintenant) || !w.prochaine) continue;
    const pris = await db.update(W).set({ nextAllocationAt: moisSuivant(w.prochaine as Date) })
      .where(and(eq(W.id, w.id), eq(W.nextAllocationAt, w.prochaine as Date))).returning({ id: W.id });
    if (!pris.length) continue;
    await allouerFormule(w.id, PLAN_CREDITS[w.plan as Plan] ?? 0, `Abonnement ${w.plan} · allocation mensuelle (annuel)`);
    n++;
  }
  return n;
}
