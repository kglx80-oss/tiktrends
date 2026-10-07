import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L3 · COST-12 · quota (ligne incluse à 0) + crédits, sur DEUX marques.
 * Chaque coût est attribué UNE fois à espace / marque / projet / job / devis /
 * release épinglée, et le solde de l'espace ne bouge que du prix des sorties
 * payantes livrées. Plus : l'épinglage de la release au devis (cahier 01 §8.2).
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));

import { db, schema, eq } from '@tiktrends/db';
import { CREDIT_COSTS, type SnapshotJob } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, jusquAuBout, etatEnBase } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';

const ids = etat.ids;
const IMAGE = CREDIT_COSTS.image;
const R1 = 'a'.repeat(64);
const R2 = 'b'.repeat(64);
let release1 = '';
let release2 = '';

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 50);
  const [r1] = await db.insert(schema.studioPromptReleases).values({ scope: 'workspace', workspaceId: ids.wsA, entries: {}, releaseHash: R1, status: 'active', reason: 'test' }).returning();
  const [r2] = await db.insert(schema.studioPromptReleases).values({ scope: 'workspace', workspaceId: ids.wsA, entries: {}, releaseHash: R2, status: 'active', reason: 'test' }).returning();
  release1 = r1!.id;
  release2 = r2!.id;
  await db.insert(schema.studioPromptActive).values({ scope: 'workspace', workspaceId: ids.wsA, releaseId: release1 });
});

async function lancer(projectId: string, operations: string[], cle: string) {
  const d = await creerDevis(ctxDe(ids, 'ua'), { projectId, operations, variante: true });
  if (!d.ok) throw new Error(`${d.code} ${d.message}`);
  const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: cle }, { illimite: false });
  if (!r.ok) throw new Error(`${r.code} ${r.message}`);
  return { devis: d.devis, jobId: r.job.id };
}

describe('COST-12 · quota et attribution sur deux marques', () => {
  it('ligne incluse + ligne payante (marque A1), ligne incluse seule (marque A2) ⇒ chaque coût attribué une fois', async () => {
    const p1 = await projetTest(db, ids, ids.brandA1, ids.ua);
    const p2 = await projetTest(db, ids, ids.brandA2, ids.ua);
    const s0 = await solde(db, ids.wsA);
    const a = await lancer(p1.projectId, ['keyframe:s_ouverture', 'composition'], 'attribution-a1');
    const b = await lancer(p2.projectId, ['composition'], 'attribution-a2');
    expect(a.devis.maximumCredits).toBe(IMAGE);
    expect(b.devis.maximumCredits).toBe(0);
    expect(b.devis.lignes.every((l) => l.inclus)).toBe(true);

    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, a.jobId)).toBe('completed');
    expect(await jusquAuBout(db, w.moteur, b.jobId)).toBe('completed');

    const ea = await etatEnBase(db, a.jobId);
    const eb = await etatEnBase(db, b.jobId);
    for (const [e, brand, projet, devis] of [[ea, ids.brandA1, p1.projectId, a.devis.id], [eb, ids.brandA2, p2.projectId, b.devis.id]] as const) {
      expect(e.violations).toEqual([]);
      expect([e.reserves, e.reglements]).toEqual([1, 1]);
      for (const m of e.registre) expect({ ws: m.workspaceId, brand: m.brandId, projet: m.projectId, job: m.jobId, devis: m.quoteId }).toEqual({ ws: ids.wsA, brand, projet, job: e.job.id, devis });
      expect(e.job.promptReleaseId).toBe(release1);
      expect((e.job.snapshot as SnapshotJob).epinglage).toEqual({ promptReleaseId: release1, releaseHash: R1 });
    }
    // Sommes par marque · réglées une fois.
    const regle = async (brandId: string) => (await db.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.brandId, brandId)))
      .filter((m) => m.kind === 'settle').reduce((s, m) => s + m.credits, 0);
    expect(await regle(ids.brandA1)).toBe(IMAGE);
    expect(await regle(ids.brandA2)).toBe(0);
    // Crédits de l'espace : un seul débit, celui de la ligne payante, relié au job par sa référence.
    expect(ea.credits.map((c) => [c.delta, c.refId])).toEqual([[-IMAGE, `studio:job:${a.jobId}:reserve`]]);
    expect(eb.credits).toEqual([]);
    expect(await solde(db, ids.wsA)).toBe(s0 - IMAGE);
    // Devis : release épinglée et visible dans l'audit.
    const [q] = await db.select().from(schema.studioQuotes).where(eq(schema.studioQuotes.id, a.devis.id));
    expect(q!.promptReleaseId).toBe(release1);
    const audit = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, a.devis.id));
    expect(audit.map((x) => [x.action, (x.details as { releaseHash?: string }).releaseHash])).toEqual([['quote.create', R1]]);
  });
});

describe('épinglage · le devis garde SA release, un changement d’ADMIN ne vaut que pour les futurs devis', () => {
  it('pointeur déplacé après le devis ⇒ le devis approuvé exécute la release épinglée ; un nouveau devis prend la nouvelle', async () => {
    const p = await projetTest(db, ids, ids.brandA1, ids.ua);
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_fin'] });
    if (!d.ok) throw new Error(d.code);
    expect(d.devis.promptReleaseId).toBe(release1);
    await db.update(schema.studioPromptActive).set({ releaseId: release2, previousReleaseId: release1 }).where(eq(schema.studioPromptActive.workspaceId, ids.wsA));
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: 'epingle-1' }, { illimite: false });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const [j] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
    expect(j!.promptReleaseId).toBe(release1);
    const d2 = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_fin'] });
    expect(d2.ok && d2.devis.promptReleaseId).toBe(release2);
    expect(d2.ok && d2.devis.inputHash).not.toBe(d.devis.inputHash);
    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, r.job.id)).toBe('completed');
  });

  it('release épinglée révoquée ⇒ approbation refusée avec motif, rien écrit', async () => {
    const p = await projetTest(db, ids, ids.brandA1, ids.ua);
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_fin'] });
    if (!d.ok) throw new Error(d.code);
    expect(d.devis.promptReleaseId).toBe(release2);
    await db.update(schema.studioPromptReleases).set({ evaluation: { revocation: { motif: 'consigne fautive' } } }).where(eq(schema.studioPromptReleases.id, release2));
    const n = (await db.select().from(schema.studioJobs)).length;
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: 'revoquee-1' }, { illimite: false });
    expect(!r.ok && [r.code, r.message]).toEqual(['UNSUPPORTED_CAPABILITY', expect.stringMatching(/consigne fautive/)]);
    expect((await db.select().from(schema.studioJobs)).length).toBe(n);
    // Et un nouveau devis sur une release révoquée est refusé (aucun repli).
    const d3 = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_fin'] });
    expect(!d3.ok && d3.code).toBe('UNSUPPORTED_CAPABILITY');
  });
});
