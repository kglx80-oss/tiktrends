// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * « Prêt pour l'offre V2 ? » · l'écran rendu de bout en bout · le bouton, la
 * VRAIE action serveur, la vraie lecture (`lib/stripe-offre-v2.ts`) et la règle
 * du noyau, face à un client Stripe SIMULÉ (0 appel réel, 0 $). Chaque garde lit
 * le HTML produit · statut en mot, geste, phrase finale, et l'absence de toute
 * valeur de secret.
 */

const h = vi.hoisted(() => ({
  session: null as unknown,
  client: null as unknown,
  getStripe: vi.fn(() => null as unknown),
}));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/stripe', () => ({ getStripe: h.getStripe, priceIdFor: () => null }));

import { EVENEMENTS_WEBHOOK_STRIPE, prixAttendusV2 } from '@tiktrends/core';
import { PretOffreV2 } from '../spatial/vues/admin/offre-v2-client';
import { Paiements } from '../spatial/vues/admin/Paiements';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { lireOffreV2 } from '../lib/stripe-offre-v2';
import { routeStripeEvent } from '../lib/stripe-events';
import { propsPaiements } from './spatial/props-admin';

/** Fausses clés, assemblées à l'exécution · aucune chaîne du dépôt n'a la forme d'une clé Stripe (protection des pushs). */
const faux = (prefixe: string, mode: string, corps: string) => [prefixe, mode, corps].join('_');
const SECRETS = {
  STRIPE_SECRET_KEY: faux('sk', 'live', '51SECRETcleREELLEabcdefghij0123456789'),
  STRIPE_WEBHOOK_SECRET: ['whsec', 'SECRETsignatureWEBHOOK0123456789'].join('_'),
  CRON_SECRET: 'cron-SECRET-tache-planifiee-0123456789',
};
const URL_WH = 'https://app.tiktrends.co/api/stripe/webhook';
const FORFAITS = prixAttendusV2().forfaits;
const idDe = (variable: string) => `price_${variable.toLowerCase()}`;

const FONDATEUR = { user: { id: 'u1', email: 'kguilbaux@agence-glx.fr', name: 'Kevin' }, workspaceId: 'w1', workspaceName: 'GLX', role: 'owner', plan: 'business', equipe: null };
const CLIENT = { ...FONDATEUR, user: { id: 'u2', email: 'client@exemple.fr', name: 'Client' }, role: 'admin' };

/** Un client Stripe simulé · seulement des lectures (aucune méthode d'écriture n'existe). */
function stripeSimule(o: { reel?: boolean; prixEnPanne?: unknown } = {}) {
  const reel = o.reel ?? true;
  const parId = new Map(FORFAITS.map((p) => [idDe(p.variable), {
    id: idDe(p.variable), active: true, currency: 'eur', unit_amount: p.centimes, type: 'recurring', livemode: reel,
    tax_behavior: 'inclusive', recurring: { interval: p.intervalle, interval_count: 1 },
  }]));
  return {
    prices: {
      retrieve: vi.fn(async (id: string, _params?: unknown, _options?: unknown) => {
        if (o.prixEnPanne) throw o.prixEnPanne;
        const p = parId.get(id);
        if (!p) throw Object.assign(new Error(`No such price: '${id}'`), { code: 'resource_missing', statusCode: 404 });
        return p;
      }),
    },
    tax: { settings: { retrieve: vi.fn(async () => { if (o.prixEnPanne) throw o.prixEnPanne; return { status: 'active', status_details: {} }; }) } },
    webhookEndpoints: { list: vi.fn(async () => { if (o.prixEnPanne) throw o.prixEnPanne; return { data: [{ url: URL_WH, status: 'enabled', enabled_events: [...EVENEMENTS_WEBHOOK_STRIPE] }] }; }) },
    billingPortal: {
      configurations: {
        list: vi.fn(async () => {
          if (o.prixEnPanne) throw o.prixEnPanne;
          return { data: [{ is_default: true, features: { subscription_cancel: { enabled: true }, subscription_update: { enabled: true, products: [{ prices: FORFAITS.map((p) => idDe(p.variable)) }] } } }] };
        }),
      },
    },
  };
}

