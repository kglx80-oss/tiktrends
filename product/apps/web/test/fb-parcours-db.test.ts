import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * F-B · le parcours image de bout en bout sur une VRAIE base (pglite +
 * migrations réelles) · adaptateur texte SIMULÉ pour `image.compile`,
 * fournisseur image fal de PRODUCTION (F-A) contre un `fetch` INJECTÉ qui
 * rejoue la file fal (0 $, aucun réseau) dans le moteur du worker.
 *
 * On lit les LIGNES écrites : attestation d'audit, version et contenu, devis
 * et son `inputHash`, job et `snapshot.parametres`, registre et solde, corps
 * envoyé au fournisseur, média `studio_assets`, médias de l'éditeur, statut
 * qualité.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import {
  consigneDuContenu, parametresDepuisConsigne, empreinteConsigne, empreinteEntreesDevisImage, lireParametresImage, promptFal,
  OPERATION_IMAGE, PLAN_IMAGE, ACTION_CONSIGNE_COMPILEE, PRICING_VERSION,
  type ContenuVersion, type BriefCanonique, type SnapshotJob, type DecisionFournisseur, type StockageStudio, type LigneDevis,
} from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour, associerReferencePour } from '../lib/studios/produit/commandes';
import { enregistrerVersion } from '../lib/studios/depot';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { lireParcoursImagePour, devisImagePour, approuverImagePour, controlerMediaPour } from '../lib/studios/image/parcours';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import * as actions from '../app/actions/studios/image';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, PHOTOS, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import { construireFournisseurFal } from '../../workers/src/studios/fournisseurs';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const T = new Date('2026-10-08T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
const SANS_FOURNISSEUR = { releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutCompilationUsd: 0.14 };
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
const deps = { adaptateur: texte, environnement: 'test' as const, ...O };
let cat: Catalogue;

/* ── Le modèle simulé lie chaque référence reçue avec un rôle déclaré ── */
function repondreConsigne(instruction = 'Coureur portant les lunettes et le bandeau, piste au lever du jour, lumière rasante.') {
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: instruction, negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
        referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
      },
    };
  };
}

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};
const solde = async () => (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsA)))[0]!.c;
const jobDe = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;

async function photo(projectId: string, n: number): Promise<string> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[n - 1]!.assetId;
}

/** Projet de la marque A1 · brief L4-B, photo n°5 épinglée avec ses composants. */
async function projetEpingle() {
  const p = await projetStatique(db, ids, cat);
  const v = await courante(p.projectId);
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, productId: cat.produit.id, photoId: await photo(p.projectId, 5), composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p;
}

/** Compiler (attesté) puis retenir · la consigne est dans la version courante. */
async function consigneRetenue(projectId: string, instruction?: string) {
  repondreConsigne(instruction);
  const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId, mode: 'generative_scene' }, deps);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const v = await courante(projectId);
  const r = await retenirConsignePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { compilation: c, version: r.version };
}

async function devisPret(projectId: string) {
  const d = await devisImagePour(ctxDe(ids, 'ua'), { projectId }, T);
  if (!d.ok) throw new Error(JSON.stringify(d));
  return d.devis;
}

