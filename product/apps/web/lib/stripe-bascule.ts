import 'server-only';
import type Stripe from 'stripe';
import { and, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { BASCULE_FORFAIT_V2, phasesBascule, tarifsV2Actifs } from '@tiktrends/core';
import { priceIdForV2 } from './stripe';

/**
 * Bascule des abonnés actuels à LEUR échéance (décision du 29/10, point 5) ·
 * tâche planifiée quotidienne (`/api/cron/bascule-forfaits`), seulement sous
 * `TARIFS_V2` et quand le prix V2 mensuel de l'équivalent est posé.
 *
 * Pour chaque abonné Core, Plus ou Business, un échéancier Stripe est posé :
 * la période en cours reste au prix d'aujourd'hui (droits acquis jusqu'à
 * l'échéance), la suivante passe au prix V2, sans prorata. À l'échéance, Stripe
 * change le prix · le webhook lit le nouveau prix (`planForPrice`) et alloue le
 * forfait V2. Un abonnement qui a déjà un échéancier n'est pas touché (rejouable).
 */
export type ClientStripeBascule = {
  subscriptions: { retrieve: (id: string) => Promise<Stripe.Subscription> };
  subscriptionSchedules: {
    create: (p: Stripe.SubscriptionScheduleCreateParams) => Promise<{ id: string }>;
    update: (id: string, p: Stripe.SubscriptionScheduleUpdateParams) => Promise<unknown>;
  };
};

export async function programmerBascules(stripe: ClientStripeBascule | null, env: Record<string, string | undefined> = process.env): Promise<{ programmees: number; ignorees: number }> {
  if (!db || !stripe || !tarifsV2Actifs(env)) return { programmees: 0, ignorees: 0 };
  const W = schema.workspaces;
  const abonnes = await db.select({ id: W.id, plan: W.plan, sub: W.stripeSubscriptionId }).from(W)
    .where(and(inArray(W.plan, ['core', 'plus', 'business']), isNotNull(W.stripeSubscriptionId), inArray(W.subscriptionStatus, ['active', 'trialing'])));
  let programmees = 0, ignorees = 0;
  for (const a of abonnes) {
    const prixV2 = priceIdForV2(BASCULE_FORFAIT_V2[a.plan as 'core' | 'plus' | 'business'], 'mensuel');
    if (!prixV2 || !a.sub) { ignorees++; continue; }
    try {
      const sub = await stripe.subscriptions.retrieve(a.sub);
      const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined;
      if (sub.schedule || !item?.price?.id || !item.current_period_start || !item.current_period_end) { ignorees++; continue; }
      const plan = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
      await stripe.subscriptionSchedules.update(plan.id, phasesBascule({ prixActuel: item.price.id, prixV2, debutPeriode: item.current_period_start, finPeriode: item.current_period_end }) as unknown as Stripe.SubscriptionScheduleUpdateParams);
      programmees++;
    } catch (e) {
      console.error('[bascule]', a.id, (e as Error).message);
      ignorees++;
    }
  }
  return { programmees, ignorees };
}
