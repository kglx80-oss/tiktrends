import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';

/**
 * L3 · concurrence RÉELLE sur Postgres 16 · DEUX connexions distinctes (pas
 * pglite, qui sérialise tout). Lancé seulement si `L3_PG_URL` désigne une base
 * LOCALE (127.0.0.1 / localhost) ; sinon ignoré (la CI n'a pas de Postgres).
 *
 *   L3_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l3 \
 *   L3_BANC_JOURNAL=/chemin/journal.json pnpm exec vitest run test/l3-concurrence-pg.test.ts
 *
 * COST-03 · deux onglets réservent le DERNIER budget en même temps : une seule
 * réservation, jamais de solde négatif, sur 25 manches.
 * COST-01 · double clic même clé sur deux connexions : un job, une réserve.
 * Worker · deux workers réclament en parallèle : chaque job pris une fois.
 * Banc · scénarios COST complets avec deux workers, journal JSON des
 * transitions et du registre, sommes vérifiées.
 */

const URL_PG = process.env.L3_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import { schema, sql, inArray } from '@tiktrends/db';
import { CREDIT_COSTS, violationsRegistreJob, bilanRegistre } from '@tiktrends/core';
import { semer, idsStudios } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, secondWorker, etatEnBase, jusquAuBout } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile, annulerJob } from '../lib/studios/execution/commandes';
import type { BaseStudio } from '../lib/studios/execution/types';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';

const IMAGE = CREDIT_COSTS.image;
const ids = idsStudios();
let c1: BaseStudio;
let c2: BaseStudio;
let projet = { projectId: '', versionId: '' };

/** Une connexion = une instance du VRAI module `@tiktrends/db` (son propre client postgres). */
async function connexion(): Promise<BaseStudio> {
  vi.resetModules();
  process.env.DATABASE_URL = URL_PG;
  const m = await import('@tiktrends/db');
  delete process.env.DATABASE_URL;
  return m.db as BaseStudio;
}

async function pid(b: BaseStudio): Promise<number> {
  const r = await b.transaction(async (tx) => tx.execute(sql`select pg_backend_pid() as pid`));
  const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ pid: number }>;
  return Number(rows[0]!.pid);
}

