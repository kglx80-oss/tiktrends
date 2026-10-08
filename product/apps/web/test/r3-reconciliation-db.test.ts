import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * R3 · une issue incertaine se VOIT et se RÉCONCILIE.
 *
 * Base réelle (pglite, migrations du dépôt dont 0055), VRAI client du SDK
 * (`anthropicFromEnv` derrière `guardedAnthropic`), faux serveur Anthropic
 * local qui coupe, refuse ou répond. On lit les RÉSULTATS : requêtes reçues,
 * ligne `ai_spend` (montant, cause), lecture « à réconcilier ».
 *
 *  · coupure après envoi ⇒ 1 requête, ligne au MAXIMUM, marquée, listée ;
 *  · 429 / 5xx ⇒ idem, avec leur cause ;
 *  · refus 400 ⇒ ligne rendue (0 $), non marquée, non listée ;
 *  · réussite ⇒ réglée au réel, non listée ;
 *  · une ligne marquée n'est plus libérable automatiquement.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq, annulerDepense, type BaseDepense } from '@tiktrends/db';
import { costOfTokens } from '@tiktrends/core';
import { guardedAnthropic, coutMaximalAppel, depensesAReconcilier } from '../lib/spend-guard';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';

let srv: FauxServeur;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, cap: process.env.AI_SPEND_CAP_USD };

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-r3';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.AI_SPEND_CAP_USD = '5';
});
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.cle], ['ANTHROPIC_BASE_URL', env.url], ['AI_SPEND_CAP_USD', env.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(async () => { await db!.delete(schema.aiSpend); });

const APPEL = { model: 'claude-sonnet-5', max_tokens: 400, system: 'Tu réponds en français.', messages: [{ role: 'user' as const, content: 'Écris une accroche · « café » ☕' }] };
const MAX = coutMaximalAppel(APPEL);
const lignes = (action: string) => db!.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, action));
const lancer = async (action: string, options?: Record<string, unknown>) => {
  const c = guardedAnthropic({ workspaceId: randomUUID(), action })!;
  return c.messages.create(APPEL, options as never).then(() => 'ok', (e: unknown) => e);
};

describe('issue incertaine · réservation au maximum, marquée, listée', () => {
  it('coupure après envoi ⇒ 1 requête, ligne au maximum, cause « coupure », listée pour le propriétaire', async () => {
    srv.comportement({ type: 'coupure' });
    expect(await lancer('r3:coupure')).toBeInstanceOf(Error);
    expect(srv.requetes(), 'réessai implicite après coupure').toBe(1);
    const l = await lignes('r3:coupure');
    expect(l.map((x) => ({ est: x.estimatedUsd, reel: x.actualUsd, cause: x.reconcileReason })), 'la coupure n’est pas marquée à réconcilier')
      .toEqual([{ est: MAX, reel: MAX, cause: 'coupure' }]);
    const vue = await depensesAReconcilier();
    expect(vue.lignes.map((x) => [x.id, x.cause, x.actualUsd])).toEqual([[l[0]!.id, 'coupure', MAX]]);
    expect(vue.lignes[0]!.causeLisible).toBe('connexion coupée ou réponse perdue après envoi');
    expect(vue.resume).toBe(`1 dépense à réconcilier · ${MAX.toFixed(2).replace('.', ',')} $ comptés au plafond au maximum, en attendant la facture.`);
  });

  it.each([[429, 'saturation'], [500, 'service'], [529, 'service']] as const)('statut %i ⇒ 1 requête, maximum gardé, cause « %s »', async (statut, cause) => {
    srv.comportement({ type: 'statut', statut });
    expect(await lancer(`r3:${statut}`)).toBeInstanceOf(Error);
    expect(srv.requetes()).toBe(1);
    expect((await lignes(`r3:${statut}`)).map((x) => [x.actualUsd, x.reconcileReason])).toEqual([[MAX, cause]]);
  });

  it('une option d’appel ne relève pas les réessais · { maxRetries: 3 } ⇒ toujours 1 requête', async () => {
    srv.comportement({ type: 'coupure' });
    expect(await lancer('r3:option', { maxRetries: 3 })).toBeInstanceOf(Error);
    expect(srv.requetes(), `l’option d’appel a relevé les réessais · ${srv.requetes()} requêtes pour une réservation`).toBe(1);
  });

  it('pas de libération automatique d’une ligne marquée', async () => {
    srv.comportement({ type: 'coupure' });
    await lancer('r3:collee');
    const [l] = await lignes('r3:collee');
    expect(await annulerDepense(db as unknown as BaseDepense, l!.id), 'une ligne à réconcilier a été libérée automatiquement').toBe(false);
    expect((await lignes('r3:collee'))[0]!.actualUsd).toBe(MAX);
  });
});

describe('issue certaine · rien à réconcilier', () => {
  it('refus 400 ⇒ ligne rendue (0 $), non marquée, non listée', async () => {
    srv.comportement({ type: 'statut', statut: 400 });
    expect(await lancer('r3:400')).toBeInstanceOf(Error);
    expect(srv.requetes()).toBe(1);
    expect((await lignes('r3:400')).map((x) => [x.estimatedUsd, x.actualUsd, x.reconcileReason])).toEqual([[MAX, 0, null]]);
    expect((await depensesAReconcilier()).lignes).toEqual([]);
    expect((await depensesAReconcilier()).resume).toBe('Aucune dépense à réconcilier.');
  });

  it('réussite ⇒ réglée au réel lu dans la réponse, non listée', async () => {
    srv.comportement({ type: 'ok', entree: 120, sortie: 30 });
    expect(await lancer('r3:ok')).toBe('ok');
    expect((await lignes('r3:ok')).map((x) => [x.actualUsd, x.inputTokens, x.reconcileReason])).toEqual([[costOfTokens('claude-sonnet-5', 120, 30), 120, null]]);
    expect((await depensesAReconcilier()).lignes).toEqual([]);
  });
});
