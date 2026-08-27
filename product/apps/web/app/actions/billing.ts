'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { isFounder } from '../../lib/founder';
import { PLAN_CREDITS, type Plan } from '../../lib/rbac';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

/**
 * Change la formule de l'espace de travail · pilotage interne plateforme.
 *
 * ATTENTION : cette action attribue directement l'allocation de crédits du plan
 * SANS paiement. Toute inscription libre crée un espace dont l'utilisateur est
 * « owner » : le rôle ne peut donc pas servir de garde ici, sinon n'importe quel
 * inscrit se met en Business (24 000 crédits) gratuitement. Réservé au fondateur ;
 * les clients passent par Stripe (createCheckoutAction / portail).
 */
export async function changePlanAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!isFounder(s.user.email)) redirect('/billing?e=forbidden');
  const plan = String(formData.get('plan') || '') as Plan;
  if (!PLANS.includes(plan)) redirect('/billing?e=plan');
  if (plan === s.plan) redirect('/billing?ok=same');

  await db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, s.workspaceId));

  // Nouvelle allocation SANS effacer les recharges payées : on retire l'ancienne
  // allocation du solde (les crédits d'abonnement ne se cumulent pas) et on ajoute
  // la nouvelle ; ce qui restait au-dessus, ce sont les crédits achetés.
  const alloc = PLAN_CREDITS[plan] ?? 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance, last: schema.workspaces.lastPlanCredits })
    .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const balance = w?.c ?? 0;
  const next = Math.max(0, balance - (w?.last ?? 0)) + alloc;
  const delta = next - balance;
  await db.update(schema.workspaces).set({ creditsBalance: next, lastPlanCredits: alloc }).where(eq(schema.workspaces.id, s.workspaceId));
  if (delta !== 0) {
    await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta, reason: `Changement de formule -> ${plan}` });
  }
  redirect('/billing?ok=changed');
}
