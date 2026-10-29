import { describe, expect, it } from 'vitest';
import {
  diagnosticOffreV2, ecartsPrix, masquerSecrets, modeCleStripe, prixAttendusV2,
  type EntreeDiagnosticV2, type LectureStripeV2, type PrixAttenduV2, type PrixLu,
} from '../src';

/**
 * « Prêt pour l'offre V2 ? » · la règle de conformité (prix attendu face au prix
 * lu dans Stripe) et le verdict ligne par ligne, lus comme un RÉSULTAT.
 */

const attendu = (variable: string): PrixAttenduV2 => {
  const a = [...prixAttendusV2().forfaits, ...prixAttendusV2().recharges].find((p) => p.variable === variable);
  if (!a) throw new Error(variable);
  return a;
};

/** Le prix Stripe conforme à un prix attendu · le point de départ de chaque mutation. */
const conforme = (a: PrixAttenduV2, id = `price_${a.variable.toLowerCase()}`): PrixLu => ({
  id, actif: true, devise: 'eur', centimes: a.centimes, type: a.intervalle ? 'recurring' : 'one_time',
  intervalle: a.intervalle, nbIntervalles: a.intervalle ? 1 : null, taxe: 'inclusive', reel: true,
});

describe('Offre V2 · prix attendus de la source unique', () => {
  it('29 / 49 / 129 € par mois, l’annuel à −30 %, recharges au prix de la grille', () => {
    const f = Object.fromEntries(prixAttendusV2().forfaits.map((p) => [p.variable, [p.centimes, p.intervalle]]));
    expect(f).toEqual({
      STRIPE_PRICE_ESSENTIEL_MENSUEL: [2900, 'month'], STRIPE_PRICE_ESSENTIEL_ANNUEL: [24360, 'year'],
      STRIPE_PRICE_PRO_MENSUEL: [4900, 'month'], STRIPE_PRICE_PRO_ANNUEL: [41160, 'year'],
      STRIPE_PRICE_AGENCE_MENSUEL: [12900, 'month'], STRIPE_PRICE_AGENCE_ANNUEL: [108360, 'year'],
    });
    const r = prixAttendusV2().recharges;
    expect(r).toHaveLength(9);
    expect(r.find((p) => p.variable === 'STRIPE_PRICE_RECHARGE_PRO_5000')).toMatchObject({ centimes: 2250, intervalle: null });
  });
});

describe('Offre V2 · conformité d’un prix lu', () => {
  const a = attendu('STRIPE_PRICE_PRO_ANNUEL');

  it('un prix conforme n’a aucun écart', () => {
    for (const p of [...prixAttendusV2().forfaits, ...prixAttendusV2().recharges]) expect(ecartsPrix(p, conforme(p), 'reel')).toEqual([]);
  });
  it('montant faux', () => {
    expect(ecartsPrix(a, { ...conforme(a), centimes: 41100 }, 'reel')).toEqual(['montant 411,00 € au lieu de 411,60 €']);
  });
  it('devise fausse', () => {
    expect(ecartsPrix(a, { ...conforme(a), devise: 'usd' }, 'reel')).toEqual(['devise USD au lieu d’EUR']);
  });
  it('période fausse · mensuel au lieu d’annuel, ou tous les 2 ans', () => {
    expect(ecartsPrix(a, { ...conforme(a), intervalle: 'month' }, 'reel')).toEqual(['récurrence mensuel au lieu de annuel']);
    expect(ecartsPrix(a, { ...conforme(a), nbIntervalles: 2 }, 'reel')).toEqual(['récurrence tous les 2 ans au lieu de annuel']);
    expect(ecartsPrix(a, { ...conforme(a), type: 'one_time', intervalle: null }, 'reel')).toEqual(['prix ponctuel au lieu d’un prix récurrent']);
  });
  it('taxe exclusive ou non précisée', () => {
    expect(ecartsPrix(a, { ...conforme(a), taxe: 'exclusive' }, 'reel')).toEqual(['taxe exclue au lieu de taxe incluse']);
    expect(ecartsPrix(a, { ...conforme(a), taxe: 'unspecified' }, 'reel')).toEqual(['taxe non précisée au lieu de taxe incluse']);
  });
  it('archivé, et mode du prix différent de celui de la clé', () => {
    expect(ecartsPrix(a, { ...conforme(a), actif: false }, 'reel')).toEqual(['prix archivé dans Stripe']);
    expect(ecartsPrix(a, conforme(a), 'test')).toEqual(['prix du mode réel avec une clé de test']);
  });
  it('une recharge récurrente est refusée', () => {
    const r = attendu('STRIPE_PRICE_RECHARGE_AGENCE_15000');
    expect(ecartsPrix(r, { ...conforme(r), type: 'recurring', intervalle: 'month' }, 'reel')).toEqual(['prix récurrent au lieu d’un prix ponctuel']);
  });
});

