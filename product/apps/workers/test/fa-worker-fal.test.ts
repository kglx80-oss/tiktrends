import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schema, eq, and, sql } from '@tiktrends/db';
import {
  cleFournisseurDuJob, refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO,
  parametresImageDuDevis, photosDuProduit, idDepenseDuJob,
  type SnapshotJob, type StockageStudio, type DecisionFournisseur,
} from '@tiktrends/core';
import { MoteurStudio } from '../src/studios/moteur';
import { construireFournisseurFal, hacherImage, demarrerWorkerStudio, MESSAGE_SANS_FOURNISSEUR } from '../src/studios/fournisseurs';
import type { BaseStudio, EntreeJournal } from '../src/studios/types';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';
import { pgMemoire } from './pg-memoire';

/**
 * F-A · le moteur L3 avec le fournisseur fal RÉEL (adaptateur de production)
 * contre un `fetch` INJECTÉ qui rejoue la file fal · 0 $, aucun réseau.
 * Tout se lit en BASE (pglite, migrations réelles) : état du job, tentatives,
 * registre crédits et dollars, `ai_spend`, médias, audit.
 *
 * Réponses rejouées : documentation publique de la file fal (voir
 * `packages/integrations/test/fa-studios-fal.test.ts` pour la provenance).
 */

let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const user = randomUUID();
const produit = randomUUID();
let projet = '';
let version = '';
const PNG = pngSimule([20, 120, 200]);
const PHOTO = `data:image/png;base64,${Buffer.from(pngSimule([200, 30, 30])).toString('base64')}`;
let idPhoto = '';
let shaPhoto = '';

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core', creditsBalance: 100 });
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  await base.insert(schema.products).values({ id: produit, brandId: brand, workspaceId: ws, name: 'Lunettes', imageUrl: PHOTO } as typeof schema.products.$inferInsert);
  const [ph] = photosDuProduit({ id: produit, name: 'Lunettes', imageUrl: PHOTO, imageUrls: null }, hacherImage);
  idPhoto = ph!.assetId;
  shaPhoto = ph!.sha256;
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: 'P', ownerId: user }).returning();
  const c = contenuVide();
  const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ws, brandId: brand, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: user }).returning();
  projet = p!.id;
  version = v!.id;
});

const parametresOk = () => parametresImageDuDevis({
  consigne: {
    generationInstruction: 'Lunettes posées sur une table en chêne, lumière du matin.',
    negativeConstraints: ['aucun autre produit'], protectedComponents: ['bandeau'], needsDeterministicOverlay: true,
    referenceBindings: [{ referenceId: idPhoto, role: 'product', scope: 'product' }],
  },
  references: [{ assetId: idPhoto, assetVersion: `sha256-${shaPhoto.slice(0, 16)}`, sha256: shaPhoto, role: 'product' }],
  largeur: 1080, hauteur: 1350,
});

async function semerJob(parametres: Record<string, unknown> = parametresOk() as unknown as Record<string, unknown>): Promise<string> {
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  await base.update(schema.workspaces).set({ creditsBalance: sql`${schema.workspaces.creditsBalance} - 4` }).where(eq(schema.workspaces.id, ws));
  await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

/* ── fal rejoué : chaque job a sa requête, ses réponses ── */
interface Appel { url: string; methode: string; auth: string | null }
let appels: Appel[] = [];
let scenario: (a: Appel) => Response | Error;
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization') };
  appels.push(a);
  const r = scenario(a);
  if (r instanceof Error) throw r;
  return r;
}) as typeof fetch;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const REQ = 'a1b2c3d4-0000-4000-8000-00000000beef';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const SORTIE = 'https://v3.fal.media/files/lion/sortie.png';
const soumission = () => json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
const resultat = () => json(200, { images: [{ url: SORTIE, content_type: 'image/png', width: 8, height: 8 }], description: '' });
const media = (octets: Uint8Array = PNG) => new Response(octets as unknown as BodyInit, { status: 200, headers: { 'content-length': String(PNG.length), 'content-type': 'application/octet-stream' } });
const erreurReseau = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });

