import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

/**
 * F1 · le contrôle visuel suit SON interrupteur (cahier 01 §14), même quand la
 * génération d'images est allumée.
 *
 *  · coupé : la case n'est pas offerte (`controleVision.disponible = false`),
 *    le devis ne porte PAS la ligne `controle:vision` (sinon le worker ne
 *    réclamerait jamais le job) ; un devis émis avant la coupure n'est pas
 *    approuvable ; un média dont le devis portait la vision n'est pas relu ;
 *  · allumé : case offerte, ligne au devis (comportement R3).
 *
 * Vraies actions serveur, vraie base (pglite), registre publié, modèle simulé
 * pour la consigne. Aucun appel réseau : ni devis ni lecture n'appellent de
 * fournisseur.
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
vi.mock('../lib/spend-guard', async (o) => ({ ...(await o<typeof import('../lib/spend-guard')>()), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq } from '@tiktrends/db';
import { OPERATION_IMAGE, OPERATION_CONTROLE_VISION, OPERATION_JOB_STUDIO, type LigneDevis } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import * as image from '../app/actions/studios/image';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ids = etat.ids;
const T = new Date();
const O = { veilleOuverte: true, maintenant: T };
let cat: Catalogue;
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
const cleAvant = process.env.ANTHROPIC_API_KEY;
const BRANCHE = { FAL_KEY: 'cle-factice-f1:sans-valeur', STUDIO_FOURNISSEUR_REEL: 'autorise', S3_ENDPOINT: 'http://stockage.invalide', S3_BUCKET: 'seau', S3_ACCESS_KEY_ID: 'f', S3_SECRET_ACCESS_KEY: 'f' };

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};

/** Projet épinglé, consigne compilée (modèle simulé) puis retenue · prêt pour un devis image. */
async function projetPret(): Promise<string> {
  const p = await projetStatique(db, ids, cat);
  const c0 = await chargerCatalogueProjet(ctxDe(ids, 'ua'), p.projectId, O);
  if (!c0.ok) throw new Error(c0.code);
  const photoId = c0.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: (await courante(p.projectId)).id, productId: cat.produit.id, photoId, composants: ['lunettes', 'bandeau'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
      generationInstruction: 'Coureur, piste au lever du jour.', negativeConstraints: [], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
      referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
    } };
  };
  const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId: p.projectId, mode: 'generative_scene' }, { adaptateur: texte, environnement: 'test', ...O });
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const r = await retenirConsignePour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: (await courante(p.projectId)).id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}
const operations = (lignes: LigneDevis[]) => lignes.map((l) => l.operation);

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'cle-factice-f1-jamais-appelee';
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
  await db.update(schema.workspaces).set({ creditsBalance: 100 }).where(eq(schema.workspaces.id, ids.wsA));
});
afterAll(() => { if (cleAvant === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = cleAvant; });
beforeEach(() => { etat.session = session(ids, 'ua'); vi.unstubAllEnvs(); });

describe('contrôle visuel coupé, génération allumée', () => {
  it('case non offerte, devis sans la ligne de vision ; allumé, case et ligne reviennent', async () => {
    const projectId = await projetPret();
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'generation_image');
    const vue = await image.lireParcoursImage({ projectId });
    expect(vue.ok && vue.vue.controleVision.disponible, 'case du contrôle visuel offerte alors qu’il est coupé').toBe(false);
    const d = await image.demanderDevisImage({ projectId });
    if (!d.ok) throw new Error(JSON.stringify(d));
    expect(operations(d.devis.lignes), 'ligne de vision au devis alors qu’elle est coupée').toEqual([OPERATION_IMAGE]);

    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'generation_image controle_visuel');
    const vue2 = await image.lireParcoursImage({ projectId });
    expect(vue2.ok && vue2.vue.controleVision.disponible).toBe(true);
    const d2 = await image.demanderDevisImage({ projectId });
    if (!d2.ok) throw new Error(JSON.stringify(d2));
    expect(operations(d2.devis.lignes)).toEqual([OPERATION_IMAGE, OPERATION_CONTROLE_VISION]);
  });

  it('devis avec vision émis avant la coupure · approbation refusée, rien écrit ; média livré avec vision · pas relu', async () => {
    const projectId = await projetPret();
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'generation_image controle_visuel');
    const d = await image.demanderDevisImage({ projectId });
    if (!d.ok) throw new Error(JSON.stringify(d));
    for (const [k, v] of Object.entries(BRANCHE)) vi.stubEnv(k, v);
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'generation_image');
    const n = async () => [(await db.select().from(schema.studioApprovals)).length, (await db.select().from(schema.studioJobs)).length, (await db.select().from(schema.studioBudgetLedger)).length];
    const avant = await n();
    const r = await image.approuverEtLancerImage({ quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `f1-${d.devis.id}` });
    expect(!r.ok && [r.code, r.targetIds]).toEqual(['UNSUPPORTED_CAPABILITY', ['controle_visuel']]);
    expect(await n()).toEqual(avant);

    // Un job livré dont le devis portait la vision (semé tel que le worker le laisse).
    const v = await courante(projectId);
    const [j] = await db.insert(schema.studioJobs).values({
      workspaceId: ids.wsA, brandId: v.brandId, projectId, projectVersionId: v.id, quoteId: d.devis.id, operation: OPERATION_JOB_STUDIO, state: 'completed',
      idempotencyKey: `f1-livre-${d.devis.id}`, inputHash: d.devis.inputHash, snapshot: { v: 1, lignes: d.devis.lignes }, createdBy: ids.ua,
    }).returning();
    const c = await image.controlerMediaImage({ jobId: j!.id });
    expect(!c.ok && [c.code, c.targetIds], 'la vision coupée a relu un média').toEqual(['UNSUPPORTED_CAPABILITY', ['controle_visuel']]);
    expect((await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, j!.id)))[0]!.qualityStatus).toBe('pending');
  });
});