const approuver = (q: { id: string; inputHash: string; maximumCredits: number }, o: { fournisseurImage?: boolean } = {}) =>
  approuverImagePour(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `fb-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: o.fournisseurImage ?? true, maintenant: T });

/* ── fal rejoué (même provenance que F-A : documentation publique de la file) ── */
interface Appel { url: string; methode: string; corps: string | null }
let appels: Appel[] = [];
const REQ = 'b2c3d4e5-0000-4000-8000-00000000f00d';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${REQ}`;
const PNG = pngSimule([40, 160, 90]);
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', corps: typeof init?.body === 'string' ? init.body : null };
  appels.push(a);
  if (a.methode === 'POST') return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
  if (a.url === `${BASE_REQ}/status`) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
  if (a.url === BASE_REQ) return json(200, { images: [{ url: 'https://v3.fal.media/files/fb/sortie.png', content_type: 'image/png', width: 8, height: 8 }], description: '' });
  if (a.url.startsWith('https://v3.fal.media/')) return new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-length': String(PNG.length) } });
  throw new Error(`appel non prévu ${a.methode} ${a.url}`);
}) as typeof fetch;
class StockageMemoire implements StockageStudio {
  objets = new Map<string, Uint8Array>();
  async deposer(cle: string, octets: Uint8Array) { this.objets.set(cle, new Uint8Array(octets)); }
  async relire(cle: string) { return this.objets.get(cle) ?? null; }
}
const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } };
const horloge = { ms: T.getTime() };
async function executer(jobId: string): Promise<string> {
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: null, horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  const m = new MoteurStudio({ base, fournisseur, stockage: new StockageMemoire(), bailMs: 60_000, horloge: () => new Date(horloge.ms) });
  for (let i = 0; i < 20; i++) {
    const s = (await jobDe(jobId)).state;
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(s)) return s;
    await m.tour();
    horloge.ms += 16_000;
  }
  return (await jobDe(jobId)).state;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
  await db.update(schema.workspaces).set({ creditsBalance: 100 }).where(eq(schema.workspaces.id, ids.wsA));
});
beforeEach(() => { etat.session = session(ids, 'ua'); texte.recues.length = 0; appels = []; });