/** Une requête fal standard : en file, en cours `n` lectures, terminée. */
function falNominal(o: { enCours?: number; soumission?: () => Response | Error; resultat?: () => Response; media?: () => Response } = {}) {
  let lectures = 0;
  return (a: Appel): Response | Error => {
    if (a.methode === 'POST') return (o.soumission ?? soumission)();
    if (a.methode === 'PUT') return json(202, { status: 'CANCELLATION_REQUESTED' });
    if (a.url === `${BASE_REQ}/status`) {
      lectures += 1;
      if (lectures === 1) return json(202, { status: 'IN_QUEUE', queue_position: 1 });
      if (lectures <= 1 + (o.enCours ?? 1)) return json(202, { status: 'IN_PROGRESS', logs: [] });
      return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
    }
    if (a.url === BASE_REQ) return (o.resultat ?? resultat)();
    if (a.url.startsWith('https://v3.fal.media/')) return (o.media ?? media)();
    return new Error(`appel non prévu ${a.methode} ${a.url}`);
  };
}

class StockageMemoire implements StockageStudio {
  objets = new Map<string, Uint8Array>();
  async deposer(cle: string, octets: Uint8Array) { this.objets.set(cle, new Uint8Array(octets)); }
  async relire(cle: string) { return this.objets.get(cle) ?? null; }
}

const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } };
const horloge = { ms: Date.parse('2026-10-08T10:00:00Z') };
function moteur(o: { cap?: string; workerId?: string; stockage?: StockageMemoire } = {}) {
  const stockage = o.stockage ?? new StockageMemoire();
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: o.cap ?? '10' }, stockage: null, horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  const journal: EntreeJournal[] = [];
  const m = new MoteurStudio({ base, fournisseur, stockage, workerId: o.workerId, bailMs: 60_000, horloge: () => new Date(horloge.ms), journal: (e) => journal.push(e) });
  return { m, stockage, journal, fournisseur };
}
async function tours(m: MoteurStudio, id: string, n = 20, pasMs = 16_000) {
  for (let i = 0; i < n; i++) {
    const s = (await job(id)).state;
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(s)) return;
    await m.tour();
    horloge.ms += pasMs;
  }
}

const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const registre = async (id: string) => (await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((r) => [r.kind, r.credits, Number(r.usdMicros)]).sort();
const depense = async (id: string) => (await base.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, idDepenseDuJob(id)))).map((r) => ({ actual: r.actualUsd, estimated: r.estimatedUsd, ws: r.workspaceId, provider: r.provider, action: r.action }));
const tentatives = async (id: string) => (await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id))).map((t) => [t.n, t.state]);
const medias = async (id: string) => (await base.select().from(schema.studioAssets).where(sql`${schema.studioAssets.rights}->>'jobId' = ${id}`));
const posts = () => appels.filter((a) => a.methode === 'POST').length;

beforeEach(async () => {
  appels = [];
  // Chaque cas part d'une fenêtre de dépense vide (les lignes des cas précédents ne comptent pas).
  await base.delete(schema.aiSpend);
});