describe('Offre V2 · clé et secrets', () => {
  it('le mode se lit au préfixe', () => {
    expect(modeCleStripe('sk_live_abc')).toBe('reel');
    expect(modeCleStripe('rk_test_abc')).toBe('test');
    expect(modeCleStripe('pk_live_abc')).toBe('inconnu');
    expect(modeCleStripe('')).toBeNull();
    expect(modeCleStripe(undefined)).toBeNull();
  });
  it('un message de Stripe ne laisse passer que le préfixe', () => {
    const m = masquerSecrets('Invalid API Key provided: sk_live_****************abcd et whsec_Zz9');
    expect(m).toBe('Invalid API Key provided: sk_live_[masquée] et whsec_[masqué]');
  });
});

/* ───────────────────────── Le diagnostic complet ───────────────────────── */

const URL_WH = 'https://app.tiktrends.co/api/stripe/webhook';
const forfaits = prixAttendusV2().forfaits;
const idsComplets = Object.fromEntries(forfaits.map((p) => [p.variable, `price_${p.variable.toLowerCase()}`]));

function lecture(over: Partial<LectureStripeV2> = {}, ids: Record<string, string> = idsComplets): LectureStripeV2 {
  const tous = [...prixAttendusV2().forfaits, ...prixAttendusV2().recharges];
  const prix: LectureStripeV2['prix'] = Object.fromEntries(Object.entries(ids).map(([v, id]) => [id, { prix: conforme(tous.find((p) => p.variable === v)!, id) }]));
  return {
    prix,
    taxe: { statut: 'active', manquants: [] },
    webhooks: { endpoints: [{ url: URL_WH, actif: true, evenements: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid'] }] },
    portail: { configurations: [{ parDefaut: true, changement: true, annulation: true, prix: Object.values(idsComplets) }] },
    ...over,
  };
}

const entree = (over: Partial<EntreeDiagnosticV2> = {}): EntreeDiagnosticV2 => ({
  cle: 'reel', secretWebhook: true, cronSecret: true, tarifsV2: false, idsPrix: idsComplets, urlWebhook: URL_WH, stripe: lecture(), ...over,
});
const ligne = (d: ReturnType<typeof diagnosticOffreV2>, cle: string) => d.lignes.find((l) => l.cle === cle);

describe('Offre V2 · diagnostic ligne par ligne', () => {
  it('tout conforme · « Tout est prêt, tu peux poser TARIFS_V2=1 »', () => {
    const d = diagnosticOffreV2(entree());
    expect(d.pret).toBe(true);
    expect(d.phrase).toBe('Tout est prêt, tu peux poser TARIFS_V2=1');
    expect(d.lignes.filter((l) => l.statut !== 'ok').map((l) => l.cle)).toEqual(['TARIFS_V2']);
    expect(ligne(d, 'recharges')?.detail).toMatch(/^9 recharges sur 9 sans prix Stripe/);
  });

  it('un prix manquant · ligne « à faire » avec son geste, et la phrase le nomme', () => {
    const { STRIPE_PRICE_PRO_ANNUEL: _, ...ids } = idsComplets;
    const d = diagnosticOffreV2(entree({ idsPrix: ids, stripe: lecture({}, ids) }));
    const l = ligne(d, 'STRIPE_PRICE_PRO_ANNUEL');
    expect(l).toMatchObject({ statut: 'a_faire', detail: 'Variable absente.' });
    expect(l?.geste).toContain('411,60 € · EUR · récurrent annuel · taxe incluse');
    expect(d.pret).toBe(false);
    expect(d.phrase).toContain('Il manque encore : Pro annuel · STRIPE_PRICE_PRO_ANNUEL');
    expect(ligne(d, 'portail')?.statut).toBe('a_faire');
  });

  it('un prix au montant faux · « erreur », le geste dit de créer un nouveau prix', () => {
    const id = idsComplets.STRIPE_PRICE_AGENCE_MENSUEL!;
    const s = lecture();
    const d = diagnosticOffreV2(entree({ stripe: { ...s, prix: { ...s.prix, [id]: { prix: { ...conforme(attendu('STRIPE_PRICE_AGENCE_MENSUEL'), id), centimes: 9900 } } } } }));
    expect(ligne(d, 'STRIPE_PRICE_AGENCE_MENSUEL')).toMatchObject({ statut: 'erreur' });
    expect(ligne(d, 'STRIPE_PRICE_AGENCE_MENSUEL')?.detail).toContain('montant 99,00 € au lieu de 129,00 €');
    expect(d.pret).toBe(false);
  });

  it('clé de test · « à faire », jamais prêt', () => {
    const s = lecture();
    const prixTest = Object.fromEntries(Object.entries(s.prix).map(([id, r]) => [id, 'prix' in r ? { prix: { ...r.prix, reel: false } } : r]));
    const d = diagnosticOffreV2(entree({ cle: 'test', stripe: { ...s, prix: prixTest } }));
    expect(ligne(d, 'STRIPE_SECRET_KEY')).toMatchObject({ statut: 'a_faire', detail: expect.stringContaining('mode test (préfixe sk_test_)') });
    expect(d.lignes.filter((l) => l.statut === 'erreur')).toEqual([]);
    expect(d.pret).toBe(false);
  });

  it('Stripe Tax en attente, webhook incomplet, portail sans changement', () => {
    const d = diagnosticOffreV2(entree({ stripe: lecture({
      taxe: { statut: 'pending', manquants: ['head_office'] },
      webhooks: { endpoints: [{ url: URL_WH, actif: true, evenements: ['checkout.session.completed'] }] },
      portail: { configurations: [{ parDefaut: true, changement: false, annulation: true, prix: [] }] },
    }) }));
    expect(ligne(d, 'stripe-tax')).toMatchObject({ statut: 'a_faire', detail: expect.stringContaining('manque : head_office') });
    expect(ligne(d, 'webhook')?.detail).toBe('N’écoute pas : checkout.session.async_payment_succeeded, customer.subscription.updated, customer.subscription.deleted, invoice.paid.');
    expect(ligne(d, 'portail')?.detail).toBe('changement d’abonnement fermé.');
  });

  it('Stripe injoignable · une ligne d’erreur honnête, rien de conclu sur les prix', () => {
    const d = diagnosticOffreV2(entree({ stripe: { injoignable: 'Stripe n’a pas répondu en 6 s.' } }));
    expect(ligne(d, 'lecture-stripe')).toMatchObject({ statut: 'erreur', detail: 'Stripe n’a pas répondu en 6 s.' });
    expect(ligne(d, 'STRIPE_PRICE_PRO_MENSUEL')?.statut).toBe('a_faire');
    expect(ligne(d, 'stripe-tax')).toBeUndefined();
  });

  it('TARIFS_V2 posé sur une configuration incomplète · erreur, phrase d’alerte', () => {
    const d = diagnosticOffreV2(entree({ tarifsV2: true, cronSecret: false }));
    expect(ligne(d, 'TARIFS_V2')?.statut).toBe('erreur');
    expect(d.phrase).toBe('TARIFS_V2 est posé alors qu’il manque : Tâches planifiées · CRON_SECRET');
    expect(diagnosticOffreV2(entree({ tarifsV2: true })).phrase).toBe('Tout est prêt · TARIFS_V2 est posé, l’offre V2 est en ligne.');
  });

  it('un même prix dans deux variables · erreur', () => {
    const ids = { ...idsComplets, STRIPE_PRICE_PRO_ANNUEL: idsComplets.STRIPE_PRICE_PRO_MENSUEL! };
    const d = diagnosticOffreV2(entree({ idsPrix: ids }));
    expect(ligne(d, 'STRIPE_PRICE_PRO_ANNUEL')?.statut).toBe('erreur');
    expect(ligne(d, 'STRIPE_PRICE_PRO_MENSUEL')?.statut).toBe('erreur');
  });
});