describe('parcours nominal · consigne persistée → devis → approbation → job → média dans le projet → revue', () => {
  it('compiler n’écrit rien dans le projet : une trace et UNE attestation serveur de la consigne validée', async () => {
    const { projectId } = await projetEpingle();
    const v = await courante(projectId);
    repondreConsigne();
    const avant = await compter(db);
    const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId, mode: 'generative_scene' }, deps);
    expect(c, JSON.stringify(c)).toMatchObject({ ok: true, statut: 'compilee' });
    expect(delta(avant, await compter(db))).toEqual({ runs: 1, audit: 1 });
    expect((await courante(projectId)).id).toBe(v.id);
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, ACTION_CONSIGNE_COMPILEE)));
    const d = a!.details as { runId: string; empreinte: string; consigne: unknown };
    expect(d.runId).toBe(c.ok && c.statut === 'compilee' ? c.runId : '');
    expect(a!.versionBefore).toBe(v.id);
    // La consigne attestée est la FINALE (interdits du serveur compris), liée à la photo épinglée.
    const id5 = await photo(projectId, 5);
    expect(d.consigne).toMatchObject({ schema: 'consigne_image/1', mode: 'generative_scene', format: { largeur: 1080, hauteur: 1350 }, references: [{ assetId: id5, role: 'product' }] });
    expect(d.empreinte).toBe(empreinteConsigne(d.consigne as never));
  });

  it('bout en bout · parametres studio_image/1 = ce que le worker relit, job completed, média generated dans l’éditeur, requires_review', async () => {
    const { projectId } = await projetEpingle();
    const id5 = await photo(projectId, 5);
    const { compilation, version } = await consigneRetenue(projectId);
    if (!compilation.ok || compilation.statut !== 'compilee') throw new Error('compilation');

    // Version : la consigne attestée, mot pour mot, et le plan s_image.
    const contenu = version.content as ContenuVersion;
    expect(consigneDuContenu(contenu)).toEqual(compilation.consigne);
    expect(contenu.shots.order).toContain(PLAN_IMAGE);
    expect(version.reason).toBe(`Consigne image retenue · compilation ${compilation.runId.slice(0, 8)}`);

    // Devis : une ligne image au barème, inputHash portant la consigne.
    const avantDevis = await compter(db);
    const q = await devisPret(projectId);
    const dd = delta(avantDevis, await compter(db));
    expect([dd.devis, dd.audit, dd.jobs, dd.approbations, dd.credits, dd.registre]).toEqual([1, 1, undefined, undefined, undefined, undefined]);
    expect(q.lignes.map((l: LigneDevis) => [l.operation, l.profil, l.credits, l.usdMicros])).toEqual([[OPERATION_IMAGE, 'image_generation', 4, 80_000]]);
    expect([q.maximumCredits, q.maximumUsdMicros, q.projectVersionId]).toEqual([4, 80_000, version.id]);
    const [ligneQ] = await db.select().from(schema.studioQuotes).where(eq(schema.studioQuotes.id, q.id));
    const [rel] = await db.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, ligneQ!.promptReleaseId!));
    expect(ligneQ!.inputHash).toBe(empreinteEntreesDevisImage({
      workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: version.id, contentHash: version.contentHash, impactPlanHash: ligneQ!.impactPlanHash,
      pricingVersion: PRICING_VERSION, lignes: q.lignes, epinglage: { promptReleaseId: rel!.id, releaseHash: rel!.releaseHash },
    }, empreinteConsigne(compilation.consigne)));

    // Approbation : débit, job, parametres construits par le serveur.
    const s0 = await solde();
    const a = await approuver(q);
    expect(a, JSON.stringify(a)).toMatchObject({ ok: true, deja: false, job: { etat: 'queued' } });
    if (!a.ok) return;
    expect(await solde()).toBe(s0 - 4);
    const job = await jobDe(a.job.id);
    const snap = job.snapshot as SnapshotJob;
    expect(snap.parametres).toEqual(parametresDepuisConsigne(compilation.consigne));
    expect(lireParametresImage(snap.parametres)).toEqual({ ok: true, parametres: snap.parametres });
    expect(snap.parametres).toMatchObject({ schema: 'studio_image/1', promptRunId: compilation.runId, references: [{ assetId: id5, sha256: expect.stringMatching(/^[a-f0-9]{64}$/), role: 'product' }] });

    // Worker : fournisseur fal de production, fetch rejoué · completed.
    expect(await executer(a.job.id)).toBe('completed');
    const posts = appels.filter((x) => x.methode === 'POST');
    expect(posts).toHaveLength(1);
    const corps = JSON.parse(posts[0]!.corps!) as { prompt: string; image_urls: string[]; aspect_ratio: string };
    expect(corps.prompt).toBe(promptFal(compilation.consigne.consigne));
    expect(corps.image_urls).toEqual([PHOTOS[4]]);
    expect(corps.aspect_ratio).toBe('4:5');
    const [payload] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, a.job.id), eq(schema.studioAuditEvents.action, 'job.provider.payload')));
    expect((payload!.details as { references: string[]; modele: string })).toMatchObject({ references: [id5], modele: 'fal-ai/nano-banana-2/edit' });

    // Média : studio_assets `generated`, relié au job, visible dans l'éditeur du projet.
    const fini = await jobDe(a.job.id);
    const assetId = (fini.result as { assets: Record<string, string> }).assets[OPERATION_IMAGE]!;
    const [asset] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, assetId));
    expect([asset!.origin, asset!.storageState, asset!.projectId, asset!.mime]).toEqual(['generated', 'stored', projectId, 'image/png']);
    const ed = await lireEditeurPour(ctxDe(ids, 'ua'), projectId);
    expect(ed.ok && ed.donnees.medias.map((m) => m.assetId)).toEqual([assetId]);

    // Qualité : le worker laisse `pending` (aucun constat) ; le contrôle L5-C ⇒ requires_review, jamais passed.
    expect(fini.qualityStatus).toBe('pending');
    const vue1 = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...SANS_FOURNISSEUR });
    expect(vue1.ok && vue1.vue.jobs[0]).toMatchObject({ id: a.job.id, etat: 'completed', qualite: 'pending', media: { assetId, url: `/api/studios/media/${assetId}` } });
    expect((await jobDe(a.job.id)).qualityStatus).toBe('pending'); // la lecture n'écrit rien
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId: a.job.id })).toEqual({ ok: true, qualite: 'requires_review' });
    expect((await jobDe(a.job.id)).qualityStatus).toBe('requires_review');
    const [ctl] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, a.job.id), eq(schema.studioAuditEvents.action, 'media.quality.control')));
    expect((ctl!.details as { nonVerifies: string[] }).nonVerifies).toEqual(['lunettes', 'bandeau']);
    // Idempotent : une seconde demande ne retranche rien.
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId: a.job.id })).toEqual({ ok: true, qualite: 'requires_review' });
    const vue2 = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...SANS_FOURNISSEUR });
    expect(vue2.ok && vue2.vue.jobs[0]!.libelleQualite).toContain('À relire');
  });
});

