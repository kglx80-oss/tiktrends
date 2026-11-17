import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, eq, and, sql } from '@tiktrends/db';
import {
  refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO, parametresImageDuDevis, photosDuProduit, idDepenseDuJob,
  ECHEANCES_TRAVAIL_MS, ECHEANCE_PERSISTANCE_MS, DELAI_TELECHARGEMENT_SORTIE_MS, violationsRegistreJob,
  type SnapshotJob, type StockageStudio, type DecisionFournisseur,
} from '@tiktrends/core';
import { DELAI_TELECHARGEMENT_FAL_MS } from '@tiktrends/integrations';
import { MoteurStudio } from '../src/studios/moteur';
import { construireFournisseurFal, hacherImage } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';
import { DecodeurSharp } from '../src/studios/decodeur';
import { pgMemoire } from './pg-memoire';

/**
 * Aucun job sans issue (C1, I2) · le moteur L3 avec l'adaptateur fal RÉEL
 * contre un `fetch` injecté (0 $, aucun réseau, aucune socket) et une horloge
 * pilotée. Tout se lit en base (pglite, migrations réelles) : état, registre
 * crédits et dollars, solde de l'espace, `credit_ledger`, `ai_spend`.
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
const MIN = 60_000;

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

const parametres = () => parametresImageDuDevis({
  consigne: {
    generationInstruction: 'Lunettes posées sur une table en chêne, lumière du matin.',
    negativeConstraints: ['aucun autre produit'], protectedComponents: ['bandeau'], needsDeterministicOverlay: true,
    referenceBindings: [{ referenceId: idPhoto, role: 'product', scope: 'product' }],
  },
  references: [{ assetId: idPhoto, assetVersion: `sha256-${shaPhoto.slice(0, 16)}`, sha256: shaPhoto, role: 'product' }],
  largeur: 1080, hauteur: 1350,
}) as unknown as Record<string, unknown>;

/** Un job tel que l'approbation l'écrit · 4 crédits débités de l'espace, réserve posée. */
async function semerJob(): Promise<string> {
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: parametres() };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  await base.update(schema.workspaces).set({ creditsBalance: sql`${schema.workspaces.creditsBalance} - 4` }).where(eq(schema.workspaces.id, ws));
  await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

/* ── fal rejoué ── */
interface Appel { url: string; methode: string }
let appels: Appel[] = [];
let scenario: (a: Appel) => Response | Error;
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET' };
  appels.push(a);
  const r = scenario(a);
  if (r instanceof Error) throw r;
  return r;
}) as typeof fetch;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const REQ = 'a1b2c3d4-0000-4000-8000-00000000cafe';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const SORTIE = 'https://v3.fal.media/files/lion/sortie.png';
const soumission = () => json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
const media = () => new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-length': String(PNG.length) } });

class StockageMemoire implements StockageStudio {
  objets = new Map<string, Uint8Array>();
  panne = false;
  depots = 0;
  async deposer(cle: string, octets: Uint8Array) { this.depots += 1; if (this.panne) throw new Error('S3 indisponible (HTTP 503)'); this.objets.set(cle, new Uint8Array(octets)); }
  async relire(cle: string) { return this.objets.get(cle) ?? null; }
}

const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit', animation: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' } };
const horloge = { ms: Date.parse('2026-11-16T10:00:00Z') };
function moteur(stockage = new StockageMemoire()) {
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: null, horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  const m = new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms) });
  return { m, stockage };
}

const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const registre = async (id: string) => (await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((r) => [r.kind, r.credits, Number(r.usdMicros)]).sort();
const solde = async () => (await base.select({ s: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)))[0]!.s;
const rendus = async (id: string) => (await base.select().from(schema.creditLedger).where(eq(schema.creditLedger.refId, refsDuJob(id).release))).map((r) => r.delta);
const depense = async (id: string) => (await base.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, idDepenseDuJob(id)))).map((r) => ({ estimated: r.estimatedUsd, provider: r.provider }));
const posts = () => appels.filter((a) => a.methode === 'POST').length;
const violations = async (id: string) => violationsRegistreJob(await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id)).then((l) => l.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) }))), (await job(id)).state);

