import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Raccord V5 · Lot 2c · la CONFIRMATION du devis de l'assistant, sur une VRAIE
 * base (pglite + migrations réelles), fournisseur SIMULÉ · adaptateur texte
 * simulé pour compiler la consigne, AUCUN appel payant réel, aucun débit hors
 * crédits de l'espace.
 *
 * On lit les LIGNES écrites · le même chemin serveur que les actions de
 * l'assistant (`demanderDevisImage` → `devisImagePour` ; `approuverEtLancerImage`
 * → `approuverImagePour` → `approuverEtMettreEnFile`) :
 *
 *  · le DEVIS réel porte des lignes, un montant et une échéance ;
 *  · la CONFIRMATION crée, en UNE transaction, le job (`queued`), la réserve au
 *    registre (`studio_budget_ledger`) et l'événement outbox · rien de partiel ;
 *  · elle est idempotente · la même clé de clic rejoue le MÊME job, sans second
 *    débit ni second outbox ;
 *  · un devis EXPIRÉ est refusé (`QUOTE_EXPIRED`) · aucun job, aucune réserve ;
 *  · un dépassement de plafond est refusé (`BUDGET_EXCEEDED`) · rien débité.
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
import { db, schema, eq } from '@tiktrends/db';
import { controleVisionApprouve } from '@tiktrends/core';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { devisImagePour, approuverImagePour } from '../lib/studios/image/parcours';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const T = new Date('2026-10-08T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
const deps = { adaptateur: texte, environnement: 'test' as const, ...O };
let cat: Catalogue;

function repondreConsigne() {
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: 'Coureur portant les lunettes et le bandeau, lumière rasante.', negativeConstraints: ['Pas de texte dans l’image'],
        needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
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

async function photo(projectId: string, n: number): Promise<string> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[n - 1]!.assetId;
}

/** Un projet prêt au devis image · produit épinglé, consigne compilée (simulée) et retenue. */
async function projetDevisable() {
  const p = await projetStatique(db, ids, cat);
  let v = await courante(p.projectId);
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, productId: cat.produit.id, photoId: await photo(p.projectId, 5), composants: ['lunettes', 'bandeau'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  repondreConsigne();
  const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId: p.projectId, mode: 'generative_scene' }, deps);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  v = await courante(p.projectId);
  const r = await retenirConsignePour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}

/** Même paramètre `controleVision` que l'assistant · `false` décoché, sinon défaut (ON). */
const devis = async (projectId: string, controleVision?: false) => {
  const d = await devisImagePour(ctxDe(ids, 'ua'), { projectId, controleVision }, T);
  if (!d.ok) throw new Error(JSON.stringify(d));
  return d.devis;
};

const approuver = (q: { id: string; inputHash: string; maximumCredits: number }, o: { cle?: string; fournisseurImage?: boolean; plafond?: { capUsd: number; depenseUsd: number; bloque: boolean } | null; maintenant?: Date } = {}) =>
  approuverImagePour(
    ctxDe(ids, 'ua'),
    { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: o.cle ?? `assist-${randomUUID()}` },
    { illimite: false, plafond: o.plafond ?? null, fournisseurImage: o.fournisseurImage ?? true, maintenant: o.maintenant ?? T },
  );

beforeAll(async () => {
  await semer(db, schema, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme(ids.ua));
  cat = await semerCatalogue(base, ids);
  // L'espace a des crédits · on EXERCE le vrai débit (pas un compte illimité) ·
  // provisionné large, jamais rechargé, aucun appel fournisseur payant.
  await db.update(schema.workspaces).set({ creditsBalance: 1000 }).where(eq(schema.workspaces.id, ids.wsA));
  etat.session = session(ids, 'ua');
});

beforeEach(() => { reponse = () => ({}); });