describe.skipIf(!LOCALE)('Postgres réel · deux connexions', () => {
  beforeAll(async () => {
    c1 = await connexion();
    c2 = await connexion();
    await semer(c1, schema, ids);
    projet = await projetTest(c1, ids, ids.brandA1, ids.ua);
  });
  afterAll(async () => {
    for (const c of [c1, c2]) await (c as unknown as { session: { client: { end: () => Promise<void> } } }).session.client.end().catch(() => {});
  });

  async function devis(c: BaseStudio) {
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true }, c);
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    return d.devis;
  }

  it('les deux clients sont deux sessions Postgres distinctes', async () => {
    const [a, b] = await Promise.all([pid(c1), pid(c2)]);
    expect(a).not.toBe(b);
  });

  it('COST-03 · deux onglets, dernier budget, 25 manches ⇒ toujours UNE réservation, jamais de solde négatif', async () => {
    const issues: string[] = [];
    for (let manche = 0; manche < 25; manche++) {
      await poserSolde(c1, ids.wsA, IMAGE);
      const [q1, q2] = [await devis(c1), await devis(c2)];
      const [r1, r2] = await Promise.all([
        approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q1.id, inputHash: q1.inputHash, creditsAnnonces: q1.maximumCredits, idempotencyKey: `onglet1-${q1.id}` }, { illimite: false, base: c1 }),
        approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q2.id, inputHash: q2.inputHash, creditsAnnonces: q2.maximumCredits, idempotencyKey: `onglet2-${q2.id}` }, { illimite: false, base: c2 }),
      ]);
      const ok = [r1, r2].filter((r) => r.ok).length;
      const refus = [r1, r2].filter((r) => !r.ok && r.code === 'BUDGET_EXCEEDED').length;
      const s = await solde(c1, ids.wsA);
      const jobs = await c1.select().from(schema.studioJobs).where(inArray(schema.studioJobs.quoteId, [q1.id, q2.id]));
      const reserves = jobs.length ? await c1.select().from(schema.studioBudgetLedger).where(inArray(schema.studioBudgetLedger.jobId, jobs.map((j) => j.id))) : [];
      issues.push(`${ok}/${refus}/${s}/${jobs.length}/${reserves.length}`);
      expect({ ok, refus, solde: s, jobs: jobs.length, reserves: reserves.length }, `manche ${manche}`).toEqual({ ok: 1, refus: 1, solde: 0, jobs: 1, reserves: 1 });
      // Le job gagnant est annulé avant démarrage pour rendre la base propre (et rendre le crédit).
      const gagnant = (r1.ok ? r1 : r2) as { ok: true; job: { id: string } };
      await annulerJob(ctxDe(ids, 'ua'), { jobId: gagnant.job.id }, c1);
      await banc(c1).moteur.tour({ maxNouveaux: 0 });
    }
    expect(new Set(issues)).toEqual(new Set(['1/1/0/1/1']));
  });

  it('COST-01 · double clic même clé sur deux connexions ⇒ un job, une approbation, une réserve, un débit', async () => {
    await poserSolde(c1, ids.wsA, 400);
    // 40 manches : la course (clic jumeau commité entre la recherche par clé et la
    // lecture de l'approbation) ne sortait qu'une manche sur ~20 · 10 ne suffisaient pas.
    for (let manche = 0; manche < 40; manche++) {
      const q = await devis(c1);
      const e = { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `double-${q.id}` };
      const s0 = await solde(c1, ids.wsA);
      const [a, b] = await Promise.all([
        approuverEtMettreEnFile(ctxDe(ids, 'ua'), e, { illimite: false, base: c1 }),
        approuverEtMettreEnFile(ctxDe(ids, 'ua'), e, { illimite: false, base: c2 }),
      ]);
      expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.job.id).toBe(b.job.id);
      const st = await etatEnBase(c1, a.job.id);
      expect([st.reserves, st.credits.length]).toEqual([1, 1]);
      expect(await solde(c1, ids.wsA)).toBe(s0 - IMAGE);
      await annulerJob(ctxDe(ids, 'ua'), { jobId: a.job.id }, c1);
      await banc(c1).moteur.tour({ maxNouveaux: 0 });
    }
  });

  it('deux workers réclament en parallèle ⇒ chaque job pris UNE fois (SKIP LOCKED + compare-and-set)', async () => {
    await poserSolde(c1, ids.wsA, 1000);
    const jobsIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const q = await devis(c1);
      const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `para-${q.id}` }, { illimite: false, base: c1 });
      if (!r.ok) throw new Error(r.code);
      jobsIds.push(r.job.id);
    }
    const A = banc(c1, { workerId: 'pg-A' });
    const B = new MoteurStudio({ base: c2, fournisseur: A.fournisseur, stockage: A.stockage, decodeur: new DecodeurSharp(), workerId: 'pg-B', bailMs: 30_000, horloge: A.horloge, journal: (e) => A.journal.push(e) });
    const prises = await Promise.all([...Array(8)].map((_, i) => (i % 2 ? B : A.moteur).reclamer()));
    const prisesIds = prises.filter(Boolean).map((j) => j!.id);
    expect(new Set(prisesIds).size).toBe(prisesIds.length);
    for (let i = 0; i < 6; i++) await Promise.all([A.moteur.tour({ maxNouveaux: 12 }), B.tour({ maxNouveaux: 12 })]);
    for (const id of jobsIds) {
      const e = await etatEnBase(c1, id);
      expect(e.job.state, id).toBe('completed');
      expect(e.tentatives.length, `tentatives ${id}`).toBe(1);
      expect(e.violations).toEqual([]);
    }
    expect(A.fournisseur.soumissions).toBe(jobsIds.length);
  });

  it('banc · scénarios COST avec deux workers, journal JSON, sommes vérifiées', async () => {
    await poserSolde(c1, ids.wsA, 500);
    const s0 = await solde(c1, ids.wsA);
    const A = banc(c1, { workerId: 'banc-A', etapes: 1 });
    const B = secondWorker(c2, A, 'banc-B');
    const lancer = async (cle: string) => {
      const q = await devis(c1);
      const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `${cle}-${q.id}` }, { illimite: false, base: c1 });
      if (!r.ok) throw new Error(r.code);
      return r.job.id;
    };
    const scen: Record<string, string> = {};
    const fin = (m: MoteurStudio, id: string) => jusquAuBout(c1, m, id);
    // Nominal · A.
    scen.nominal = await lancer('nominal');
    expect(await fin(A.moteur, scen.nominal)).toBe('completed');
    // COST-06 · A prend le job puis meurt avant soumission ; B reprend après le bail.
    scen.crash_avant = await lancer('crash-avant');
    expect((await A.moteur.reclamer())?.id).toBe(scen.crash_avant);
    A.avancer(31_000);
    expect(await fin(B, scen.crash_avant)).toBe('completed');
    // COST-07 · réponse perdue après acceptation, retrouvée par la clé · B.
    A.fournisseur.prochaine('reponse_perdue');
    scen.reponse_perdue = await lancer('perdue');
    expect(await fin(B, scen.reponse_perdue)).toBe('completed');
    // COST-09 · annulé avant démarrage · A.
    scen.annule_avant = await lancer('annule-avant');
    await annulerJob(ctxDe(ids, 'ua'), { jobId: scen.annule_avant }, c1);
    expect(await fin(A.moteur, scen.annule_avant)).toBe('cancelled');
    // COST-09 · annulé après soumission, confirmé sans frais · A soumet, B annule.
    scen.annule_apres = await lancer('annule-apres');
    await A.moteur.tour();
    await annulerJob(ctxDe(ids, 'ua'), { jobId: scen.annule_apres }, c1);
    A.avancer(31_000);
    expect(await fin(B, scen.annule_apres)).toBe('cancelled');
    // COST-10 · produit faux · A.
    A.fournisseur.prochaine('produit_faux');
    scen.produit_faux = await lancer('faux');
    expect(await fin(A.moteur, scen.produit_faux)).toBe('completed');
    // COST-11 · stockage indisponible chez A, finalisation reprise par B.
    scen.stockage = await lancer('stockage');
    A.stockage.indisponible = true;
    for (let i = 0; i < 4; i++) await A.moteur.tour();
    expect((await etatEnBase(c1, scen.stockage)).job.state).toBe('persisting');
    A.stockage.indisponible = false;
    expect(await fin(B, scen.stockage)).toBe('completed');

    const resume: Record<string, unknown> = {};
    let deltaCredits = 0;
    for (const [nom, id] of Object.entries(scen)) {
      const e = await etatEnBase(c1, id);
      const b = bilanRegistre(e.registre.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) })));
      expect(violationsRegistreJob(e.registre.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) })), e.job.state), nom).toEqual([]);
      expect(b.reserve.credits, nom).toBe(b.settle.credits + b.release.credits);
      expect(b.reserve.usdMicros, nom).toBe(b.settle.usdMicros + b.release.usdMicros);
      deltaCredits += e.credits.reduce((s, c) => s + c.delta, 0);
      resume[nom] = { etat: e.job.state, qualite: e.job.qualityStatus, tentatives: e.tentatives.map((t) => `${t.n}:${t.workerId}:${t.state}`), registre: { reserve: b.reserve, settle: b.settle, release: b.release }, creditLedger: e.credits.map((c) => ({ delta: c.delta, refId: c.refId })), assets: e.assets.length };
    }
    expect(resume).toMatchObject({
      nominal: { etat: 'completed' }, crash_avant: { etat: 'completed' }, reponse_perdue: { etat: 'completed' },
      annule_avant: { etat: 'cancelled' }, annule_apres: { etat: 'cancelled' }, produit_faux: { etat: 'completed', qualite: 'requires_review' }, stockage: { etat: 'completed' },
    });
    // Le solde a bougé EXACTEMENT de la somme des lignes de crédits studio.
    expect(await solde(c1, ids.wsA)).toBe(s0 + deltaCredits);
    // Une requête par job parti chez le fournisseur (tous sauf l'annulé avant démarrage), jamais deux.
    expect([A.fournisseur.soumissions, A.fournisseur.appelsSoumettre]).toEqual([6, 6]);
    const sortie = process.env.L3_BANC_JOURNAL;
    if (sortie) {
      writeFileSync(sortie, JSON.stringify({ base: URL_PG.replace(/\/\/[^@]*@/, '//***@'), date: new Date().toISOString(), soldeInitial: s0, soldeFinal: await solde(c1, ids.wsA), deltaCredits, soumissions: A.fournisseur.soumissions, appelsSoumettre: A.fournisseur.appelsSoumettre, resume, journal: A.journal }, null, 2));
    }
  });
});

describe.skipIf(LOCALE)('Postgres réel · ignoré', () => {
  it('L3_PG_URL absent ou non local · tests de concurrence réelle non lancés ici (voir L3-EXECUTION.md)', () => {
    expect(LOCALE).toBe(false);
  });
});
