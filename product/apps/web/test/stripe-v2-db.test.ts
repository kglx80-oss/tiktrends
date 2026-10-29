import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Stripe · offre V2 (29/10) · sur une vraie base (pglite, migrations réelles) et
 * les fonctions serveur réelles. Le client Stripe est un FAUX qui enregistre ce
 * qu'on lui envoie · on lit ces paramètres et la base, jamais la présence d'un appel.
 *
 * Mutations faites (restaurées) :
 *  · `automatic_tax` retiré de `parametresCheckoutAbonnementV2` ⇒ « Stripe Tax activé » tombe ;
 *  · la branche V2 de `createCheckoutAction` sans condition `TARIFS_V2` ⇒ « sans l’interrupteur, le paiement d’aujourd’hui » tombe ;
 *  · `allouerAnnuelsDus` sans la réservation conditionnelle ⇒ « une seule allocation par mois » tombe ;
 *  · `programmerBascules` sans le test `sub.schedule` ⇒ « déjà programmé, rien de plus » tombe.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, envoye: [] as unknown[] }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/stripe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/stripe')>()),
  getStripe: () => ({
    customers: { retrieve: async () => ({ id: 'cus_1' }), create: async () => ({ id: 'cus_1' }) },
    checkout: { sessions: { create: async (p: unknown) => { etat.envoye.push(p); return { url: 'https://checkout.stripe.test/s' }; } } },
  }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { createCheckoutAction, createTopupCheckoutAction } from '../app/actions/stripe';
import { allouerAnnuelsDus, runIntent } from '../lib/stripe-webhook';
import { routeStripeEvent } from '../lib/stripe-events';
import { planForPrice } from '../lib/stripe';
import { parametresCheckoutRechargeV2, rechargesV2 } from '@tiktrends/core';
import type Stripe from 'stripe';
import { programmerBascules } from '../lib/stripe-bascule';

const W = schema.workspaces;
async function espace(v: Partial<typeof W.$inferInsert> = {}) {
  const id = randomUUID();
  await db.insert(W).values({ id, name: 'Stripe', plan: 'starter', stripeCustomerId: 'cus_1', ...v });
  return id;
}
async function appeler(action: (fd: FormData) => Promise<void>, champs: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  try { await action(fd); } catch (e) { return (e as Error).message; }
  return null;
}
const lire = async (id: string) => (await db.select().from(W).where(eq(W.id, id)))[0]!;

afterEach(() => {
  for (const k of ['TARIFS_V2', 'STRIPE_PRICE_PRO_ANNUEL', 'STRIPE_PRICE_CORE', 'STRIPE_PRICE_ESSENTIEL_MENSUEL']) delete process.env[k];
  etat.envoye = [];
});

describe('paiement · sans TARIFS_V2, celui d’aujourd’hui', () => {
  it('abonnement Core · mêmes paramètres qu’aujourd’hui, sans taxe automatique · un forfait V2 n’est pas vendable', async () => {
    process.env.STRIPE_PRICE_CORE = 'price_core';
    process.env.STRIPE_PRICE_PRO_ANNUEL = 'price_pro_an';
    const ws = await espace();
    etat.session = { workspaceId: ws, plan: 'starter', role: 'owner', user: { email: 'k@x.fr' } };
    expect(await appeler(createCheckoutAction, { plan: 'core' })).toBe('REDIRECT https://checkout.stripe.test/s');
    expect(etat.envoye[0]).toEqual({
      mode: 'subscription', customer: 'cus_1', line_items: [{ price: 'price_core', quantity: 1 }], allow_promotion_codes: true,
      success_url: 'https://app.tiktrends.co/billing?ok=subscribed', cancel_url: 'https://app.tiktrends.co/billing?e=cancel',
      metadata: { workspaceId: ws, plan: 'core' }, subscription_data: { metadata: { workspaceId: ws, plan: 'core' } },
    });
    expect(await appeler(createCheckoutAction, { plan: 'pro', facturation: 'annuel' })).toBe('REDIRECT /billing?e=stripe');
    expect(etat.envoye).toHaveLength(1);
  });
});

describe('paiement · avec TARIFS_V2', () => {
  it('abonnement Pro annuel · le prix de la variable, Stripe Tax activé, facturation en métadonnées', async () => {
    process.env.TARIFS_V2 = '1';
    process.env.STRIPE_PRICE_PRO_ANNUEL = 'price_pro_an';
    const ws = await espace();
    etat.session = { workspaceId: ws, plan: 'starter', role: 'owner', user: { email: 'k@x.fr' } };
    await appeler(createCheckoutAction, { plan: 'pro', facturation: 'annuel' });
    expect(etat.envoye[0]).toMatchObject({ line_items: [{ price: 'price_pro_an', quantity: 1 }], automatic_tax: { enabled: true }, subscription_data: { metadata: { plan: 'pro', facturation: 'annuel' } } });
  });

  it('recharge d’un abonné Agence · 5 000 crédits à 21 € TTC, taxe incluse, marqueur d’unité', async () => {
    process.env.TARIFS_V2 = '1';
    const ws = await espace({ plan: 'agence' });
    etat.session = { workspaceId: ws, plan: 'agence', role: 'owner', user: { email: 'k@x.fr' } };
    await appeler(createTopupCheckoutAction, { pack: 'v2_agence_5000' });
    expect(etat.envoye[0]).toMatchObject({ mode: 'payment', automatic_tax: { enabled: true }, metadata: { credits: '5000', unite: '10' } });
    expect((etat.envoye[0] as { line_items: Array<{ price_data: { unit_amount: number; tax_behavior: string } }> }).line_items[0]!.price_data).toMatchObject({ unit_amount: 2100, tax_behavior: 'inclusive' });
    // Le pack d'un autre forfait n'est jamais vendu à cet espace.
    expect(await appeler(createTopupCheckoutAction, { pack: 'v2_essentiel_5000' })).toBe('REDIRECT /billing?e=stripe');
  });
});

describe('webhook · chaque paiement crédite, un annuel reçoit ses crédits chaque mois', () => {
  it('Pro annuel · allocation au paiement, puis une seule allocation par mois', async () => {
    const t0 = new Date('2026-11-01T10:00:00Z');
    const ws = await espace();
    await runIntent({ kind: 'plan', workspaceId: ws, customerId: 'cus_1', plan: 'pro', status: 'active', subscriptionId: 'sub_1', refill: 'always', facturation: 'annuel', finPeriode: new Date('2027-11-01T10:00:00Z') }, t0);
    let w = await lire(ws);
    expect([w.plan, w.creditsBalance, w.billingInterval, (w.nextAllocationAt as Date).toISOString(), (w.subscriptionPeriodEnd as Date).toISOString()])
      .toEqual(['pro', 7000, 'annuel', '2026-12-01T10:00:00.000Z', '2027-11-01T10:00:00.000Z']);
    await db.update(W).set({ creditsBalance: 1000, planCreditsLeft: 1000 }).where(eq(W.id, ws)); // 6 000 consommés
    expect(await allouerAnnuelsDus(new Date('2026-11-20T00:00:00Z'))).toBe(0);
    const t1 = new Date('2026-12-01T11:00:00Z');
    // Deux passages simultanés (deux workers, un rejeu) · une seule allocation.
    const [x, y] = await Promise.all([allouerAnnuelsDus(t1), allouerAnnuelsDus(t1)]);
    expect(x + y).toBe(1);
    expect(await allouerAnnuelsDus(t1)).toBe(0);
    const lignes = await db.select({ r: schema.creditLedger.reason }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ws));
    expect(lignes.filter((l) => l.r.includes('allocation mensuelle'))).toHaveLength(1);
    w = await lire(ws);
    expect([w.creditsBalance, (w.nextAllocationAt as Date).toISOString()]).toEqual([7000, '2027-01-01T10:00:00.000Z']);
  });

  it('un mensuel n’a pas d’allocation programmée · une résiliation l’efface', async () => {
    const ws = await espace();
    await runIntent({ kind: 'plan', workspaceId: ws, customerId: 'cus_1', plan: 'essentiel', status: 'active', subscriptionId: 'sub_2', refill: 'always', facturation: 'mensuel' });
    expect((await lire(ws)).nextAllocationAt).toBeNull();
    await runIntent({ kind: 'cancel', workspaceId: ws, customerId: 'cus_1' });
    const w = await lire(ws);
    expect([w.plan, w.billingInterval, w.nextAllocationAt]).toEqual(['starter', null, null]);
  });
});

