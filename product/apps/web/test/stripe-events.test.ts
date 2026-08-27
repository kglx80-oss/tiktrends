import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { routeStripeEvent } from '../lib/stripe-events';
import type { Plan } from '../lib/rbac';

/**
 * Ces cas décrivent QUI est crédité et surtout quand il ne faut PAS créditer.
 * C'est le composant où une erreur se paie en euros réels et se découvre chez le
 * client, donc chaque branche du routage a son scénario.
 */

const ev = (type: string, object: unknown): Stripe.Event =>
  ({ id: 'evt_1', type, data: { object } } as unknown as Stripe.Event);

// Mapping prix -> formule figé pour les tests (en prod : variables d'environnement).
const prices: Record<string, Plan> = { price_core: 'core', price_plus: 'plus' };
const planForPrice = (id?: string | null) => (id ? prices[id] ?? null : null);
const route = (e: Stripe.Event) => routeStripeEvent(e, planForPrice);

const session = (metadata: Record<string, string>, extra: Record<string, unknown> = {}) =>
  ({ metadata, customer: 'cus_1', payment_status: 'paid', subscription: 'sub_1', ...extra });

const subscription = (extra: Record<string, unknown> = {}) =>
  ({ id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { workspaceId: 'ws_1' }, items: { data: [{ price: { id: 'price_core' } }] }, ...extra });

describe('abonnement souscrit', () => {
  it('crédite la formule achetée', () => {
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', plan: 'plus' })));
    expect(i).toMatchObject({ kind: 'plan', workspaceId: 'ws_1', plan: 'plus', refill: 'always', subscriptionId: 'sub_1' });
  });

  it('retombe sur le client Stripe si les métadonnées ne portent pas l’espace', () => {
    const i = route(ev('checkout.session.completed', session({ plan: 'core' })));
    expect(i).toMatchObject({ kind: 'plan', workspaceId: null, customerId: 'cus_1' });
  });

  it('ignore une formule inconnue plutôt que de l’appliquer', () => {
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', plan: 'enterprise' })));
    expect(i.kind).toBe('ignore');
  });
});

describe('paiement non abouti', () => {
  it('ne crédite PAS une session conclue mais impayée (SEPA, iDEAL…)', () => {
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', plan: 'plus' }, { payment_status: 'unpaid' })));
    expect(i).toMatchObject({ kind: 'ignore' });
  });

  it('crédite quand le paiement différé est confirmé après coup', () => {
    // Sur l’événement asynchrone, Stripe a déjà encaissé : plus de contrôle à faire.
    const i = route(ev('checkout.session.async_payment_succeeded', session({ workspaceId: 'ws_1', plan: 'plus' }, { payment_status: 'unpaid' })));
    expect(i).toMatchObject({ kind: 'plan', plan: 'plus', refill: 'always' });
  });

  it('accepte une session sans paiement requis (montant nul)', () => {
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', plan: 'core' }, { payment_status: 'no_payment_required' })));
    expect(i.kind).toBe('plan');
  });
});

describe('recharge ponctuelle', () => {
  it('crédite le nombre de crédits acheté', () => {
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', kind: 'topup', credits: '2500' })));
    expect(i).toMatchObject({ kind: 'topup', workspaceId: 'ws_1', credits: 2500 });
  });

  it('ne crédite pas une recharge sans quantité valable', () => {
    expect(route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', kind: 'topup', credits: '0' }))).kind).toBe('ignore');
    expect(route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', kind: 'topup', credits: 'nawak' }))).kind).toBe('ignore');
    expect(route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', kind: 'topup', credits: '-100' }))).kind).toBe('ignore');
  });

  it('n’est jamais confondue avec un abonnement', () => {
    // Une recharge ne doit pas changer la formule de l’espace.
    const i = route(ev('checkout.session.completed', session({ workspaceId: 'ws_1', kind: 'topup', credits: '500', plan: 'business' })));
    expect(i.kind).toBe('topup');
  });
});

describe('mise à jour d’abonnement', () => {
  it('déduit la formule du prix Stripe', () => {
    const i = route(ev('customer.subscription.updated', subscription({ items: { data: [{ price: { id: 'price_plus' } }] } })));
    expect(i).toMatchObject({ kind: 'plan', plan: 'plus' });
  });

  it('ne recharge que si la formule change vraiment', () => {
    // Un simple changement de statut au portail ne doit pas re-servir l’allocation.
    const i = route(ev('customer.subscription.updated', subscription()));
    expect(i).toMatchObject({ refill: 'if-plan-changed' });
  });

  it('transmet le statut tel quel (impayé, en pause…)', () => {
    const i = route(ev('customer.subscription.updated', subscription({ status: 'past_due' })));
    expect(i).toMatchObject({ kind: 'plan', status: 'past_due' });
  });

  it('retombe sur les métadonnées si le prix n’est pas reconnu', () => {
    const i = route(ev('customer.subscription.updated', subscription({
      items: { data: [{ price: { id: 'price_inconnu' } }] }, metadata: { workspaceId: 'ws_1', plan: 'business' },
    })));
    expect(i).toMatchObject({ kind: 'plan', plan: 'business' });
  });

  it('ignore si ni le prix ni les métadonnées ne donnent de formule', () => {
    const i = route(ev('customer.subscription.updated', subscription({
      items: { data: [{ price: { id: 'price_inconnu' } }] }, metadata: { workspaceId: 'ws_1' },
    })));
    expect(i.kind).toBe('ignore');
  });
});

describe('fin d’abonnement et renouvellement', () => {
  it('la résiliation ramène en Starter', () => {
    expect(route(ev('customer.subscription.deleted', subscription()))).toMatchObject({ kind: 'cancel', workspaceId: 'ws_1' });
  });

  it('une facture payée renouvelle selon la formule en base', () => {
    // La formule n’est PAS lue depuis la facture : c’est l’espace qui fait foi.
    expect(route(ev('invoice.paid', { customer: 'cus_1' }))).toEqual({ kind: 'renew', customerId: 'cus_1' });
  });

  it('accepte un client transmis en objet étendu', () => {
    expect(route(ev('invoice.paid', { customer: { id: 'cus_9' } }))).toEqual({ kind: 'renew', customerId: 'cus_9' });
  });
});

describe('événements non concernés', () => {
  for (const type of ['payment_intent.succeeded', 'customer.created', 'invoice.payment_failed', 'charge.refunded']) {
    it(`ignore ${type}`, () => expect(route(ev(type, {})).kind).toBe('ignore'));
  }
});