describe('Lot 2c · le devis serveur réel de l’assistant', () => {
  it('le devis porte des lignes, un montant et une échéance · l’image y est', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    expect(d.lignes.length, 'le devis doit porter au moins une ligne').toBeGreaterThan(0);
    expect((d.lignes as Array<{ operation?: string }>).some((l) => l.operation === 'keyframe:s_image'), 'la ligne de l’image n’est pas au devis').toBe(true);
    expect(d.maximumUsdMicros, 'montant nul').toBeGreaterThan(0);
    expect(d.maximumCredits, 'crédits nuls').toBeGreaterThan(0);
    expect(new Date(d.expiresAt).getTime(), 'échéance non postérieure à maintenant').toBeGreaterThan(T.getTime());
    // relecture décochée (controleVision:false, même paramètre que l'assistant) ⇒ jamais de ligne de relecture approuvée
    const sansRelecture = await devis(projectId, false);
    expect(controleVisionApprouve(sansRelecture.lignes), 'décochée, aucune ligne de relecture ne doit être approuvée').not.toBe(true);
  });
});

describe('Lot 2c · confirmation transactionnelle, idempotente', () => {
  it('confirmer crée job + réserve + outbox en UNE transaction (rien de partiel)', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    const avant = await compter(base);
    const r = await approuver(d);
    expect(r.ok, `approbation refusée : ${JSON.stringify(r)}`).toBe(true);
    const apres = await compter(base);
    // UN job, UNE approbation, UNE réserve, UN outbox, UN débit crédits, UN audit · ensemble.
    expect(delta(avant, apres)).toEqual({ jobs: 1, approbations: 1, registre: 1, outbox: 1, credits: 1, audit: 1 });
    if (r.ok) {
      const [job] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
      expect(job!.state).toBe('queued');
      const [out] = await db.select().from(schema.studioOutbox).where(eq(schema.studioOutbox.aggregateId, r.job.id));
      expect(out!.topic).toBe('studio.job.queued');
      const [res] = await db.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, r.job.id));
      expect(res!.kind).toBe('reserve');
    }
  });

  it('la même clé de clic rejoue le MÊME job · aucun second débit ni outbox', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    const cle = `assist-idem-${randomUUID()}`;
    const premier = await approuver(d, { cle });
    expect(premier.ok).toBe(true);
    const avant = await compter(base);
    const second = await approuver(d, { cle });
    expect(second.ok, 'le rejeu idempotent doit réussir').toBe(true);
    if (premier.ok && second.ok) {
      expect(second.job.id, 'la même clé doit rendre le même job').toBe(premier.job.id);
      expect(second.deja, 'le second appel doit être marqué « déjà »').toBe(true);
    }
    // aucune ligne de plus (ni job, ni registre, ni outbox, ni débit crédits)
    expect(delta(avant, await compter(base))).toEqual({});
  });
});

describe('Lot 2c · refus sans débit', () => {
  it('un devis EXPIRÉ est refusé (QUOTE_EXPIRED) · aucun job, aucune réserve', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    const avant = await compter(base);
    const apresExpiration = new Date(new Date(d.expiresAt).getTime() + 60_000);
    const r = await approuver(d, { maintenant: apresExpiration });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('QUOTE_EXPIRED');
    expect(delta(avant, await compter(base)), 'un devis expiré ne doit rien écrire').toEqual({});
  });

  it('un dépassement de plafond est refusé (BUDGET_EXCEEDED) · rien débité', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    const avant = await compter(base);
    // plafond serré · la dépense déjà faite + ce devis dépassent le plafond.
    const r = await approuver(d, { plafond: { capUsd: 0.01, depenseUsd: 0, bloque: false } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BUDGET_EXCEEDED');
    expect(delta(avant, await compter(base)), 'un dépassement ne doit rien écrire').toEqual({});
  });

  it('sans fournisseur d’images branché, rien n’est approuvé ni débité', async () => {
    const projectId = await projetDevisable();
    const d = await devis(projectId);
    const avant = await compter(base);
    const r = await approuver(d, { fournisseurImage: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(delta(avant, await compter(base))).toEqual({});
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · retirer l'insert outbox de la transaction → « job + réserve + outbox ensemble » tombe (delta outbox 0).
 *  · ignorer la clé d'idempotence (créer un second job) → « même job rejoué » tombe (delta jobs 1).
 *  · ne pas vérifier l'expiration → « QUOTE_EXPIRED » tombe (approbation réussit, delta non vide).
 */
