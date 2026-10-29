import { describe, expect, it } from 'vitest';
import {
  allocationDue, forfaitDuPrix, moisSuivant, parametresCheckoutAbonnementV2, parametresCheckoutRechargeV2, phasesBascule, rechargesV2, variablesPrixV2,
} from '../src';

/** Stripe · offre V2 (29/10) · les paramètres envoyés, lus comme un RÉSULTAT. */
describe('Stripe · offre V2', () => {
  it('les noms des variables · six forfaits, neuf recharges facultatives', () => {
    const v = variablesPrixV2();
    expect(v.forfaits).toEqual([
      'STRIPE_PRICE_ESSENTIEL_MENSUEL', 'STRIPE_PRICE_ESSENTIEL_ANNUEL', 'STRIPE_PRICE_PRO_MENSUEL', 'STRIPE_PRICE_PRO_ANNUEL', 'STRIPE_PRICE_AGENCE_MENSUEL', 'STRIPE_PRICE_AGENCE_ANNUEL',
    ]);
    expect(v.recharges).toHaveLength(9);
    expect(v.recharges[0]).toBe('STRIPE_PRICE_RECHARGE_ESSENTIEL_2000');
  });

  it('un prix retrouve son forfait et sa facturation · un prix inconnu ne donne rien', () => {
    const env = { STRIPE_PRICE_PRO_ANNUEL: 'price_pro_an', STRIPE_PRICE_CORE: 'price_core' };
    expect(forfaitDuPrix('price_pro_an', env)).toEqual({ forfait: 'pro', facturation: 'annuel' });
    expect(forfaitDuPrix('price_core', env)).toBeNull();
    expect(forfaitDuPrix(undefined, env)).toBeNull();
  });

  it('abonnement · Stripe Tax activé, adresse et numéro de TVA collectés, métadonnées lues par le webhook', () => {
    const p = parametresCheckoutAbonnementV2({ customer: 'cus_1', price: 'price_pro_an', workspaceId: 'w', forfait: 'pro', facturation: 'annuel', appUrl: 'https://app' });
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.customer_update).toEqual({ address: 'auto', name: 'auto' });
    expect(p.tax_id_collection).toEqual({ enabled: true });
    expect(p.line_items).toEqual([{ price: 'price_pro_an', quantity: 1 }]);
    expect(p.subscription_data.metadata).toEqual({ workspaceId: 'w', plan: 'pro', facturation: 'annuel' });
  });

  it('recharge · prix TTC en ligne (taxe incluse) à défaut de prix Stripe, crédits dans la nouvelle unité', () => {
    const pack = rechargesV2('agence')[1]!;
    const p = parametresCheckoutRechargeV2({ customer: 'cus_1', price: null, pack, forfait: 'agence', workspaceId: 'w', appUrl: 'https://app' });
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.line_items[0]).toMatchObject({ price_data: { currency: 'eur', unit_amount: 2100, tax_behavior: 'inclusive' } });
    expect(p.metadata).toMatchObject({ kind: 'topup', credits: '5000', unite: '10' });
    expect(parametresCheckoutRechargeV2({ customer: 'c', price: 'price_r', pack, forfait: 'agence', workspaceId: 'w', appUrl: 'x' }).line_items[0]).toEqual({ price: 'price_r', quantity: 1 });
  });

  it('allocation mensuelle d’un annuel · un mois calendaire, bornée au dernier jour, due seulement si active et annuelle', () => {
    expect(moisSuivant(new Date('2026-01-31T08:00:00Z')).toISOString()).toBe('2026-02-28T08:00:00.000Z');
    expect(moisSuivant(new Date('2026-12-15T00:00:00Z')).toISOString()).toBe('2027-01-15T00:00:00.000Z');
    const t = new Date('2026-11-01T00:00:00Z');
    expect(allocationDue({ facturation: 'annuel', prochaine: new Date('2026-10-31T00:00:00Z'), statut: 'active' }, t)).toBe(true);
    expect(allocationDue({ facturation: 'annuel', prochaine: new Date('2026-11-02T00:00:00Z'), statut: 'active' }, t)).toBe(false);
    expect(allocationDue({ facturation: 'mensuel', prochaine: new Date('2026-10-01T00:00:00Z'), statut: 'active' }, t)).toBe(false);
    expect(allocationDue({ facturation: 'annuel', prochaine: new Date('2026-10-01T00:00:00Z'), statut: 'canceled' }, t)).toBe(false);
  });

  it('bascule à l’échéance · la période en cours reste au prix d’aujourd’hui, la suivante au prix V2, sans prorata', () => {
    const p = phasesBascule({ prixActuel: 'price_core', prixV2: 'price_ess_m', debutPeriode: 100, finPeriode: 200 });
    expect(p.phases[0]).toEqual({ items: [{ price: 'price_core', quantity: 1 }], start_date: 100, end_date: 200 });
    expect(p.phases[1]!.items).toEqual([{ price: 'price_ess_m', quantity: 1 }]);
    expect(p.proration_behavior).toBe('none');
    expect(p.end_behavior).toBe('release');
  });
});
