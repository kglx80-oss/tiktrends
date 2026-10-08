import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

/**
 * R3 · bout en bout · le contrôle visuel, ligne du devis accepté.
 *
 * Décision du propriétaire (8 octobre) : activé PAR DÉFAUT, ligne VISIBLE et
 * CHIFFRÉE du devis, acceptée avant génération, décochable ; jamais un débit
 * ajouté après coup. Chemin réel du parcours image (même harnais que
 * `fb-parcours-db.test.ts`) : consigne → devis → approbation → worker (fal
 * rejoué) → média livré → contrôle de l'écran (`controlerMediaPour`), avec le
 * VRAI adaptateur Anthropic pointé vers un faux serveur local. On lit : lignes
 * et total du devis, requêtes fal et Anthropic reçues, lignes `ai_spend`,
 * statut qualité en base.
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

import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { OPERATION_CONTROLE_VISION, borneControleVisionParImageMicros } from '@tiktrends/core';
import { randomUUID } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import { OPERATION_IMAGE, type DecisionFournisseur, type StockageStudio, type LigneDevis } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { lireParcoursImagePour, devisImagePour, approuverImagePour, controlerMediaPour } from '../lib/studios/image/parcours';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
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
const STOCK = new StockageMemoire();
/** Les médias livrés, relus là où le worker les a déposés (le stockage S3 n'existe pas en test). */
const MEDIAS = resolveurMediasStudio({ lire: async (m: { storageKey: string }) => STOCK.relire(m.storageKey) });
async function executer(jobId: string): Promise<string> {
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: null, horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  const m = new MoteurStudio({ base, fournisseur, stockage: STOCK, decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms) });
  for (let i = 0; i < 20; i++) {
    const s = (await jobDe(jobId)).state;
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(s)) return s;
    await m.tour();
    horloge.ms += 16_000;
  }
  return (await jobDe(jobId)).state;
}

let srv: FauxServeur;
const envAvant = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', envAvant.cle], ['ANTHROPIC_BASE_URL', envAvant.url], ['ANTHROPIC_GEN_MODEL', envAvant.modele], ['AI_SPEND_CAP_USD', envAvant.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-r3';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.ANTHROPIC_GEN_MODEL = 'claude-sonnet-5';
  process.env.AI_SPEND_CAP_USD = '10';
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
  await db.update(schema.workspaces).set({ creditsBalance: 100 }).where(eq(schema.workspaces.id, ids.wsA));
});
beforeEach(() => { etat.session = session(ids, 'ua'); texte.recues.length = 0; appels = []; });


const MODELE = 'claude-sonnet-5';
const sortieVision = (sortieId: string) => JSON.stringify({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { verdict: 'passed', issues: [], unverifiable: [], summary: `Lunettes et bandeau visibles sur ${sortieId}` } });
const anthropic = async () => db.select().from(schema.aiSpend).where(eq(schema.aiSpend.provider, 'anthropic'));

describe('contrôle visuel coché par défaut · ligne du devis, exécuté dans sa borne', () => {
  it('devis = image + contrôle visuel (borne, total inclus) ; worker : 1 soumission fal ; écran : 1 requête vision dans la ligne approuvée', async () => {
    const { projectId } = await projetEpingle();
    await consigneRetenue(projectId);
    const q = await devisPret(projectId);
    const borne = borneControleVisionParImageMicros(MODELE);
    expect(q.lignes.map((l: LigneDevis) => [l.operation, l.profil, l.unites, l.credits, l.usdMicros, l.natureCout])).toEqual([
      [OPERATION_IMAGE, 'image_generation', 1, 4, 80_000, 'borne'],
      [OPERATION_CONTROLE_VISION, 'controle_visuel', 1, 0, borne, 'borne'],
    ]);
    // Le total INCLUT la ligne ; le prix en crédits de l'offre ne change pas.
    expect([q.maximumCredits, q.maximumUsdMicros]).toEqual([4, 80_000 + borne]);
    expect(q.qualification).toEqual({ nature: 'borne', libelle: 'maximum', raison: null });
    const vue = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...SANS_FOURNISSEUR });
    expect(vue.ok && vue.vue.devis?.lignes.map((l) => l.libelle)).toEqual(['Image · keyframe:s_image', 'Contrôle visuel · 1 image']);

    const a = await approuver(q);
    if (!a.ok) throw new Error(JSON.stringify(a));
    expect(await executer(a.job.id)).toBe('completed');
    // Le worker n'envoie au fournisseur d'images QUE la production : une soumission.
    expect(appels.filter((x) => x.methode === 'POST')).toHaveLength(1);
    const fini = await jobDe(a.job.id);
    expect(fini.qualityStatus, 'le worker a tranché seul · le contrôle visuel approuvé ne pourrait plus s’exécuter').toBe('pending');
    expect(await anthropic()).toEqual([]);

    // L'écran déclenche le contrôle d'un média livré `pending` · la vision part, dans sa borne.
    const sortieId = `sta_${(fini.result as { assets: Record<string, string> }).assets[OPERATION_IMAGE]}`;
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const c = await controlerMediaPour(ctxDe(ids, 'ua'), { jobId: a.job.id }, { medias: MEDIAS });
    expect(c.ok, JSON.stringify(c)).toBe(true);
    expect(srv.requetes(), JSON.stringify(await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, a.job.id), eq(schema.studioAuditEvents.action, 'media.quality.control'))))).toBe(1);
    const lignes = await anthropic();
    expect(lignes.map((l) => [l.action, l.inputTokens, l.reconcileReason])).toEqual([['studio-prompt:quality.visual', 9000, null]]);
    expect(lignes[0]!.estimatedUsd * 1e6, 'réservation au-delà de la ligne approuvée').toBeLessThanOrEqual(borne);
    expect((await jobDe(a.job.id)).qualityStatus).not.toBe('pending');
  });

  it('décoché avant d’accepter ⇒ devis sans la ligne, total sans elle ; après livraison, aucune requête vision', async () => {
    const { projectId } = await projetEpingle();
    await consigneRetenue(projectId);
    const d = await devisImagePour(ctxDe(ids, 'ua'), { projectId, controleVision: false }, T);
    if (!d.ok) throw new Error(JSON.stringify(d));
    expect(d.devis.lignes.map((l: LigneDevis) => l.operation)).toEqual([OPERATION_IMAGE]);
    expect([d.devis.maximumCredits, d.devis.maximumUsdMicros]).toEqual([4, 80_000]);
    const a = await approuver(d.devis);
    if (!a.ok) throw new Error(JSON.stringify(a));
    expect(await executer(a.job.id)).toBe('completed');
    srv.comportement({ type: 'ok', entree: 10, sortie: 10, texte: '{}' });
    const avant = (await anthropic()).length;
    await controlerMediaPour(ctxDe(ids, 'ua'), { jobId: a.job.id }, { medias: MEDIAS });
    expect({ requetes: srv.requetes(), anthropic: (await anthropic()).length - avant }, 'contrôle visuel exécuté alors qu’il a été décoché').toEqual({ requetes: 0, anthropic: 0 });
    expect((await jobDe(a.job.id)).qualityStatus).toBe('requires_review');
  });
});
