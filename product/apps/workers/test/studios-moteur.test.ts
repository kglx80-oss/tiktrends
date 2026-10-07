import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, eq } from '@tiktrends/db';
import {
  cleFournisseurDuJob, refsDuJob, inspecterMedia, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  OPERATION_JOB_STUDIO, type SnapshotJob,
} from '@tiktrends/core';
import { MoteurStudio } from '../src/studios/moteur';
import { relayerOutbox } from '../src/studios/boucle';
import type { BaseStudio, EntreeJournal } from '../src/studios/types';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE, pngSimule, signerWebhookSimule } from '../../../packages/integrations/src/studios-simule';
import { pgMemoire } from './pg-memoire';

/**
 * Worker des studios · au résultat en base (pglite, migrations réelles).
 * Les jobs sont semés tels que l'approbation les écrit (devis, approbation
 * consommée, job `queued`, réserve) · la commande elle-même est éprouvée dans
 * `apps/web/test/l3-*.test.ts`.
 */

let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const user = randomUUID();
let projet = '';
let version = '';

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core', creditsBalance: 100 });
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: 'P', ownerId: user }).returning();
  const c = contenuVide();
  const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ws, brandId: brand, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: user }).returning();
  projet = p!.id;
  version = v!.id;
});

async function semerJob(o: { reserve?: boolean } = {}): Promise<string> {
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: {} };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  if (o.reserve !== false) {
    await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  }
  return j!.id;
}

function moteur(o: { fournisseur?: FournisseurSimule; stockage?: StockageSimule; workerId?: string; secret?: string; decalage?: { ms: number } } = {}) {
  const fournisseur = o.fournisseur ?? new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  const stockage = o.stockage ?? new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  const decalage = o.decalage ?? { ms: 0 };
  const journal: EntreeJournal[] = [];
  const m = new MoteurStudio({ base, fournisseur, stockage, workerId: o.workerId, bailMs: 10_000, horloge: () => new Date(Date.now() + decalage.ms), secretWebhook: o.secret ?? null, journal: (e) => journal.push(e) });
  return { m, fournisseur, stockage, journal, decalage };
}

const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;

describe('réclamer · une seule prise, jamais sans réserve', () => {
  it('un job SANS réserve au registre n’est jamais réclamé', async () => {
    const id = await semerJob({ reserve: false });
    const { m } = moteur();
    expect(await m.reclamer()).toBeNull();
    expect((await job(id)).state).toBe('queued');
    // Nettoyage : on lui pose sa réserve pour les cas suivants.
    await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: id, quoteId: (await job(id)).quoteId, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(id).reserve });
    const r = await m.reclamer();
    expect(r?.id).toBe(id);
    expect(await m.reclamer()).toBeNull();
    while (!['completed', 'failed'].includes((await job(id)).state)) await m.tour();
  });

  it('deux workers en parallèle sur un job ⇒ un seul le prend, une seule tentative', async () => {
    const id = await semerJob();
    const a = moteur({ workerId: 'A' });
    const b = moteur({ workerId: 'B', fournisseur: a.fournisseur, stockage: a.stockage });
    const prises = (await Promise.all([a.m.reclamer(), b.m.reclamer()])).filter(Boolean);
    expect(prises.length).toBe(1);
    const t = await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id));
    expect(t.length).toBe(1);
    while ((await job(id)).state !== 'completed') await a.m.tour();
  });
});

describe('clé fournisseur · écrite AVANT la soumission, une par job', () => {
  it('la tentative porte la clé du job ; le fournisseur reçoit exactement cette clé', async () => {
    const id = await semerJob();
    const { m, fournisseur } = moteur();
    await m.tour();
    const [t] = await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id));
    expect(t!.providerIdempotencyKey).toBe(cleFournisseurDuJob(id));
    expect([...fournisseur.requetes.values()].map((r) => r.cle)).toEqual([cleFournisseurDuJob(id)]);
    while ((await job(id)).state !== 'completed') await m.tour();
  });
});

describe('statut inconnu sur une requête acceptée ⇒ réconciliation, aucune resoumission', () => {
  it('le fournisseur « oublie » la requête', async () => {
    const id = await semerJob();
    const { m, fournisseur } = moteur();
    fournisseur.prochaine('succes');
    await m.tour();
    fournisseur.requetes.clear();
    await m.tour();
    expect((await job(id)).state).toBe('reconciliation_required');
    for (let i = 0; i < 3; i++) await m.tour();
    expect(fournisseur.appelsSoumettre).toBe(1);
    const reg = await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id));
    expect(reg.map((r) => r.kind)).toEqual(['reserve']);
  });
});

describe('webhooks · signature, fenêtre, corps', () => {
  it('signature v1 HMAC-SHA256 sur « horodatage.corps » · une altération du corps est refusée', async () => {
    const secret = `s-${randomUUID()}`;
    const { m } = moteur({ secret });
    const t = Math.floor(Date.now() / 1000);
    const corps = JSON.stringify({ id: 'e', type: 'progress', requestId: 'inconnue', emisA: t });
    const entetes = signerWebhookSimule(corps, t, secret);
    expect((await m.recevoirWebhook(entetes, corps)).status).toBe(202);
    expect((await m.recevoirWebhook(entetes, corps.replace('progress', 'succeeded'))).status).toBe(401);
    expect((await m.recevoirWebhook({ ...entetes, 'x-studio-timestamp': String(t + 1) }, corps)).status).toBe(401);
    expect((await m.recevoirWebhook({}, corps)).status).toBe(401);
  });
});

describe('outbox · publiée une fois, dans l’ordre, échec conservé', () => {
  it('relais', async () => {
    await base.update(schema.studioOutbox).set({ publishedAt: new Date() });
    for (const n of [1, 2, 3]) await base.insert(schema.studioOutbox).values({ workspaceId: ws, topic: `t${n}`, aggregateId: randomUUID(), payload: {} });
    const vus: string[] = [];
    let casse = true;
    const r1 = await relayerOutbox(base, async (e) => {
      if (e.topic === 't2' && casse) { casse = false; throw new Error('bus indisponible'); }
      vus.push(e.topic);
    });
    expect(r1).toEqual({ publies: 1, echecs: 1 });
    const [t2] = await base.select().from(schema.studioOutbox).where(eq(schema.studioOutbox.topic, 't2'));
    expect([t2!.publishedAt, t2!.attempts, t2!.lastError]).toEqual([null, 1, 'bus indisponible']);
    const r2 = await relayerOutbox(base, async (e) => { vus.push(e.topic); });
    expect(r2).toEqual({ publies: 2, echecs: 0 });
    expect(vus).toEqual(['t1', 't2', 't3']);
    expect((await relayerOutbox(base, async (e) => { vus.push(e.topic); })).publies).toBe(0);
  });
});

describe('médias simulés · décodables et marqués', () => {
  it('le PNG simulé est un vrai PNG 8×8 portant « SIMULE »', () => {
    const p = pngSimule();
    expect(inspecterMedia(p)).toEqual({ mime: 'image/png', largeur: 8, hauteur: 8 });
    expect(Buffer.from(p).toString('latin1')).toContain('SIMULE');
  });
});