describe('webhook de bout en bout · vrai événement Stripe → routage → base', () => {
  const evt = (type: string, object: unknown) => ({ id: `evt_${randomUUID()}`, type, data: { object } }) as unknown as Stripe.Event;

  it('recharge V2 payée · les crédits du pack s’ajoutent, dans la nouvelle unité, sans toucher la poche du forfait', async () => {
    const ws = await espace({ plan: 'pro', creditsBalance: 3000, planCreditsLeft: 3000 });
    const p = parametresCheckoutRechargeV2({ customer: 'cus_1', price: null, pack: rechargesV2('pro')[1]!, forfait: 'pro', workspaceId: ws, appUrl: 'https://app.test' });
    await runIntent(routeStripeEvent(evt('checkout.session.completed', { mode: 'payment', payment_status: 'paid', customer: 'cus_1', metadata: p.metadata }), planForPrice));
    const w = await lire(ws);
    expect([w.creditsBalance, w.planCreditsLeft]).toEqual([8000, 3000]);
    const l = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ws));
    expect(l.map((x) => x.delta)).toEqual([5000]);
  });

  it('Essentiel mensuel · le paiement alloue 4 000 crédits, chaque facture payée remet la poche du forfait à 4 000, les crédits achetés restent', async () => {
    process.env.STRIPE_PRICE_ESSENTIEL_MENSUEL = 'price_ess_m';
    const ws = await espace();
    const meta = { workspaceId: ws, plan: 'essentiel', facturation: 'mensuel' };
    await runIntent(routeStripeEvent(evt('checkout.session.completed', { mode: 'subscription', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_e', metadata: meta }), planForPrice));
    expect([(await lire(ws)).plan, (await lire(ws)).creditsBalance]).toEqual(['essentiel', 4000]);
    await db.update(W).set({ stripeCustomerId: `cus_${ws}`, creditsBalance: 2500, planCreditsLeft: 500 }).where(eq(W.id, ws)); // 3 500 consommés, 2 000 achetés
    await runIntent(routeStripeEvent(evt('invoice.paid', { customer: `cus_${ws}`, lines: { data: [{ period: { end: 1_800_000_000 } }] } }), planForPrice));
    const w = await lire(ws);
    expect([w.creditsBalance, w.planCreditsLeft, (w.subscriptionPeriodEnd as Date).toISOString()]).toEqual([6000, 4000, new Date(1_800_000_000_000).toISOString()]);
  });
});

describe('bascule des abonnés actuels à leur échéance', () => {
  const faux = (schedule: string | null) => {
    const appels: unknown[] = [];
    return {
      appels,
      client: {
        subscriptions: { retrieve: async (id: string) => ({ id, schedule, items: { data: [{ price: { id: 'price_core' }, current_period_start: 100, current_period_end: 200 }] } }) as never },
        subscriptionSchedules: { create: async (p: unknown) => { appels.push(['create', p]); return { id: 'sched_1' }; }, update: async (id: string, p: unknown) => { appels.push(['update', id, p]); return {}; } },
      },
    };
  };

  it('sans TARIFS_V2 · rien n’est programmé', async () => {
    await espace({ plan: 'core', stripeSubscriptionId: 'sub_core', subscriptionStatus: 'active' });
    const f = faux(null);
    expect(await programmerBascules(f.client, { STRIPE_PRICE_ESSENTIEL_MENSUEL: 'price_ess' })).toEqual({ programmees: 0, ignorees: 0 });
    expect(f.appels).toEqual([]);
  });

  it('avec TARIFS_V2 · la période en cours au prix Core, la suivante au prix Essentiel · déjà programmé, rien de plus', async () => {
    process.env.STRIPE_PRICE_ESSENTIEL_MENSUEL = 'price_ess';
    const f = faux(null);
    const r = await programmerBascules(f.client, { TARIFS_V2: '1', STRIPE_PRICE_ESSENTIEL_MENSUEL: 'price_ess' });
    expect(r.programmees).toBeGreaterThanOrEqual(1);
    expect(f.appels[0]).toEqual(['create', { from_subscription: 'sub_core' }]);
    expect((f.appels[1] as [string, string, { phases: unknown[] }])[2].phases).toEqual([
      { items: [{ price: 'price_core', quantity: 1 }], start_date: 100, end_date: 200 },
      { items: [{ price: 'price_ess', quantity: 1 }], iterations: 1 },
    ]);
    const g = faux('sched_deja');
    expect((await programmerBascules(g.client, { TARIFS_V2: '1', STRIPE_PRICE_ESSENTIEL_MENSUEL: 'price_ess' })).programmees).toBe(0);
    expect(g.appels).toEqual([]);
  });
});