function poserEnv(over: Record<string, string | undefined> = {}) {
  vi.stubEnv('APP_URL', 'https://app.tiktrends.co');
  vi.stubEnv('TARIFS_V2', '');
  for (const [k, v] of Object.entries(SECRETS)) vi.stubEnv(k, v);
  for (const p of FORFAITS) vi.stubEnv(p.variable, idDe(p.variable));
  for (const p of prixAttendusV2().recharges) vi.stubEnv(p.variable, '');
  for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v ?? '');
}

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1, dotation: 2, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root | null = null;
let hote: HTMLDivElement | null = null;
async function monter() {
  hote = document.createElement('div'); document.body.appendChild(hote);
  racine = createRoot(hote);
  await act(async () => { racine!.render(<FournisseurSpatial value={CTX}><PretOffreV2 /></FournisseurSpatial>); });
  return hote;
}
async function verifier(hh: HTMLElement) {
  const b = [...hh.querySelectorAll('button')].find((x) => x.textContent?.includes('Vérifier'));
  expect(b, 'bouton « Vérifier »').toBeTruthy();
  await act(async () => { b!.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const ligne = (hh: ParentNode, cle: string) => hh.querySelector(`[data-cle="${cle}"]`);
const statuts = (hh: ParentNode) => Object.fromEntries([...hh.querySelectorAll('[data-controle-v2]')].map((l) => [l.getAttribute('data-cle'), l.getAttribute('data-controle-v2')]));

/** Aucune valeur de secret, ni même un fragment après son préfixe. */
function sansSecret(html: string) {
  for (const v of Object.values(SECRETS)) {
    expect(html).not.toContain(v);
    expect(html).not.toContain(v.slice(-12));
  }
}

let consoles: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  h.session = FONDATEUR;
  consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
});
afterEach(() => {
  // Aucun secret n'est journalisé, quel que soit le scénario.
  for (const c of consoles) sansSecret(JSON.stringify(c.mock.calls));
  act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null;
  vi.unstubAllEnvs(); vi.restoreAllMocks(); h.getStripe.mockReset();
});

describe('« Prêt pour l’offre V2 ? » · écran rendu, client Stripe simulé', () => {
  it('tout OK · chaque ligne OK, « Tout est prêt, tu peux poser TARIFS_V2=1 », aucun secret', async () => {
    poserEnv();
    const s = stripeSimule();
    h.getStripe.mockReturnValue(s);
    const hh = await monter();
    // Rien n'est lu à l'affichage · seulement au clic.
    expect(h.getStripe).not.toHaveBeenCalled();
    expect(hh.querySelector('[data-offre-v2]')?.getAttribute('data-offre-v2')).toBe('attente');

    await verifier(hh);
    expect(s.prices.retrieve).toHaveBeenCalledTimes(6);
    expect(s.prices.retrieve.mock.calls[0]?.[2]).toEqual({ timeout: 6000, maxNetworkRetries: 0 });
    expect(hh.querySelector('[data-offre-v2]')?.getAttribute('data-offre-v2')).toBe('pret');
    expect(hh.querySelector('[data-phrase]')?.textContent).toContain('Tout est prêt, tu peux poser TARIFS_V2=1');
    const st = statuts(hh);
    expect(Object.entries(st).filter(([, v]) => v !== 'ok')).toEqual([['TARIFS_V2', 'a_faire']]);
    expect(st).toMatchObject({ STRIPE_SECRET_KEY: 'ok', STRIPE_WEBHOOK_SECRET: 'ok', CRON_SECRET: 'ok', 'stripe-tax': 'ok', webhook: 'ok', portail: 'ok', STRIPE_PRICE_AGENCE_ANNUEL: 'ok' });
    expect(ligne(hh, 'STRIPE_SECRET_KEY')?.textContent).toContain('OKClé secrète · STRIPE_SECRET_KEYPosée · mode réel (préfixe sk_live_).');
    expect(ligne(hh, 'STRIPE_PRICE_AGENCE_ANNUEL')?.textContent?.replace(/[\u202f\u00a0]/g, ' ')).toContain('1 083,60 € · EUR · récurrent annuel · taxe incluse · actif');
    sansSecret(hh.innerHTML);
  });

  it('un prix manquant · « À faire » avec son geste, et la phrase le nomme', async () => {
    poserEnv({ STRIPE_PRICE_PRO_ANNUEL: undefined });
    h.getStripe.mockReturnValue(stripeSimule());
    const hh = await monter();
    await verifier(hh);
    const l = ligne(hh, 'STRIPE_PRICE_PRO_ANNUEL');
    expect(l?.getAttribute('data-controle-v2')).toBe('a_faire');
    expect(l?.textContent).toContain('À faire');
    expect(l?.textContent).toContain('Variable absente.');
    expect(l?.textContent).toContain('Geste · Crée dans Stripe le prix 411,60 € · EUR · récurrent annuel · taxe incluse, puis colle son identifiant price_… dans STRIPE_PRICE_PRO_ANNUEL');
    expect(hh.querySelector('[data-offre-v2]')?.getAttribute('data-offre-v2')).toBe('incomplet');
    expect(hh.querySelector('[data-phrase]')?.textContent).toContain('Il manque encore : Pro annuel · STRIPE_PRICE_PRO_ANNUEL');
    expect(hh.textContent).not.toContain('Tout est prêt');
    sansSecret(hh.innerHTML);
  });

  it('clé de test · le mode est dit par le préfixe seulement, jamais prêt', async () => {
    const cleTest = faux('sk', 'test', '51SECRETcleDETESTabcdefghij0123456789');
    poserEnv({ STRIPE_SECRET_KEY: cleTest });
    h.getStripe.mockReturnValue(stripeSimule({ reel: false }));
    const hh = await monter();
    await verifier(hh);
    const l = ligne(hh, 'STRIPE_SECRET_KEY');
    expect(l?.getAttribute('data-controle-v2')).toBe('a_faire');
    expect(l?.textContent).toContain('mode test (préfixe sk_test_)');
    expect(statuts(hh).STRIPE_PRICE_PRO_MENSUEL).toBe('ok');
    expect(hh.querySelector('[data-offre-v2]')?.getAttribute('data-offre-v2')).toBe('incomplet');
    expect(hh.innerHTML).not.toContain(cleTest);
    expect(hh.innerHTML).not.toContain(cleTest.slice(-12));
    sansSecret(hh.innerHTML);
  });

  it('Stripe répond une erreur qui cite la clé · erreur honnête, la clé est masquée', async () => {
    poserEnv();
    h.getStripe.mockReturnValue(stripeSimule({ prixEnPanne: Object.assign(new Error(`Invalid API Key provided: ${SECRETS.STRIPE_SECRET_KEY}`), { statusCode: 401 }) }));
    const hh = await monter();
    await verifier(hh);
    const l = ligne(hh, 'lecture-stripe');
    expect(l?.getAttribute('data-controle-v2')).toBe('erreur');
    expect(l?.textContent).toContain('Invalid API Key provided: sk_live_[masquée]');
    expect(ligne(hh, 'stripe-tax')).toBeNull();
    sansSecret(hh.innerHTML);
  });

  it('réservé au personnel de la plateforme · un administrateur client est refusé sans lecture', async () => {
    poserEnv();
    h.session = CLIENT;
    h.getStripe.mockReturnValue(stripeSimule());
    const hh = await monter();
    await verifier(hh);
    expect(hh.querySelector('[role="alert"]')?.textContent).toBe('Réservé au personnel de la plateforme.');
    expect(h.getStripe).not.toHaveBeenCalled();
    expect(hh.querySelector('[data-controle-v2]')).toBeNull();
  });

  it('la section n’apparaît sur « Stripe & Whop » que pour le personnel (`offreV2`)', () => {
    const rendre = (offreV2: boolean) => renderToStaticMarkup(<FournisseurSpatial value={CTX}><Paiements {...propsPaiements()} controle offreV2={offreV2} /></FournisseurSpatial>);
    expect(rendre(true)).toContain('Prêt pour l’offre V2 ?');
    expect(rendre(false)).not.toContain('Prêt pour l’offre V2 ?');
  });
});

describe('« Prêt pour l’offre V2 ? » · lecture bornée et liste des événements', () => {
  it('Stripe ne répond pas · erreur honnête après le délai, rien de conclu', async () => {
    const jamais = () => new Promise<never>(() => {});
    const muet = { prices: { retrieve: jamais }, tax: { settings: { retrieve: jamais } }, webhookEndpoints: { list: jamais }, billingPortal: { configurations: { list: jamais } } };
    const env = { ...SECRETS, ...Object.fromEntries(FORFAITS.map((p) => [p.variable, idDe(p.variable)])) };
    const d = await lireOffreV2(muet, env, { delaiMs: 30, urlWebhook: URL_WH });
    expect(d.lignes.find((l) => l.cle === 'lecture-stripe')).toMatchObject({ statut: 'erreur', detail: 'Stripe n’a pas répondu en 0,03 s.' });
    expect(d.pret).toBe(false);
    expect(d.lignes.find((l) => l.cle === 'STRIPE_PRICE_PRO_MENSUEL')?.statut).toBe('a_faire');
  });

  it('la liste des événements attendus est celle que le routeur traite', () => {
    const src = readFileSync(join(__dirname, '../lib/stripe-events.ts'), 'utf8');
    const cases = [...src.matchAll(/case '([a-z_.]+)':/g)].map((m) => m[1]);
    expect([...cases].sort()).toEqual([...EVENEMENTS_WEBHOOK_STRIPE].sort());
    for (const type of EVENEMENTS_WEBHOOK_STRIPE) {
      const r = routeStripeEvent({ type, data: { object: { metadata: {} } } } as never, () => null);
      expect(r.kind === 'ignore' ? r.reason : '').not.toMatch(/type non traité/);
    }
  });
});
