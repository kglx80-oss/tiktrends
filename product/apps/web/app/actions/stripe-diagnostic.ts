'use server';

import { getSession } from '../../lib/auth';
import { isFounder } from '../../lib/founder';
import { getStripe, priceIdFor } from '../../lib/stripe';
import { PLAN_PRICE, PLAN_LABEL, type Plan } from '../../lib/rbac';

/**
 * Diagnostic de la chaîne de paiement · fondateur uniquement.
 *
 * Il n'y a pas de carte à saisir ici : ce contrôle vérifie tout ce qui casse le
 * parcours AVANT même qu'un client sorte sa carte. C'est le complément du test
 * manuel (carte 4242) · il attrape en quelques secondes les erreurs qui, sinon,
 * ne se voient qu'au moment du paiement :
 *
 *  - une clé de mode test avec des prix créés en mode live (« No such price ») ;
 *  - un tarif Stripe qui ne correspond plus à celui affiché sur /billing ;
 *  - un webhook non enregistré, pointant ailleurs, ou n'écoutant pas les
 *    événements qu'on traite · le client paie et n'est jamais crédité ;
 *  - un portail client non configuré, donc impossible de résilier.
 */

export type CheckLevel = 'ok' | 'warn' | 'fail';
export interface Check { label: string; level: CheckLevel; detail: string }
export interface StripeDiagnostic {
  mode: 'test' | 'live' | 'inconnu';
  checks: Check[];
  error?: string;
}

const PAID: Array<Exclude<Plan, 'starter'>> = ['core', 'plus', 'business'];

/** Événements que le webhook sait traiter · l'endpoint doit tous les envoyer. */
const NEEDED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
];

const appUrl = () => (process.env.APP_URL || 'https://app.tiktrends.co').replace(/\/$/, '');
const eur = (cents: number) => (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

export async function runStripeDiagnosticAction(): Promise<StripeDiagnostic> {
  const s = await getSession();
  if (!s || !isFounder(s.user.email)) return { mode: 'inconnu', checks: [], error: 'Réservé au fondateur.' };

  const stripe = getStripe();
  const key = process.env.STRIPE_SECRET_KEY || '';
  const mode: StripeDiagnostic['mode'] = key.startsWith('sk_live') ? 'live' : key.startsWith('sk_test') ? 'test' : 'inconnu';
  const checks: Check[] = [];
  const add = (label: string, level: CheckLevel, detail: string) => checks.push({ label, level, detail });

  if (!stripe) {
    add('Clé secrète', 'fail', 'STRIPE_SECRET_KEY absente : aucun paiement possible.');
    return { mode, checks };
  }

  // 1) La clé est-elle acceptée par Stripe ?
  let liveKey = mode === 'live';
  try {
    const bal = await stripe.balance.retrieve();
    liveKey = bal.livemode;
    add('Clé secrète', 'ok', `Acceptée par Stripe · mode ${bal.livemode ? 'LIVE (paiements réels)' : 'TEST'}.`);
  } catch (e) {
    add('Clé secrète', 'fail', `Refusée par Stripe : ${(e as Error).message}`);
    return { mode, checks };
  }

  // 2) Les prix : existants, actifs, dans le BON MODE, et au tarif affiché.
  for (const plan of PAID) {
    const label = `Prix ${PLAN_LABEL[plan]}`;
    const id = priceIdFor(plan);
    if (!id) {
      add(label, 'warn', `Non configuré : la formule n'est pas vendable (bouton « Bientôt » sur /billing).`);
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(id, { expand: ['product'] });
      const soucis: string[] = [];
      if (price.livemode !== liveKey) {
        soucis.push(`créé en mode ${price.livemode ? 'LIVE' : 'TEST'} alors que la clé est en ${liveKey ? 'LIVE' : 'TEST'}`);
      }
      if (!price.active) soucis.push('prix archivé côté Stripe');
      if (price.type !== 'recurring') soucis.push('ce n’est pas un prix récurrent (abonnement)');
      if (price.currency !== 'eur') soucis.push(`devise ${price.currency.toUpperCase()} au lieu d'EUR`);

      const attendu = PLAN_PRICE[plan] * 100;
      const reel = price.unit_amount ?? 0;
      if (reel !== attendu) {
        soucis.push(`Stripe facture ${eur(reel)} € alors que /billing affiche ${PLAN_PRICE[plan]} €`);
      }
      if (soucis.length) add(label, 'fail', soucis.join(' · '));
      else add(label, 'ok', `${eur(reel)} € / ${price.recurring?.interval === 'year' ? 'an' : 'mois'} · actif.`);
    } catch (e) {
      add(label, 'fail', `Introuvable chez Stripe (${id}) · souvent un prix créé dans l'autre mode. ${(e as Error).message}`);
    }
  }

  // 3) Webhook : secret posé, endpoint enregistré, bonne URL, bons événements.
  const attenduUrl = `${appUrl()}/api/stripe/webhook`;
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    add('Signature webhook', 'fail', 'STRIPE_WEBHOOK_SECRET absente : toutes les notifications Stripe sont rejetées, donc aucun paiement n’est crédité.');
  } else {
    add('Signature webhook', 'ok', 'STRIPE_WEBHOOK_SECRET posée.');
  }
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 20 });
    const mien = list.data.find((w) => w.url === attenduUrl);
    if (!mien) {
      const autres = list.data.map((w) => w.url).join(', ') || 'aucun';
      add('Endpoint webhook', 'fail', `Aucun endpoint sur ${attenduUrl}. Endpoints déclarés : ${autres}.`);
    } else if (mien.status !== 'enabled') {
      add('Endpoint webhook', 'fail', `Endpoint présent mais désactivé (${mien.status}).`);
    } else {
      const events = mien.enabled_events ?? [];
      const manquants = events.includes('*') ? [] : NEEDED_EVENTS.filter((e) => !events.includes(e));
      if (manquants.length) add('Endpoint webhook', 'fail', `Ces événements ne sont pas envoyés : ${manquants.join(', ')}.`);
      else add('Endpoint webhook', 'ok', `${attenduUrl} · actif, tous les événements nécessaires sont envoyés.`);
    }
  } catch (e) {
    add('Endpoint webhook', 'warn', `Liste indisponible (droits de la clé ?) : ${(e as Error).message}`);
  }

  // 4) Portail client : sans configuration active, « Gérer mon abonnement » échoue.
  try {
    const confs = await stripe.billingPortal.configurations.list({ limit: 5, active: true });
    if (!confs.data.length) {
      add('Portail client', 'fail', 'Aucune configuration active : le bouton « Gérer mon abonnement » échouera. À activer dans Stripe > Paramètres > Portail client.');
    } else {
      add('Portail client', 'ok', `${confs.data.length} configuration(s) active(s) · résiliation et changement de formule possibles.`);
    }
  } catch (e) {
    add('Portail client', 'warn', `Vérification impossible : ${(e as Error).message}`);
  }

  return { mode: liveKey ? 'live' : 'test', checks };
}