describe('nominal · soumission → en cours → terminé → téléchargement → persisting → completed', () => {
  it('un média stocké, relu, à l’empreinte des octets ; une requête ; dépense réservée et gardée ; registre réglé', async () => {
    const id = await semerJob();
    scenario = falNominal({ enCours: 2 });
    const { m, stockage, journal } = moteur();
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('completed');
    expect(j.provider).toBe('fal');
    expect(j.providerRequestId).toBe(`${cleFournisseurDuJob(id)} falq|${BASE_REQ}/status|${BASE_REQ}`);
    expect(journal.filter((e) => e.type === 'transition').map((e) => (e as { vers: string }).vers)).toEqual(['claimed', 'running', 'persisting', 'completed']);
    const [a] = await medias(id);
    const sha = createHash('sha256').update(PNG).digest('hex');
    expect([a!.sha256, a!.mime, a!.storageState, a!.origin, (a!.rights as { fournisseur?: string }).fournisseur]).toEqual([sha, 'image/png', 'stored', 'generated', 'fal']);
    expect(createHash('sha256').update(stockage.objets.get(a!.storageKey)!).digest('hex')).toBe(sha);
    expect(a!.storageKey.startsWith(`studios/${ws}/${id}/`)).toBe(true);
    expect(posts()).toBe(1);
    expect(await depense(id)).toEqual([{ actual: 0.08, estimated: 0.08, ws, provider: 'fal', action: 'studio.generation' }]);
    expect(await registre(id)).toEqual([['reserve', 4, 80_000], ['settle', 4, 80_000]]);
    expect(await tentatives(id)).toEqual([[1, 'succeeded']]);
    const audit = await base.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, id), eq(schema.studioAuditEvents.action, 'job.provider.payload')));
    expect(audit.length).toBe(1);
    expect((audit[0]!.details as { empreinte: string }).empreinte).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(audit[0]!.details)).not.toContain('data:image');
    // Aucune clé vers l'hôte des médias ; la clé vers la file seulement.
    expect(appels.filter((x) => x.url.startsWith('https://v3.fal.media/')).every((x) => x.auth === null)).toBe(true);
    expect(appels.filter((x) => x.url.startsWith('https://queue.fal.run/')).every((x) => x.auth === 'Key cle-fal-test:secret')).toBe(true);
  });

  it('résultat tronqué : refusé, job `persisting`, rien livré ni réglé ; le re-téléchargement complète sans resoumettre', async () => {
    const id = await semerJob();
    let coupe = true;
    scenario = falNominal({ enCours: 0, media: () => { if (coupe) { coupe = false; return media(PNG.slice(0, 50)); } return media(); } });
    const { m } = moteur();
    for (let i = 0; i < 6 && (await job(id)).state !== 'persisting'; i++) { await m.tour(); horloge.ms += 16_000; }
    const j = await job(id);
    expect(j.state).toBe('persisting');
    expect((j.error as { code?: string }).code).toBe('PERSISTENCE_FAILED');
    expect(await medias(id)).toEqual([]);
    expect(await registre(id)).toEqual([['reserve', 4, 80_000]]);
    await tours(m, id);
    expect((await job(id)).state).toBe('completed');
    expect((await medias(id)).length).toBe(1);
    expect(posts()).toBe(1);
  });

  it('double livraison du même résultat (deux workers en parallèle) : un seul média, un seul règlement', async () => {
    const id = await semerJob();
    scenario = falNominal({ enCours: 0 });
    const stockage = new StockageMemoire();
    const a = moteur({ workerId: 'A', stockage });
    const b = moteur({ workerId: 'B', stockage });
    await a.m.tour();
    horloge.ms += 120_000; // bail de A expiré : B peut reprendre le suivi
    for (let i = 0; i < 6 && (await job(id)).state !== 'completed'; i++) {
      await Promise.all([a.m.tour(), b.m.tour()]);
      horloge.ms += 16_000;
    }
    expect((await job(id)).state).toBe('completed');
    expect((await medias(id)).length).toBe(1);
    expect((await registre(id)).filter((r) => r[0] === 'settle').length).toBe(1);
    expect(posts()).toBe(1);
  });
});