describe('négatifs · rien d’approuvé, rien de débité', () => {
  const rien = async (avant: Awaited<ReturnType<typeof compter>>, s0: number) => {
    const d = delta(avant, await compter(db));
    for (const k of ['jobs', 'approbations', 'registre', 'credits', 'outbox'] as const) expect(d[k], `${k} : ${JSON.stringify(d)}`).toBeUndefined();
    expect(await solde()).toBe(s0);
  };

  it('consigne modifiée après le devis (recompilée, retenue) · approbation refusée VERSION_CONFLICT', async () => {
    const { projectId } = await projetEpingle();
    await consigneRetenue(projectId);
    const q = await devisPret(projectId);
    await consigneRetenue(projectId, 'Coureuse sur un quai, lunettes et bandeau, contre-jour.');
    const avant = await compter(db);
    const s0 = await solde();
    expect(await approuver(q)).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    await rien(avant, s0);
  });

  it('référence retirée du catalogue entre devis et approbation · MISSING_REFERENCE, aucune substitution', async () => {
    const { projectId } = await projetEpingle();
    const id5 = await photo(projectId, 5);
    await consigneRetenue(projectId);
    const q = await devisPret(projectId);
    await db.update(schema.products).set({ imageUrls: PHOTOS.filter((_, i) => i !== 4) }).where(eq(schema.products.id, cat.produit.id));
    try {
      const avant = await compter(db);
      const s0 = await solde();
      const r = await approuver(q);
      expect(r).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', targetIds: [id5] });
      expect(r.ok ? '' : r.message).toContain('Rien n’a été débité');
      await rien(avant, s0);
      // Un nouveau devis est refusé de même.
      expect(await devisImagePour(ctxDe(ids, 'ua'), { projectId }, T)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    } finally {
      await db.update(schema.products).set({ imageUrls: PHOTOS }).where(eq(schema.products.id, cat.produit.id));
    }
  });

  it('opération image sans consigne · devis refusé, et un devis inséré à la main est refusé à l’approbation (plus jamais parametres: {})', async () => {
    const { projectId } = await projetEpingle();
    const v = await courante(projectId);
    // Le plan s_image posé par le chemin de l'éditeur, sans consigne.
    const plan = { shotId: PLAN_IMAGE, purpose: '', subject: 'x', action: '', framing: '', camera: '', lighting: '', environment: '', referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 0 };
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, changes: [{ op: 'add', path: `/shots/byId/${PLAN_IMAGE}`, newValue: plan, reason: 'x' }, { op: 'replace', path: '/shots/order', newValue: [PLAN_IMAGE], reason: 'x' }] });
    if (!w.ok) throw new Error(JSON.stringify(w));
    const avantDevis = await compter(db);
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: [OPERATION_IMAGE], variante: true }, base, T)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect(delta(avantDevis, await compter(db))).toEqual({});
    const lignes = [{ operation: OPERATION_IMAGE, nature: 'generation', profil: 'image_generation', unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
    const [q] = await db.insert(schema.studioQuotes).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: w.version.id, impactPlanHash: 'e'.repeat(64), inputHash: 'e'.repeat(64), pricingVersion: PRICING_VERSION, lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(T.getTime() + 600_000), createdBy: ids.ua }).returning();
    const avant = await compter(db);
    const s0 = await solde();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q!.id, inputHash: q!.inputHash, creditsAnnonces: 4, idempotencyKey: `fb-${randomUUID()}` }, { illimite: false, maintenant: T });
    expect(r).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    await rien(avant, s0);
    expect((await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.quoteId, q!.id))).length).toBe(0);
  });

  it('consigne écrite à la main dans le contenu (non attestée) · devis refusé', async () => {
    const { projectId } = await projetEpingle();
    const { version } = await consigneRetenue(projectId);
    const c = consigneDuContenu(version.content as ContenuVersion)!;
    const forgee = { ...c, consigne: { ...c.consigne, generationInstruction: 'Reprendre le mannequin de Lumière Botanique.' } };
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: version.id, changes: [{ op: 'replace', path: '/styleRef/consigneImage', newValue: forgee, reason: 'navigateur' }] });
    expect(w.ok).toBe(true);
    const avant = await compter(db);
    const r = await devisImagePour(ctxDe(ids, 'ua'), { projectId }, T);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(r.ok ? '' : r.message).toContain('ne vient pas d’une compilation validée par le serveur');
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('retenir · runId d’un autre projet, base périmée (409), brief changé depuis la compilation : refusés, rien écrit', async () => {
    const a = await projetEpingle();
    const b = await projetEpingle();
    repondreConsigne();
    const ca = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId: a.projectId, mode: 'generative_scene' }, deps);
    if (!ca.ok || ca.statut !== 'compilee') throw new Error('compilation');
    const vb = await courante(b.projectId);
    const avant = await compter(db);
    expect(await retenirConsignePour(ctxDe(ids, 'ua'), { projectId: b.projectId, baseVersionId: vb.id, runId: ca.runId })).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect(await retenirConsignePour(ctxDe(ids, 'ua'), { projectId: a.projectId, baseVersionId: a.versionId, runId: ca.runId })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    // Le brief bouge après la compilation · la consigne compilée est périmée.
    const va = await courante(a.projectId);
    const brief = (va.content as ContenuVersion).brief as unknown as BriefCanonique;
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: a.projectId, baseVersionId: va.id, changes: [{ op: 'replace', path: '/brief/invariants', newValue: [...brief.invariants, 'Fond clair'], reason: 'x' }] });
    if (!w.ok) throw new Error('version');
    const avant2 = await compter(db);
    expect(await retenirConsignePour(ctxDe(ids, 'ua'), { projectId: a.projectId, baseVersionId: w.version.id, runId: ca.runId })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect(delta(avant2, await compter(db))).toEqual({});
  });

  it('liaison vers l’annonce concurrente · retenue, mais devis refusé : le fournisseur ne reçoit pas ce fichier', async () => {
    const { projectId, source } = await projetEpingle();
    const v = await courante(projectId);
    const r = await associerReferencePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, assetId: source.sourceId, role: 'style', scope: 'background' }, O);
    if (!r.ok) throw new Error(JSON.stringify(r));
    await consigneRetenue(projectId);
    const d = await devisImagePour(ctxDe(ids, 'ua'), { projectId }, T);
    expect(d).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', targetIds: [source.sourceId] });
    const vue = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...SANS_FOURNISSEUR });
    expect(vue.ok && vue.vue.retenue?.verdict).toMatchObject({ ok: false, cause: 'non_transmissible' });
  });

  it('l’image du studio se devise seule · mélangée à une autre génération : refus', async () => {
    const { projectId } = await projetEpingle();
    const { version } = await consigneRetenue(projectId);
    const plan = { shotId: 's1', purpose: '', subject: 'autre', action: '', framing: '', camera: '', lighting: '', environment: '', referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 0 };
    const order = (version.content as ContenuVersion).shots.order;
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: version.id, changes: [{ op: 'add', path: '/shots/byId/s1', newValue: plan, reason: 'x' }, { op: 'replace', path: '/shots/order', newValue: [...order, 's1'], reason: 'x' }] });
    if (!w.ok) throw new Error('version');
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: [OPERATION_IMAGE, 'keyframe:s1'], variante: true }, base, T)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'operations', raison: 'l’image du studio se devise seule · retire keyframe:s1 de ce devis' }] });
  });

  it('fournisseur d’images non branché · approbation refusée, rien débité', async () => {
    const { projectId } = await projetEpingle();
    await consigneRetenue(projectId);
    const q = await devisPret(projectId);
    const avant = await compter(db);
    const s0 = await solde();
    expect(await approuver(q, { fournisseurImage: false })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    await rien(avant, s0);
  });

  it('lecteur ⇒ FORBIDDEN sur chaque geste (lecture permise, rien de disponible) ; autre espace ⇒ introuvable neutre', async () => {
    const { projectId } = await projetEpingle();
    const { compilation, version } = await consigneRetenue(projectId);
    if (!compilation.ok || compilation.statut !== 'compilee') throw new Error('compilation');
    const q = await devisPret(projectId);
    const avant = await compter(db);
    texte.recues.length = 0;
    etat.session = session(ids, 'uv');
    expect(await actions.compilerConsigneImage({ projectId, mode: 'generative_scene' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.retenirConsigneImage({ projectId, baseVersionId: version.id, runId: compilation.runId })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.demanderDevisImage({ projectId })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.approuverEtLancerImage({ quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: 4, idempotencyKey: 'fb-lecteur' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // Le lecteur client n'a pas le studio : même la lecture est refusée.
    expect(await actions.lireParcoursImage({ projectId })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.controlerMediaImage({ jobId: randomUUID() })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // Un rôle à `studio.read` seul : l'écran se lit, aucun geste n'y est présenté comme disponible.
    const lecture = { ...ctxDe(ids, 'ua'), permissions: { espace: new Set(['studio.read'] as const), plateforme: new Set<never>() } };
    const l = await lireParcoursImagePour(lecture as never, projectId, { ...O, ...SANS_FOURNISSEUR });
    expect(l.ok && l.vue.disponibilite).toMatchObject({ compilation: { disponible: false }, retenir: { disponible: false }, devis: { disponible: false }, lancement: { disponible: false } });
    expect(l.ok && l.vue.peutRelire).toBe(false);
    expect(texte.recues).toHaveLength(0);
    // Autre espace · même réponse qu'un identifiant inconnu, sans cible.
    const ub = ctxDe(ids, 'ub');
    const inconnu = randomUUID();
    for (const r of [
      await devisImagePour(ub, { projectId }, T), await devisImagePour(ub, { projectId: inconnu }, T),
      await retenirConsignePour(ub, { projectId, baseVersionId: version.id, runId: compilation.runId }),
      await lireParcoursImagePour(ub, projectId, { ...O, ...SANS_FOURNISSEUR }),
      await approuverImagePour(ub, { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: 4, idempotencyKey: 'fb-ub' }, { illimite: false, plafond: null, fournisseurImage: true }),
      await compilerEtAttesterPour(ub, { projectId, mode: 'generative_scene' }, deps),
    ]) expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    expect(delta(avant, await compter(db))).toEqual({});
  });
});

describe('les autres opérations gardent leur comportement L3', () => {
  it('un devis sans keyframe:s_image garde l’empreinte L3 et parametres: {}', async () => {
    const { projectId } = await projetEpingle();
    const { version } = await consigneRetenue(projectId);
    const plan = { shotId: 's1', purpose: '', subject: 'autre', action: '', framing: '', camera: '', lighting: '', environment: '', referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 0 };
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: version.id, changes: [{ op: 'add', path: '/shots/byId/s1', newValue: plan, reason: 'x' }, { op: 'replace', path: '/shots/order', newValue: [...(version.content as ContenuVersion).shots.order, 's1'], reason: 'x' }] });
    if (!w.ok) throw new Error('version');
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['keyframe:s1'], variante: true }, base, T);
    if (!d.ok) throw new Error(JSON.stringify(d));
    const a = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: 4, idempotencyKey: `fb-${randomUUID()}` }, { illimite: true, maintenant: T });
    if (!a.ok) throw new Error(JSON.stringify(a));
    expect(((await jobDe(a.job.id)).snapshot as SnapshotJob).parametres).toEqual({});
    const [audit] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, d.devis.id), eq(schema.studioAuditEvents.action, 'quote.create')));
    expect(audit!.details).not.toHaveProperty('consigneImage');
  });
});
