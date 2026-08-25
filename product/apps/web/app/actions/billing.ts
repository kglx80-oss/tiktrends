'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { PLAN_CREDITS, type Plan } from '../../lib/rbac';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

/**
 * Change la formule de l'espace de travail · propriétaire.
 * Pré-Stripe : mutation directe du plan, avec recharge de l'allocation à la nouvelle valeur.
 * Sert au pilotage interne en attendant le branchement du paiement.
 */
export async function changePlanAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/billing?e=forbidden');
  const plan = String(formData.get('plan') || '') as Plan;
  if (!PLANS.includes(plan)) redirect('/billing?e=plan');
  if (plan === s.plan) redirect('/billing?ok=same');

  await db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, s.workspaceId));

  // Recale le solde sur l'allocation du nouveau plan + trace le mouvement.
  const alloc = PLAN_CREDITS[plan] ?? 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const delta = alloc - (w?.c ?? 0);
  if (delta !== 0) {
    await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, alloc) }).where(eq(schema.workspaces.id, s.workspaceId));
    await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta, reason: `Changement de formule -> ${plan}` });
  }
  redirect('/billing?ok=changed');
}