describe('échecs · certain ou incertain, et ce que chacun coûte', () => {
  it('5xx AVANT acceptation : `failed`, dépense rendue (actual 0), crédits rendus, tentative `failed`', async () => {
    const id = await semerJob();
    scenario = falNominal({ soumission: () => json(503, { detail: 'Service Unavailable' }) });
    const avant = (await base.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws)))[0]!.creditsBalance;
    const { m } = moteur();
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect(await depense(id)).toEqual([{ actual: 0, estimated: 0.08, ws, provider: 'fal', action: 'studio.generation' }]);
    expect(await registre(id)).toEqual([['release', 4, 80_000], ['reserve', 4, 80_000], ['settle', 0, 0]]);
    expect(await tentatives(id)).toEqual([[1, 'failed']]);
    expect((await base.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws)))[0]!.creditsBalance).toBe(avant + 4);
  });

  it('coupure après envoi : incertain, dépense GARDÉE, job en réconciliation, AUCUNE seconde soumission', async () => {
    const id = await semerJob();
    scenario = falNominal({ soumission: () => erreurReseau('ECONNRESET') });
    const { m } = moteur();
    await m.tour();
    expect((await job(id)).state).toBe('reconciliation_required');
    for (let i = 0; i < 5; i++) { await m.tour(); horloge.ms += 16_000; }
    expect((await job(id)).state).toBe('reconciliation_required');
    expect(posts()).toBe(1);
    expect(await depense(id)).toEqual([{ actual: 0.08, estimated: 0.08, ws, provider: 'fal', action: 'studio.generation' }]);
    expect(await registre(id)).toEqual([['reserve', 4, 80_000]]);
    expect(await tentatives(id)).toEqual([[1, 'uncertain']]);
  });

  it('plafond atteint : aucune soumission, job bloqué avec la raison, rien compté, tout rendu', async () => {
    const id = await semerJob();
    scenario = falNominal();
    const { m } = moteur({ cap: '0.05' });
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif: string }).motif).toContain('Plafond de dépense atteint');
    expect(appels).toEqual([]);
    expect(await depense(id)).toEqual([]);
    expect(await registre(id)).toEqual([['release', 4, 80_000], ['reserve', 4, 80_000], ['settle', 0, 0]]);
  });

  it('média révoqué depuis le devis (photo retirée du catalogue) : bloqué avant tout appel, audit de blocage', async () => {
    const autre = randomUUID();
    const photo = `data:image/png;base64,${Buffer.from(pngSimule([1, 2, 3])).toString('base64')}`;
    await base.insert(schema.products).values({ id: autre, brandId: brand, workspaceId: ws, name: 'Retiré', imageUrl: photo } as typeof schema.products.$inferInsert);
    const [ph] = photosDuProduit({ id: autre, name: 'Retiré', imageUrl: photo, imageUrls: null }, hacherImage);
    const p = parametresOk();
    p.consigne.referenceBindings = [{ referenceId: ph!.assetId, role: 'product', scope: 'product' }];
    p.references = [{ assetId: ph!.assetId, assetVersion: 'v', sha256: ph!.sha256, role: 'product' }];
    const id = await semerJob(p as unknown as Record<string, unknown>);
    await base.delete(schema.products).where(eq(schema.products.id, autre));
    scenario = falNominal();
    const { m } = moteur();
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif: string }).motif).toContain('MISSING_REFERENCE');
    expect(appels).toEqual([]);
    expect(await depense(id)).toEqual([]);
    const audit = await base.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, id), eq(schema.studioAuditEvents.action, 'job.provider.blocked')));
    expect(audit.length).toBe(1);
  });

  it('photo d’un produit d’une AUTRE marque du même espace : hors portée, bloqué, 0 appel', async () => {
    const autreMarque = randomUUID();
    const autre = randomUUID();
    const photo = `data:image/png;base64,${Buffer.from(pngSimule([9, 9, 9])).toString('base64')}`;
    await base.insert(schema.brands).values({ id: autreMarque, workspaceId: ws, name: 'Autre' });
    await base.insert(schema.products).values({ id: autre, brandId: autreMarque, workspaceId: ws, name: 'Ailleurs', imageUrl: photo } as typeof schema.products.$inferInsert);
    const [ph] = photosDuProduit({ id: autre, name: 'Ailleurs', imageUrl: photo, imageUrls: null }, hacherImage);
    const p = parametresOk();
    p.consigne.referenceBindings = [{ referenceId: ph!.assetId, role: 'product', scope: 'product' }];
    p.references = [{ assetId: ph!.assetId, assetVersion: 'v', sha256: ph!.sha256, role: 'product' }];
    const id = await semerJob(p as unknown as Record<string, unknown>);
    scenario = falNominal();
    const { m } = moteur();
    await tours(m, id);
    expect((await job(id)).state).toBe('failed');
    expect(((await job(id)).error as { motif: string }).motif).toContain('MISSING_REFERENCE');
    expect(appels).toEqual([]);
  });

  it('instantané sans consigne (`parametres: {}`, approbation actuelle) : bloqué, la raison le dit, 0 appel', async () => {
    const id = await semerJob({});
    scenario = falNominal();
    const { m } = moteur();
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif: string }).motif).toContain('consigne image compilée n’est pas dans l’instantané');
    expect(appels).toEqual([]);
  });
});