/** Fait tourner le moteur en avançant l'horloge de `pasMs` à chaque tour, jusqu'à un état ou `n` tours. */
async function jusqua(m: MoteurStudio, id: string, etats: string[], n: number, pasMs: number) {
  for (let i = 0; i < n; i++) {
    if (etats.includes((await job(id)).state)) return i;
    await m.tour();
    horloge.ms += pasMs;
  }
  return n;
}

beforeEach(async () => {
  appels = [];
  await base.delete(schema.aiSpend);
});

describe('C1 · rapprochement sans identifiant de requête · une issue à l’échéance', () => {
  it('502 après envoi · reconciliation_required sans requestId, puis à l’échéance failed, crédits rendus, ai_spend gardé, aucune resoumission', async () => {
    const id = await semerJob();
    const avant = await solde();
    scenario = (a) => (a.methode === 'POST' ? json(502, { detail: 'Bad Gateway' }) : new Error(`appel non prévu ${a.methode} ${a.url}`));
    const { m } = moteur();
    await jusqua(m, id, ['reconciliation_required'], 5, 1_000);
    let j = await job(id);
    expect(j.state).toBe('reconciliation_required');
    expect(j.providerRequestId).toBeNull();
    expect(await depense(id), 'la réserve de dépense est GARDÉE (la requête a pu partir)').toEqual([{ estimated: 0.08, provider: 'fal' }]);

    // Avant l'échéance · rien ne bouge.
    horloge.ms += ECHEANCES_TRAVAIL_MS.image - 5_000;
    await m.tour();
    expect((await job(id)).state).toBe('reconciliation_required');

    // Au-delà · une issue.
    horloge.ms += 10_000;
    await m.tour();
    j = await job(id);
    expect(j.state, 'le job doit sortir du rapprochement à l’échéance').toBe('failed');
    expect((j.error as { issue?: string }).issue).toBe('facture_sans_livrable');
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    expect(await solde()).toBe(avant + 4);
    expect(await rendus(id)).toEqual([4]);
    expect(await depense(id), 'le coût fournisseur reste compté').toEqual([{ estimated: 0.08, provider: 'fal' }]);
    expect(await violations(id)).toEqual([]);
    expect(posts(), 'jamais une seconde soumission').toBe(1);
    const audit = await base.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, id), eq(schema.studioAuditEvents.action, 'job.failed')));
    expect(audit.map((x) => x.effectiveRole)).toEqual(['systeme:reconciliateur']);
  });
});

describe('I2 · running éternel (fal répond 500 au suivi) · bascule à l’échéance', () => {
  it('running → reconciliation_required après 20 min, puis failed après 20 min de plus · une seule soumission', async () => {
    const id = await semerJob();
    scenario = (a) => (a.methode === 'POST' ? soumission() : a.url === `${BASE_REQ}/status` ? json(500, { detail: 'Internal Server Error' }) : new Error(`appel non prévu ${a.url}`));
    const { m } = moteur();
    await jusqua(m, id, ['running'], 3, 1_000);
    expect((await job(id)).providerRequestId).not.toBeNull();
    // À mi-course, une écriture qui ne change pas l'état (progression, identifiant arrivé tard) avance `updated_at` ·
    // l'échéance compte depuis l'ENTRÉE dans l'état, pas depuis la dernière écriture.
    let n = await jusqua(m, id, ['reconciliation_required', 'failed'], 20, 30_000);
    await base.update(schema.studioJobs).set({ updatedAt: new Date(horloge.ms) }).where(eq(schema.studioJobs.id, id));
    n += await jusqua(m, id, ['reconciliation_required', 'failed'], 200, 30_000);
    const j = await job(id);
    expect(j.state, 'running ne doit pas durer au-delà de son échéance').toBe('reconciliation_required');
    expect(n * 30_000).toBeGreaterThanOrEqual(ECHEANCES_TRAVAIL_MS.image);
    expect(n * 30_000).toBeLessThanOrEqual(ECHEANCES_TRAVAIL_MS.image + 2 * 30_000);
    await jusqua(m, id, ['failed'], 200, 30_000);
    expect((await job(id)).state).toBe('failed');
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    expect(posts()).toBe(1);
  });
});

