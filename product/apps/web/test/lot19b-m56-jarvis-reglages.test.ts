import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Message 56 · les actions « Règles » et « Entraînement » de Jarvis
 * (`app/actions/jarvis.ts`) respectent la feature `jarvis` (offre Core,
 * matrice d'équipe) EN PLUS du rôle admin qu'elles exigeaient déjà.
 *
 * Défaut reproduit avant correction : un admin d'un espace Starter, ou un
 * membre d'équipe sans rubrique Jarvis (`freelance`) propriétaire de son
 * espace, passait le seul contrôle `admin` · il réécrivait les règles et les
 * apprentissages de sa marque, et `proposeJarvisRulesAction` /
 * `trainJarvisAction` appelaient le modèle (dépense + crédits).
 *
 * Résultats vérifiés, jamais la présence d'un appel :
 *  - refus · la ligne de la marque, le solde, le grand livre des crédits et la
 *    table `ai_spend` sont IDENTIQUES avant et après, et le faux fournisseur
 *    local n'a reçu AUCUNE requête ;
 *  - autorisé (admin Core, fondateur) · le faux fournisseur reçoit la requête,
 *    la dépense passe par `guardedAnthropic` (ligne `ai_spend`), l'écriture a lieu ;
 *  - périmètre · la marque active est déjà validée dans l'espace (une marque
 *    d'un autre espace donne « marque active » et zéro effet) · non reproduit.
 *
 * Aucun vrai fournisseur · `ANTHROPIC_BASE_URL` pointe sur un serveur HTTP local.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsS: randomUUID(), wsB: randomUUID(), wsC: randomUUID(), bS: randomUUID(), bB: randomUUID(), bC: randomUUID(), u: randomUUID() };
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

import { eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { saveJarvisRulesAction, proposeJarvisRulesAction, trainJarvisAction, saveJarvisLearningsAction } from '../app/actions/jarvis';
import { TEXTE_REFUS_JARVIS } from '../lib/jarvis-acces';

/* Faux fournisseur · réponse NON streamée (les deux appels du lot sont simples). */
const recues: Array<{ system: string }> = [];
let serveur: Server;
beforeAll(async () => {
  serveur = createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      const r = JSON.parse(corps || '{}') as { system?: string; model?: string };
      recues.push({ system: String(r.system ?? '') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_local', type: 'message', role: 'assistant', model: r.model, content: [{ type: 'text', text: 'PROPOSITION_LOCALE_56 · une règle simulée.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  delete process.env.TRENDTRACK_API_KEY; // aucune veille réseau · le corpus vient des KPIs synthétiques
  delete process.env.AI_SPEND_CAP_USD;

  const top = { topAds: [{ name: 'Créa A gagnante', roas: 3, purchases: 12 }, { name: 'Créa B gagnante', roas: 2.5, purchases: 9 }, { name: 'Créa C gagnante', roas: 2, purchases: 7 }] };
  await db.insert(schema.workspaces).values([
    { id: ids.wsS, name: 'Starter 56', plan: 'starter', creditsBalance: 100 },
    { id: ids.wsB, name: 'Business 56', plan: 'business', creditsBalance: 100 },
    { id: ids.wsC, name: 'Core 56', plan: 'core', creditsBalance: 100 },
  ]);
  await db.insert(schema.brands).values([
    { id: ids.bS, workspaceId: ids.wsS, name: 'Marque S', creativeRules: 'REGLES_AVANT', jarvisLearnings: 'APPRIS_AVANT', adsInsights: top },
    { id: ids.bB, workspaceId: ids.wsB, name: 'Marque B', creativeRules: 'REGLES_AVANT', jarvisLearnings: 'APPRIS_AVANT', adsInsights: top },
    { id: ids.bC, workspaceId: ids.wsC, name: 'Marque C', creativeRules: 'REGLES_AVANT', jarvisLearnings: 'APPRIS_AVANT', adsInsights: top },
  ]);
});
afterAll(async () => { await new Promise<void>((ok) => serveur.close(() => ok())); });
beforeEach(() => { h.session = null; h.marque = ''; });

const base = (ws: string, o: Record<string, unknown>) => ({ user: { id: ids.u, email: 'client-56@synth.test', name: null }, workspaceId: ws, workspaceName: 'X', ...o });

/** L'état observable · marques, soldes, grand livre, dépense, fournisseur. */
async function etat() {
  const marques = await db.select({ id: schema.brands.id, r: schema.brands.creativeRules, l: schema.brands.jarvisLearnings, t: schema.brands.jarvisTrainedAt }).from(schema.brands).where(inArray(schema.brands.id, [ids.bS, ids.bB, ids.bC]));
  const soldes = await db.select({ id: schema.workspaces.id, c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(inArray(schema.workspaces.id, [ids.wsS, ids.wsB, ids.wsC]));
  const ledger = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.creditLedger))[0]!.n;
  const depense = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.aiSpend))[0]!.n;
  return { marques: marques.sort((a, b) => a.id.localeCompare(b.id)), soldes: soldes.sort((a, b) => a.id.localeCompare(b.id)), ledger, depense, fournisseur: recues.length };
}

const ACTIONS: Array<[string, () => Promise<{ error?: string }>]> = [
  ['saveJarvisRulesAction', () => saveJarvisRulesAction({ creativeRules: 'REGLES_INTRUS' })],
  ['proposeJarvisRulesAction', () => proposeJarvisRulesAction()],
  ['trainJarvisAction', () => trainJarvisAction()],
  ['saveJarvisLearningsAction', () => saveJarvisLearningsAction({ learnings: 'APPRIS_INTRUS' })],
];

const REFUSES: Array<[string, () => unknown, string, string]> = [
  ['admin d’un espace Starter', () => base(ids.wsS, { role: 'admin', plan: 'starter', equipe: null }), ids.bS, TEXTE_REFUS_JARVIS.plan],
  ['owner d’un espace Starter', () => base(ids.wsS, { role: 'owner', plan: 'starter', equipe: null }), ids.bS, TEXTE_REFUS_JARVIS.plan],
  ['membre d’équipe freelance, owner de son espace Business', () => base(ids.wsB, { role: 'owner', plan: 'business', equipe: { role: 'freelance', matrice: {} } }), ids.bB, TEXTE_REFUS_JARVIS.role],
];

describe('refus · feature `jarvis` · zéro effet', () => {
  for (const [nom, session, marque, phrase] of REFUSES) {
    for (const [action, appel] of ACTIONS) {
      it(`${nom} · ${action} → refus, rien écrit, rien dépensé, rien envoyé`, async () => {
        h.session = session(); h.marque = marque;
        const avant = await etat();
        const r = await appel();
        expect(r.error, 'aucun refus').toBe(phrase);
        expect(await etat(), 'un effet a eu lieu malgré le refus').toEqual(avant);
      });
    }
  }
  it('rôle d’espace insuffisant (membre Core) · refus admin inchangé, zéro effet', async () => {
    h.session = base(ids.wsC, { role: 'member', plan: 'core', equipe: null }); h.marque = ids.bC;
    const avant = await etat();
    for (const [, appel] of ACTIONS) expect((await appel()).error).toContain('rôle administrateur');
    expect(await etat()).toEqual(avant);
  });
});

describe('périmètre de marque · déjà tenu (non reproduit)', () => {
  it('admin Core avec la marque d’un AUTRE espace en cookie · « marque active », zéro effet', async () => {
    h.session = base(ids.wsC, { role: 'admin', plan: 'core', equipe: null }); h.marque = ids.bB;
    const avant = await etat();
    for (const [, appel] of ACTIONS) expect((await appel()).error).toContain('marque active');
    expect(await etat()).toEqual(avant);
  });
});

describe('parcours autorisés inchangés · faux fournisseur local', () => {
  it('admin Core · règles et apprentissages enregistrés', async () => {
    h.session = base(ids.wsC, { role: 'admin', plan: 'core', equipe: null }); h.marque = ids.bC;
    expect((await saveJarvisRulesAction({ creativeRules: 'REGLES_CORE' })).error).toBeUndefined();
    expect((await saveJarvisLearningsAction({ learnings: 'APPRIS_CORE' })).error).toBeUndefined();
    const [b] = await db.select().from(schema.brands).where(eq(schema.brands.id, ids.bC));
    expect([b!.creativeRules, b!.jarvisLearnings]).toEqual(['REGLES_CORE', 'APPRIS_CORE']);
  });

  it('admin Core · proposer les règles · une requête au faux fournisseur, une dépense sous plafond, 5 crédits', async () => {
    h.session = base(ids.wsC, { role: 'admin', plan: 'core', equipe: null }); h.marque = ids.bC;
    const avant = await etat();
    const r = await proposeJarvisRulesAction();
    expect(r.error).toBeUndefined();
    expect(r.rules).toContain('PROPOSITION_LOCALE_56');
    const apres = await etat();
    expect(apres.fournisseur).toBe(avant.fournisseur + 1);
    expect(apres.depense).toBe(avant.depense + 1);
    expect(apres.soldes.find((x) => x.id === ids.wsC)!.c).toBe(avant.soldes.find((x) => x.id === ids.wsC)!.c - 5);
  });

  it('admin Core · entraîner · une requête, une dépense, apprentissages écrits', async () => {
    h.session = base(ids.wsC, { role: 'admin', plan: 'core', equipe: null }); h.marque = ids.bC;
    const avant = await etat();
    const r = await trainJarvisAction();
    expect(r.error).toBeUndefined();
    const apres = await etat();
    expect(apres.fournisseur).toBe(avant.fournisseur + 1);
    expect(apres.depense).toBe(avant.depense + 1);
    expect(apres.marques.find((x) => x.id === ids.bC)!.l).toContain('PROPOSITION_LOCALE_56');
  });

  it('fondateur (espace Starter, accès total) · autorisé, crédits illimités', async () => {
    h.session = base(ids.wsS, { role: 'owner', plan: 'starter', user: { id: ids.u, email: 'kguilbaux@agence-glx.fr', name: null }, equipe: { role: 'adminplus', matrice: {} } }); h.marque = ids.bS;
    const avant = await etat();
    const r = await proposeJarvisRulesAction();
    expect(r.error).toBeUndefined();
    expect(r.cost).toBe(0);
    const apres = await etat();
    expect(apres.fournisseur).toBe(avant.fournisseur + 1);
    expect(apres.depense).toBe(avant.depense + 1);
    expect((await saveJarvisRulesAction({ creativeRules: 'REGLES_FONDATEUR' })).error).toBeUndefined();
  });
});
