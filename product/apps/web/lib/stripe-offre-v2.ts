import 'server-only';
import {
  DELAI_LECTURE_STRIPE_MS, diagnosticOffreV2, masquerSecrets, modeCleStripe, prixAttendusV2, tarifsV2Actifs,
  type DiagnosticOffreV2, type LectureStripeV2, type PrixLu,
} from '@tiktrends/core';

/**
 * « Prêt pour l'offre V2 ? » · la lecture côté serveur. LECTURE SEULE · aucun
 * appel n'écrit dans Stripe (`retrieve`, `list`). Elle remet au noyau des
 * FAITS (`diagnosticOffreV2`) · la présence de chaque variable (un booléen),
 * le mode de la clé (son préfixe), les prix lus. Aucune valeur de secret ne
 * sort d'ici, ni dans le résultat ni dans un journal · un message d'erreur de
 * Stripe est masqué avant d'être rendu.
 *
 * Le client est injecté · `getStripe()` en production, un client simulé dans
 * `test/offre-v2-diagnostic.test.tsx` (0 appel réel).
 */

type Opt = { timeout: number; maxNetworkRetries: number };
type Liste<T> = Promise<{ data: T[] }>;

/** Ce que le contrôle lit de Stripe · un sous-ensemble structurel du client officiel. */
export interface ClientStripeLectureV2 {
  prices: {
    retrieve(id: string, params: undefined, options: Opt): Promise<{
      id: string; active: boolean; currency: string; unit_amount: number | null; type: string; livemode: boolean;
      tax_behavior: string | null; recurring: { interval: string; interval_count: number } | null;
    }>;
  };
  tax: { settings: { retrieve(params: undefined, options: Opt): Promise<{ status: string; status_details: { pending?: { missing_fields: string[] | null } | null } }> } };
  webhookEndpoints: { list(params: { limit: number }, options: Opt): Liste<{ url: string; status: string; enabled_events: string[] }> };
  billingPortal: {
    configurations: {
      list(params: { limit: number; active: boolean }, options: Opt): Liste<{
        is_default: boolean;
        features: {
          subscription_cancel: { enabled: boolean };
          subscription_update: { enabled: boolean; products?: Array<{ prices: string[] }> | null };
        };
      }>;
    };
  };
}

class DelaiDepasse extends Error {}

/** Une lecture bornée dans le temps · la promesse de Stripe ou l'échéance, la première qui arrive. */
function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new DelaiDepasse()), ms); })]).finally(() => clearTimeout(t));
}

const estIntrouvable = (e: unknown) => (e as { code?: string; statusCode?: number })?.code === 'resource_missing' || (e as { statusCode?: number })?.statusCode === 404;

export async function lireOffreV2(
  stripe: ClientStripeLectureV2 | null,
  env: Readonly<Record<string, string | undefined>>,
  o: { delaiMs?: number; urlWebhook: string },
): Promise<DiagnosticOffreV2> {
  const delai = o.delaiMs ?? DELAI_LECTURE_STRIPE_MS;
  const opt: Opt = { timeout: delai, maxNetworkRetries: 0 };
  const attendus = prixAttendusV2();
  const idsPrix = Object.fromEntries([...attendus.forfaits, ...attendus.recharges].map((a) => [a.variable, env[a.variable]?.trim() || undefined]));
  // Les valeurs des secrets, pour les retirer de tout message qui remonterait de Stripe.
  const secrets = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET'].map((n) => env[n]?.trim()).filter((v): v is string => !!v && v.length >= 6);
  const secondes = (delai / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  const propre = (e: unknown): string => {
    if (e instanceof DelaiDepasse) return `pas de réponse en ${secondes} s`;
    let m = masquerSecrets(String((e as Error)?.message ?? e));
    for (const s of secrets) m = m.split(s).join('[masqué]');
    return m;
  };

  const base = {
    cle: modeCleStripe(env.STRIPE_SECRET_KEY),
    secretWebhook: !!env.STRIPE_WEBHOOK_SECRET?.trim(),
    cronSecret: !!env.CRON_SECRET?.trim(),
    tarifsV2: tarifsV2Actifs(env as Record<string, string | undefined>),
    idsPrix,
    urlWebhook: o.urlWebhook,
  };
  if (!stripe || !base.cle) return diagnosticOffreV2({ ...base, stripe: null });

  const ids = [...new Set(Object.values(idsPrix).filter((v): v is string => !!v && v.startsWith('price_')))];
  type R<T> = { ok: true; v: T } | { ok: false; e: unknown };
  const lire = <T,>(f: () => Promise<T>): Promise<R<T>> => avecDelai(f(), delai).then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));

  const [prix, taxe, webhooks, portail] = await Promise.all([
    Promise.all(ids.map((id) => lire(() => stripe.prices.retrieve(id, undefined, opt)))),
    lire(() => stripe.tax.settings.retrieve(undefined, opt)),
    lire(() => stripe.webhookEndpoints.list({ limit: 20 }, opt)),
    lire(() => stripe.billingPortal.configurations.list({ limit: 10, active: true }, opt)),
  ]);

  // Rien n'a répondu (délai, réseau, clé refusée) · une erreur honnête, aucune conclusion.
  const toutes = [...prix, taxe, webhooks, portail];
  if (toutes.every((r) => !r.ok && !estIntrouvable(r.e))) {
    const premiere = toutes[0] as { ok: false; e: unknown };
    const motif = premiere.e instanceof DelaiDepasse ? `Stripe n’a pas répondu en ${secondes} s.` : `Stripe n’a rien rendu · ${propre(premiere.e)}`;
    return diagnosticOffreV2({ ...base, stripe: { injoignable: motif } });
  }

  const lecture: LectureStripeV2 = {
    prix: Object.fromEntries(ids.map((id, i) => {
      const r = prix[i]!;
      if (r.ok) {
        const p = r.v;
        const lu: PrixLu = {
          id: p.id, actif: p.active, devise: p.currency, centimes: p.unit_amount, type: p.type,
          intervalle: p.recurring?.interval ?? null, nbIntervalles: p.recurring?.interval_count ?? null, taxe: p.tax_behavior, reel: p.livemode,
        };
        return [id, { prix: lu }];
      }
      return [id, estIntrouvable(r.e) ? { introuvable: propre(r.e) } : { erreur: propre(r.e) }];
    })),
    taxe: taxe.ok ? { statut: taxe.v.status, manquants: taxe.v.status_details?.pending?.missing_fields ?? [] } : { erreur: propre(taxe.e) },
    webhooks: webhooks.ok ? { endpoints: webhooks.v.data.map((w) => ({ url: w.url, actif: w.status === 'enabled', evenements: w.enabled_events ?? [] })) } : { erreur: propre(webhooks.e) },
    portail: portail.ok
      ? { configurations: portail.v.data.map((c) => ({
        parDefaut: c.is_default,
        annulation: !!c.features?.subscription_cancel?.enabled,
        changement: !!c.features?.subscription_update?.enabled,
        prix: (c.features?.subscription_update?.products ?? []).flatMap((p) => p.prices ?? []),
      })) }
      : { erreur: propre(portail.e) },
  };
  return diagnosticOffreV2({ ...base, stripe: lecture });
}
