import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Lot 6 · le Jarvis « règles créatives de marque » est unifié sur le
 * PromptResolver · `proposeJarvisRulesAction` laisse désormais une trace
 * `studio_prompt_runs` comme le reste des studios (matrice 9.4), SANS dépense
 * nouvelle.
 *
 * Résultats LUS sur une vraie base (pglite + migrations réelles), jamais la
 * présence d'un appel :
 *
 *  · autorisé (admin Core) · UN seul appel au faux fournisseur, UNE ligne
 *    `ai_spend`, 5 crédits réservés (coût INCHANGÉ), ET une ligne
 *    `studio_prompt_runs` neuve : `templateKey = jarvis.regles_marque`,
 *    `promptReleaseId` = la release EN VIGUEUR (non nulle, release publiée),
 *    `status = succeeded`, `costUsdMicros` = coût réel des jetons (> 0),
 *    `credits = 5` ;
 *  · refus (admin d'un espace Starter · feature `jarvis` fermée) · AVANT tout
 *    appel : aucune requête au fournisseur, aucun crédit bougé, AUCUNE trace.
 *
 * Mutations qui doivent faire TOMBER cette garde (vérifiées à la main, cf. PR) :
 *  · retirer `consignerRunReglesMarque` de l'action → aucune trace → le test
 *    « une trace neuve » tombe ;
 *  · retirer le garde `refusJarvis` → l'admin Starter passe, trace + dépense →
 *    le test « refus · rien écrit » tombe.
 *
 * Aucun vrai fournisseur · `ANTHROPIC_BASE_URL` pointe un serveur HTTP local.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsCore: randomUUID(), wsStarter: randomUUID(), bCore: randomUUID(), bStarter: randomUUID(), u: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown, marque: '' as string }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (k === 'tt_brand' && h.marque ? { value: h.marque } : undefined) }) }));

import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { costOfTokens, CLE_REGLES_MARQUE } from '@tiktrends/core';
import { proposeJarvisRulesAction } from '../app/actions/jarvis';
import { microsUsd } from '../lib/studios/prompts/traces';
import { TEXTE_REFUS_JARVIS } from '../lib/jarvis-acces';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { publierRegistreDeTest } from './l2-outils';

const JETONS = { entree: 120, sortie: 40 };
let releaseId = '';
const recues: number[] = [];
let serveur: Server;

beforeAll(async () => {
  serveur = createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      recues.push(1);
      const r = JSON.parse(corps || '{}') as { model?: string };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_local', type: 'message', role: 'assistant', model: r.model, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: 'Style visuel : lumineux.\nTon : direct.' }], usage: { input_tokens: JETONS.entree, output_tokens: JETONS.sortie } }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  delete process.env.TRENDTRACK_API_KEY;
  delete process.env.AI_SPEND_CAP_USD;

  await db.insert(schema.workspaces).values([
    { id: ids.wsCore, name: 'Core 6', plan: 'core', creditsBalance: 100 },
    { id: ids.wsStarter, name: 'Starter 6', plan: 'starter', creditsBalance: 100 },
  ]);
  await db.insert(schema.brands).values([
    { id: ids.bCore, workspaceId: ids.wsCore, name: 'Marque Core', category: 'cosmétique', competitors: ['RivalA'] },
    { id: ids.bStarter, workspaceId: ids.wsStarter, name: 'Marque Starter' },
  ]);

  // Une release RÉELLEMENT publiée · c'est elle que la run doit tracer.
  releaseId = await publierRegistreDeTest(depot);
});
afterAll(async () => { await new Promise<void>((ok) => serveur.close(() => ok())); });
beforeEach(() => { h.session = null; h.marque = ''; });

const base = (ws: string, o: Record<string, unknown>) => ({ user: { id: ids.u, email: 'admin6@synth.test', name: null }, workspaceId: ws, workspaceName: 'X', ...o });

async function compteurs() {
  const runs = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.studioPromptRuns))[0]!.n;
  const depense = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiSpend))[0]!.n;
  const solde = (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsStarter)))[0]!.c;
  return { runs, depense, solde, fournisseur: recues.length };
}

describe('autorisé · admin Core · une trace studio_prompt_runs, coût inchangé', () => {
  it('UN appel, UNE dépense, 5 crédits · une trace release/status/coût/crédits', async () => {
    h.session = base(ids.wsCore, { role: 'admin', plan: 'core', equipe: null }); h.marque = ids.bCore;
    const soldeAvant = (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsCore)))[0]!.c;
    const runsAvant = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.studioPromptRuns))[0]!.n;
    const depAvant = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiSpend))[0]!.n;
    const fourAvant = recues.length;

    const r = await proposeJarvisRulesAction();
    expect(r.error).toBeUndefined();
    expect(r.rules).toContain('Style visuel');
    expect(r.cost).toBe(5);

    // Coût INCHANGÉ : un seul appel IA, une seule ligne de dépense, 5 crédits.
    expect(recues.length).toBe(fourAvant + 1);
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiSpend))[0]!.n).toBe(depAvant + 1);
    const soldeApres = (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsCore)))[0]!.c;
    expect(soldeApres).toBe(soldeAvant - 5);

    // La trace neuve · release réellement consommée, statut, coût, crédits.
    const runs = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.templateKey, CLE_REGLES_MARQUE));
    expect(runs.length).toBe(1);
    const run = runs[0]!;
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(schema.studioPromptRuns))[0]!.n).toBe(runsAvant + 1);
    expect(run.promptReleaseId, 'la release réellement consommée doit être tracée').toBe(releaseId);
    expect(run.status).toBe('succeeded');
    expect(run.workspaceId).toBe(ids.wsCore);
    expect(run.brandId).toBe(ids.bCore);
    expect(run.credits).toBe(5);
    // Coût réel des jetons = exactement ce que le garde de dépense a réglé.
    expect(run.costUsdMicros).toBe(microsUsd(costOfTokens(run.model, JETONS.entree, JETONS.sortie)));
    expect(run.costUsdMicros).toBeGreaterThan(0);
    expect(run.compiledHash).toBeTruthy();
    expect(run.contextSnapshotHash).toBeTruthy();
  });
});

describe('refus · admin d’un espace Starter · AVANT tout appel, rien écrit', () => {
  it('feature `jarvis` fermée · refus, aucune requête, aucun crédit, aucune trace', async () => {
    h.session = base(ids.wsStarter, { role: 'admin', plan: 'starter', equipe: null }); h.marque = ids.bStarter;
    const avant = await compteurs();
    const r = await proposeJarvisRulesAction();
    expect(r.error).toBe(TEXTE_REFUS_JARVIS.plan);
    expect(await compteurs(), 'un effet a eu lieu malgré le refus `jarvis`').toEqual(avant);
  });
});
