'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { allouerFormule } from '../../lib/credits';
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
  // Page d'origine : le pilotage vit dans ADMIN+, mais l'action reste appelable
  // depuis /billing tant qu'un fondateur y passe.
  const home = formData.get('back') === 'admin' ? '/admin/plans' : '/billing';
  if (!isFounder(s.user.email)) redirect(`${home}?e=forbidden`);
  const plan = String(formData.get('plan') || '') as Plan;
  if (!PLANS.includes(plan)) redirect(`${home}?e=plan`);
  if (plan === s.plan) redirect(`${home}?ok=same`);

  await db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, s.workspaceId));

  // Nouvelle allocation SANS effacer les recharges payées : la poche d'abonnement
  // est remplacée, la poche hors abonnement est conservée (règle `allouerPoches`).
  await allouerFormule(s.workspaceId, PLAN_CREDITS[plan] ?? 0, `Changement de formule -> ${plan}`);
  redirect(`${home}?ok=changed`);
}
