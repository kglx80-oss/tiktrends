import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { anthropicFromEnv } from '@tiktrends/ai';
import { REESSAIS_AUTOMATIQUES_PAYANTS, reessaiPermis, FAMILLES_SANS_FACTURE, FAMILLES_FACTUREES } from '@tiktrends/core';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';

/**
 * R3 · aucun réessai payant implicite.
 *
 * ── Le défaut (contre-recette du 8 octobre) ──────────────────────────────────
 * `new Anthropic({ apiKey })` sans `maxRetries` : le SDK rejoue de lui-même
 * deux fois une requête coupée (ou 408, 409, 429, 5xx). Une coupure APRÈS
 * envoi peut avoir été facturée · une seule réservation du plafond couvrait
 * alors jusqu'à trois tentatives payantes.
 *
 * ── La garde lit un RÉSULTAT ─────────────────────────────────────────────────
 * Le VRAI client du SDK, construit par `anthropicFromEnv` (clé factice,
 * `ANTHROPIC_BASE_URL` vers un faux serveur local), envoie un appel ; le
 * serveur lit la requête puis coupe la connexion. On compte les requêtes
 * REÇUES par le serveur : exactement 1. Aucun réseau sortant, 0 $.
 */

let srv: FauxServeur;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL };

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-r3';
  process.env.ANTHROPIC_BASE_URL = srv.url;
});
afterAll(async () => {
  await srv.fermer();
  if (env.cle === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = env.cle;
  if (env.url === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = env.url;
});

const appel = { model: 'claude-sonnet-5', max_tokens: 16, messages: [{ role: 'user' as const, content: 'bonjour' }] };

describe('client Anthropic · une requête coupée n’est JAMAIS rejouée', () => {
  it('coupure après réception · le serveur reçoit exactement 1 requête', async () => {
    srv.comportement({ type: 'coupure' });
    const e = await anthropicFromEnv()!.messages.create(appel).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(srv.requetes(), `le client a rejoué une requête possiblement facturée · ${srv.requetes()} requêtes reçues pour une seule réservation (maxRetries doit valoir 0)`).toBe(1);
  });

  it.each([429, 500, 529])('statut %i · 1 requête, aucun réessai', async (statut) => {
    srv.comportement({ type: 'statut', statut });
    const e = await anthropicFromEnv()!.messages.create(appel).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(srv.requetes(), `statut ${statut} rejoué par le client · ${srv.requetes()} requêtes reçues`).toBe(1);
  });

  it('la constante vaut 0', () => {
    expect(REESSAIS_AUTOMATIQUES_PAYANTS).toBe(0);
  });
});

describe('politique de réessai (règle pure)', () => {
  it('idempotent ⇒ permis ; refus certain avant traitement ⇒ permis ; tout le reste ⇒ refusé', () => {
    expect(reessaiPermis({ famille: 'service', idempotent: true })).toBe(true);
    for (const f of FAMILLES_SANS_FACTURE) expect(reessaiPermis({ famille: f, idempotent: false }), f).toBe(true);
    for (const f of FAMILLES_FACTUREES) expect(reessaiPermis({ famille: f, idempotent: false }), `réessai permis sur « ${f} » · la première tentative a pu être facturée`).toBe(false);
    expect(reessaiPermis({ famille: 'jamais-vue', idempotent: false })).toBe(false);
  });
});