describe('annulation', () => {
  it('avant démarrage : 0 soumission, `cancelled`, rien compté', async () => {
    const id = await semerJob();
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: sql`${schema.studioJobs.rowVersion} + 1` }).where(eq(schema.studioJobs.id, id));
    scenario = falNominal();
    const { m } = moteur();
    await tours(m, id);
    expect((await job(id)).state).toBe('cancelled');
    expect([posts(), (await depense(id)).length]).toEqual([0, 0]);
  });

  it('pendant l’exécution : annulation distante (PUT) puis statut relu ; fal confirme l’annulation ⇒ `cancelled`, crédits rendus, dollars comptés (doute payé)', async () => {
    const id = await semerJob();
    scenario = falNominal({ enCours: 50, resultat: () => json(400, { detail: 'Request was cancelled by the user' }) });
    const { m } = moteur();
    await m.tour();
    expect((await job(id)).state).toBe('running');
    const j = await job(id);
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: j.rowVersion + 1 }).where(eq(schema.studioJobs.id, id));
    let annule = false;
    const avant = scenario;
    scenario = (a) => {
      if (a.methode === 'PUT') { annule = true; return json(202, { status: 'CANCELLATION_REQUESTED' }); }
      if (annule && a.url === `${BASE_REQ}/status`) return json(200, { status: 'COMPLETED' });
      return avant(a);
    };
    await tours(m, id);
    expect((await job(id)).state).toBe('cancelled');
    expect(appels.filter((a) => a.methode === 'PUT').map((a) => a.url)).toEqual([`${BASE_REQ}/cancel`]);
    expect(posts()).toBe(1);
    expect((await registre(id)).map((r) => r[0])).toEqual(['release', 'reserve', 'settle']);
    expect((await depense(id))[0]!.actual).toBe(0.08);
  });
});

describe('sondage avec recul · aucun job bloqué, aucune double soumission, sans webhook', () => {
  it('3 minutes de calcul, un tour toutes les 2 s : le job finit, une soumission, lectures de statut bornées', async () => {
    const id = await semerJob();
    const fin = horloge.ms + 180_000;
    scenario = (a) => {
      if (a.url === `${BASE_REQ}/status`) return horloge.ms < fin ? json(202, { status: 'IN_PROGRESS' }) : json(200, { status: 'COMPLETED' });
      return falNominal()(a);
    };
    const { m } = moteur();
    let n = 0;
    while ((await job(id)).state !== 'completed' && n < 200) { await m.tour(); horloge.ms += 2_000; n += 1; }
    expect((await job(id)).state).toBe('completed');
    expect(posts()).toBe(1);
    const lectures = appels.filter((a) => a.url === `${BASE_REQ}/status`).length;
    // 90 tours au rythme de la boucle ; recul 2 → 15 s : au plus 180/15 + 4 lectures.
    expect(n).toBeGreaterThanOrEqual(90);
    expect(lectures).toBeLessThanOrEqual(16);
  });
});

describe('démarrage du worker studio', () => {
  const S3 = { S3_ENDPOINT: 's3.test', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' };
  it('sans clé réelle, hors production ou sans stockage : ne démarre pas et le dit (jobs en file, rien facturé)', async () => {
    const id = await semerJob();
    const cas: Array<[Record<string, string>, string]> = [
      [{}, 'FAL_KEY absente'],
      [{ FAL_KEY: 'simule-local-sans-reseau', NODE_ENV: 'production', ...S3 }, 'simulation locale'],
      [{ FAL_KEY: 'id:secret', NODE_ENV: 'test', ...S3 }, 'hors production sans STUDIO_FOURNISSEUR_REEL=autorise'],
      [{ FAL_KEY: 'id:secret', NODE_ENV: 'production' }, 'stockage objet non configuré'],
    ];
    for (const [env, raison] of cas) {
      const logs: string[] = [];
      expect(demarrerWorkerStudio({ env, base, fetch: fetchRejoue, log: (l) => logs.push(l) })).toBeNull();
      expect(logs.join(' '), raison).toContain(raison);
      expect(logs.join(' ')).toContain(MESSAGE_SANS_FOURNISSEUR);
    }
    expect((await job(id)).state).toBe('queued');
    expect(appels).toEqual([]);
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: sql`${schema.studioJobs.rowVersion} + 1` }).where(eq(schema.studioJobs.id, id));
  });

  it('le worker et le branchement n’importent jamais le fournisseur simulé', () => {
    for (const f of ['src/worker.ts', 'src/studios/fournisseurs.ts', 'src/index.ts', 'src/studios/boucle.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(/(from|import)\s*\(?\s*['"][^'"]*studios-simule|new\s+(FournisseurSimule|StockageSimule)/);
    }
  });
});
