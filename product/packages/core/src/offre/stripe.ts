/**
 * L'offre · ce que l'appli demande à Stripe pour l'offre V2. Pur · aucune
 * clé, aucun appel · les paramètres sont construits ici et gardés par des
 * tests (`offre-stripe.test.ts`) ; le serveur les envoie tels quels.
 *
 * Décisions du 29/10 · prix TTC, TVA calculée par Stripe Tax ; annuel −30 % ;
 * un identifiant de prix par variable d'environnement, jamais dans le dépôt
 * (`docs/FACTURATION-STRIPE.md`).
 */
import { FORFAITS_V2_ORDRE, TAILLES_RECHARGE_V2, type CleForfaitV2, type Facturation, type Recharge } from './forfaits';

/** Le nom de la variable d'environnement du prix d'un forfait V2 · ex. `STRIPE_PRICE_PRO_ANNUEL`. */
export function variablePrixForfait(forfait: CleForfaitV2, facturation: Facturation): string {
  return `STRIPE_PRICE_${forfait.toUpperCase()}_${facturation.toUpperCase()}`;
}

/** Le nom de la variable d'environnement (facultative) d'une recharge V2 · ex. `STRIPE_PRICE_RECHARGE_PRO_5000`. */
export function variablePrixRecharge(forfait: CleForfaitV2, credits: number): string {
  return `STRIPE_PRICE_RECHARGE_${forfait.toUpperCase()}_${credits}`;
}

/** Toutes les variables de prix de l'offre V2 · les six forfaits, puis les neuf recharges. */
export function variablesPrixV2(): { forfaits: string[]; recharges: string[] } {
  return {
    forfaits: FORFAITS_V2_ORDRE.flatMap((f) => (['mensuel', 'annuel'] as const).map((p) => variablePrixForfait(f, p))),
    recharges: FORFAITS_V2_ORDRE.flatMap((f) => TAILLES_RECHARGE_V2.map((c) => variablePrixRecharge(f, c))),
  };
}

/** Le forfait et la facturation d'un identifiant de prix · résolution inverse pour le webhook. */
export function forfaitDuPrix(priceId: string | null | undefined, env: Record<string, string | undefined>): { forfait: CleForfaitV2; facturation: Facturation } | null {
  if (!priceId) return null;
  for (const forfait of FORFAITS_V2_ORDRE) {
    for (const facturation of ['mensuel', 'annuel'] as const) {
      if (env[variablePrixForfait(forfait, facturation)] === priceId) return { forfait, facturation };
    }
  }
  return null;
}

/**
 * Les paramètres de la session Checkout d'un abonnement V2 · Stripe Tax
 * activé (`automatic_tax`), adresse mise à jour sur le client (exigé par Stripe
 * Tax pour un client existant), numéro de TVA intracommunautaire collecté
 * (autoliquidation B2B), métadonnées lues par le webhook.
 */
export function parametresCheckoutAbonnementV2(o: {
  customer: string; price: string; workspaceId: string; forfait: CleForfaitV2; facturation: Facturation; appUrl: string;
}) {
  const metadata = { workspaceId: o.workspaceId, plan: o.forfait, facturation: o.facturation };
  return {
    mode: 'subscription' as const,
    customer: o.customer,
    line_items: [{ price: o.price, quantity: 1 }],
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto' as const, name: 'auto' as const },
    billing_address_collection: 'required' as const,
    tax_id_collection: { enabled: true },
    success_url: `${o.appUrl}/billing?ok=subscribed`,
    cancel_url: `${o.appUrl}/billing?e=cancel`,
    metadata,
    subscription_data: { metadata },
  };
}

/**
 * Les paramètres de la session Checkout d'une recharge V2 · un prix Stripe si
 * la variable existe, sinon un prix en ligne TTC (`tax_behavior: inclusive`),
 * Stripe Tax activé. `unite: '10'` · crédits dans la nouvelle unité.
 */
export function parametresCheckoutRechargeV2(o: { customer: string; price: string | null; pack: Recharge; forfait: CleForfaitV2; workspaceId: string; appUrl: string }) {
  const metadata = { workspaceId: o.workspaceId, kind: 'topup', credits: String(o.pack.credits), unite: '10', forfait: o.forfait };
  const ligne = o.price
    ? { price: o.price, quantity: 1 }
    : {
      quantity: 1,
      price_data: {
        currency: 'eur', unit_amount: Math.round(o.pack.eur * 100), tax_behavior: 'inclusive' as const,
        product_data: { name: `Recharge · ${o.pack.credits.toLocaleString('fr-FR')} crédits TikTrends` },
      },
    };
  return {
    mode: 'payment' as const,
    customer: o.customer,
    line_items: [ligne],
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto' as const, name: 'auto' as const },
    billing_address_collection: 'required' as const,
    tax_id_collection: { enabled: true },
    success_url: `${o.appUrl}/billing?ok=topup`,
    cancel_url: `${o.appUrl}/billing?e=cancel`,
    metadata,
    payment_intent_data: { metadata },
  };
}

/* ───────────────────────── Allocation mensuelle d'un abonnement annuel ───────────────────────── */

/**
 * La date de la prochaine allocation · un mois calendaire plus tard, bornée au
 * dernier jour du mois (un 31 janvier donne le 28 ou 29 février, jamais le 3 mars).
 */
export function moisSuivant(d: Date): Date {
  const a = d.getUTCFullYear(), m = d.getUTCMonth() + 1, j = d.getUTCDate();
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m, Math.min(j, dernier), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

/**
 * Un abonné annuel est payé une fois par an (`invoice.paid`), mais ses crédits
 * sont MENSUELS · l'allocation suivante est due quand sa date est passée,
 * l'abonnement actif et la facturation annuelle. Un abonné mensuel est alloué
 * à chaque paiement, jamais par ce chemin.
 */
export function allocationDue(w: { facturation: string | null; prochaine: Date | null; statut: string | null }, maintenant: Date): boolean {
  return w.facturation === 'annuel' && !!w.prochaine && w.prochaine.getTime() <= maintenant.getTime() && (w.statut === 'active' || w.statut === 'trialing');
}

/* ───────────────────────── Bascule des abonnés actuels à l'échéance ───────────────────────── */

/**
 * Les phases de l'échéancier Stripe qui fait basculer un abonné actuel à SON
 * échéance · la période en cours reste au prix d'aujourd'hui (droits acquis),
 * la suivante passe au prix V2 mensuel, sans prorata, puis l'abonnement est
 * relâché (il continue normalement).
 */
export function phasesBascule(o: { prixActuel: string; prixV2: string; debutPeriode: number; finPeriode: number }) {
  return {
    end_behavior: 'release' as const,
    proration_behavior: 'none' as const,
    phases: [
      { items: [{ price: o.prixActuel, quantity: 1 }], start_date: o.debutPeriode, end_date: o.finPeriode },
      { items: [{ price: o.prixV2, quantity: 1 }], iterations: 1 },
    ],
  };
}