describe('I2 · persisting avec S3 en panne · recul croissant, puis failed', () => {
  it('les essais s’espacent (20 s, 40 s, 80 s…), au plus une dizaine, puis failed crédits rendus à 48 min', { timeout: 180_000 }, async () => {
    const id = await semerJob();
    scenario = (a) => (a.methode === 'POST' ? soumission()
      : a.url === `${BASE_REQ}/status` ? json(200, { status: 'COMPLETED', response_url: BASE_REQ })
        : a.url === BASE_REQ ? json(200, { images: [{ url: SORTIE, content_type: 'image/png' }] })
          : a.url.startsWith('https://v3.fal.media/') ? media() : new Error(`appel non prévu ${a.url}`));
    const stockage = new StockageMemoire();
    stockage.panne = true;
    const { m } = moteur(stockage);
    await jusqua(m, id, ['persisting'], 5, 1_000);
    expect((await job(id)).state).toBe('persisting');
    const telechargements = () => appels.filter((a) => a.url.startsWith('https://v3.fal.media/')).length;

    // Tours toutes les 2 s · les essais ne suivent que le recul.
    const essais: number[] = [];
    const debut = horloge.ms;
    for (let i = 0; i < 1_500 && (await job(id)).state === 'persisting'; i++) {
      const avant = stockage.depots;
      await m.tour();
      if (stockage.depots > avant) essais.push(horloge.ms - debut);
      horloge.ms += 2_000;
    }
    const j = await job(id);
    expect(j.state, 'persisting doit finir à son échéance').toBe('failed');
    expect((j.error as { issue?: string }).issue).toBe('facture_sans_livrable');
    expect(essais.length, `essais trop nombreux · ${essais.length}`).toBeLessThanOrEqual(11);
    const ecarts = essais.slice(1).map((t, i) => t - essais[i]!);
    for (let i = 1; i < Math.min(ecarts.length, 5); i++) expect(ecarts[i]!, `écart ${i} non croissant · ${ecarts.join(', ')}`).toBeGreaterThan(ecarts[i - 1]!);
    expect(ecarts[0]).toBeGreaterThanOrEqual(20_000);
    expect(horloge.ms - debut).toBeGreaterThan(ECHEANCE_PERSISTANCE_MS);
    expect(telechargements()).toBeLessThanOrEqual(12);
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    expect(await violations(id)).toEqual([]);
  });

  it('le délai recopié au noyau est celui de l’intégration', () => {
    expect(DELAI_TELECHARGEMENT_SORTIE_MS).toBe(DELAI_TELECHARGEMENT_FAL_MS);
  });
});

describe('Clore le rapprochement · la demande de l’administration est réglée par le worker', () => {
  it('une demande posée sur un job en rapprochement · failed au tour suivant, raison dans le motif, avant l’échéance', async () => {
    const id = await semerJob();
    scenario = (a) => (a.methode === 'POST' ? json(504, {}) : new Error('appel non prévu'));
    const { m } = moteur();
    await jusqua(m, id, ['reconciliation_required'], 5, 1_000);
    await base.update(schema.studioJobs).set({ error: { clotureDemandee: { par: user, raison: 'fal confirme : aucune requête reçue', a: new Date(horloge.ms).toISOString() } } }).where(eq(schema.studioJobs.id, id));
    await m.tour();
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif?: string }).motif).toContain('fal confirme : aucune requête reçue');
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    expect(posts()).toBe(1);
  });
});
