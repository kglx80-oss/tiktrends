import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * L6-A · storyboard, timeline et images clés des plans sur une VRAIE base
 * (pglite + migrations réelles). Adaptateur texte SIMULÉ pour
 * `storyboard.plan` et `shot.image` (registre publié, release, traces) ;
 * worker du moteur L3 avec fournisseur et stockage SIMULÉS. 0 $, aucun réseau.
 *
 * On lit les LIGNES : versions et contenus, plans d'impact rangés, empreintes
 * des images clés avant/après, attestations, devis et `inputHash`, jobs et
 * `snapshot.parametres`, et le compte des devis et jobs pour les gestes qui
 * ne doivent en créer aucun.
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
  empreintesKeyframes, consigneDuPlan, parametresDepuisConsignePlan, empreinteConsignesDevis, empreinteEntreesDevisImage, entreesConsignePlan,
  grapheImpact, calculerPlanImpact, lireParametresImage, ACTION_CONSIGNE_PLAN, PRICING_VERSION, INTERDIT_TEXTE_IMAGE_CLE, surimpressions, PISTES_VIDEO,
  type ContenuVersion, type SnapshotJob, type LigneDevis, type PlanStudio,
} from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { enregistrerVersion } from '../lib/studios/depot';
import { creerDevis, estimerImpact } from '../lib/studios/execution/commandes';
import { planifierStoryboardPour } from '../lib/studios/video/storyboard';
import { compilerConsignePlanPour, retenirConsignePlanPour } from '../lib/studios/video/consigne';
import { appliquerOperationVideoPour, devisKeyframePour, approuverKeyframePour } from '../lib/studios/video/commandes';
import { lireVideoPour } from '../lib/studios/video/lecture';
import * as actions from '../app/actions/studios/video';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import { banc, jusquAuBout } from './l3-harnais';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const T = new Date('2026-10-08T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
const LECTURE = { maintenant: T, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
let cat: Catalogue;

/* ── Le modèle simulé · une réponse par tâche, construite sur ce qu'il a REÇU ── */
const json = (a: AppelModele, cle: 'CONTEXT_JSON' | 'TASK_INPUTS_JSON') => {
  const t = a.messages[2]!.contenu;
  const brut = cle === 'TASK_INPUTS_JSON' ? t.split('TASK_INPUTS_JSON=')[1]! : t.split('CONTEXT_JSON=')[1]!.split(' TASK_INPUTS_JSON=')[0]!;
  return JSON.parse(brut) as Record<string, unknown>;
};
let instruction = 'Léa en veste jaune devant le miroir, lumière du matin, plan rapproché.';
/** Le brief du projet n'a aucun texte (mode sans texte) · un modèle qui en pose quand même est refusé par le registre. */
let texteEcran: string[] = [];
const repondre = (a: AppelModele): unknown => {
  if (a.action === 'studio-prompt:storyboard.plan') {
    const ctx = json(a, 'CONTEXT_JSON') as { allocatedIds: Array<{ id: string }>; resolvedDocuments: Array<{ id: string }> };
    const [s1, s2] = ctx.allocatedIds.map((x) => x.id);
    const lea = ctx.resolvedDocuments.find((d) => d.id === 'c_lea') ? ['c_lea'] : [];
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        shots: [
          { shotId: s1, purpose: 'Accroche', subject: 'Léa face au miroir', action: 'soupire en voyant un bouton', framing: 'plan rapproché', camera: 'travelling avant lent', lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: lea, narration: 'Encore un bouton ce matin ?', onScreenText: texteEcran, speechMode: 'voiceover', estimatedDurationMs: 2500 },
          { shotId: s2, purpose: 'Appel à l’action', subject: 'Léa sourit', action: 'se tourne vers la caméra', framing: 'plan moyen', camera: 'fixe', lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: lea, narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 2000 },
        ],
        estimatedTotalMs: 4500, durationCaveat: 'Durées estimées tant que la voix réelle manque.',
      },
    };
  }
  if (a.action === 'studio-prompt:shot.image') {
    const ti = json(a, 'TASK_INPUTS_JSON') as { referenceIds: string[] };
    const ctx = json(a, 'CONTEXT_JSON') as { references: Array<{ assetId: string; requiredComponents: string[] }> };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: instruction,
        referenceBindings: ti.referenceIds.map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
        protectedComponents: [...new Set(ctx.references.flatMap((r) => r.requiredComponents))],
      },
    };
  }
  throw new Error(`tâche non prévue ${a.action}`);
};
const texte = adaptateurSimule(repondre);
const deps = { adaptateur: texte, environnement: 'test' as const, maintenant: T };

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};
const contenuDe = async (projectId: string) => (await courante(projectId)).content as ContenuVersion;
const compte = async (projectId: string) => ({
  devis: (await db.select().from(schema.studioQuotes).where(eq(schema.studioQuotes.projectId, projectId))).length,
  jobs: (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.projectId, projectId))).length,
  impacts: (await db.select().from(schema.studioImpactPlans).where(eq(schema.studioImpactPlans.projectId, projectId))).length,
  versions: (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId))).length,
  runs: (await db.select().from(schema.studioPromptRuns)).length,
});
const solde = async () => (await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsA)))[0]!.c;
const dernierImpact = async (projectId: string, versionId: string) => {
  const [i] = await db.select().from(schema.studioImpactPlans).where(and(eq(schema.studioImpactPlans.projectId, projectId), eq(schema.studioImpactPlans.toVersionId, versionId)));
  return i!;
};

const geste = async (projectId: string, operation: unknown) => {
  const v = await courante(projectId);
  const r = await appliquerOperationVideoPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, operation });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { avant: v, ...r };
};

async function photo(projectId: string, n: number): Promise<string> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[n - 1]!.assetId;
}

const PLAN = (o: Partial<PlanStudio> & { shotId: string }): Partial<PlanStudio> => ({
  purpose: 'Accroche', subject: 'Léa devant le miroir', action: 'regarde son reflet', framing: 'plan rapproché', camera: 'fixe', lighting: 'matin',
  environment: 'salle de bain', referenceIds: ['c_lea'], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});

/**
 * Projet vidéo · brief L4-B, produit épinglé (photo n°5, lunettes + bandeau),
 * fiche Léa (veste jaune) ; trois plans : Léa sur 1 et 2 (voix off), le
 * produit sur 3. Écrit par les gestes réels (version, scénario).
 */
async function projetVideo() {
  const p = await projetStatique(db, ids, cat);
  let v = await courante(p.projectId);
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, productId: cat.produit.id, photoId: await photo(p.projectId, 5), composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  v = await courante(p.projectId);
  const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, changes: [{ op: 'replace', path: '/characterRefs', newValue: { c_lea: { tenue: 'veste jaune', cheveux: 'carré brun' } }, reason: 'fiche' }], raison: 'fiche' });
  if (!w.ok) throw new Error(JSON.stringify(w));
  await geste(p.projectId, {
    type: 'scenario', plans: [
      PLAN({ shotId: 's1', narration: 'Tu en as marre des boutons ?', speechMode: 'voiceover', onScreenText: ['Marre des boutons ?'] }),
      PLAN({ shotId: 's2', purpose: 'Problème', action: 'touche sa joue', narration: 'Chaque matin, la même déception.', speechMode: 'voiceover' }),
      PLAN({ shotId: 's3', purpose: 'Appel à l’action', subject: 'les lunettes posées sur le lavabo', action: 'reflet qui glisse', referenceIds: [cat.produit.id] }),
    ],
  });
  return p.projectId;
}

/** Compiler (attesté) puis retenir la consigne d'un plan · chemin réel. */
async function consigneRetenue(projectId: string, shotId: string) {
  const c = await compilerConsignePlanPour(ctxDe(ids, 'ua'), { projectId, shotId }, deps);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const v = await courante(projectId);
  const r = await retenirConsignePlanPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { compilation: c, version: r.version };
}

/** Devis + approbation + worker simulé jusqu'au bout · l'image clé du plan est livrée. */
async function produireKeyframe(projectId: string, shotId: string) {
  const d = await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId }, T);
  if (!d.ok) throw new Error(JSON.stringify(d));
  const a = await approuverKeyframePour(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `l6a-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: true, maintenant: T });
  if (!a.ok) throw new Error(JSON.stringify(a));
  const fin = await jusquAuBout(base, banc(base).moteur, a.job.id);
  expect(fin).toBe('completed');
  return { devis: d.devis, job: a.job };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
  await db.update(schema.workspaces).set({ creditsBalance: 200 }).where(eq(schema.workspaces.id, ids.wsA));
});
beforeEach(() => { etat.session = session(ids, 'ua'); texte.recues.length = 0; texteEcran = []; instruction = 'Léa en veste jaune devant le miroir, lumière du matin, plan rapproché.'; });

/* ────────────────────────────────── VIDEO-01 ──────────────────────────────── */

describe('VIDEO-01 · brief → vidéo deux plans · champs distincts', () => {
  it('storyboard.plan (registre, release, trace) rend deux plans ; rien n’est écrit tant qu’ils ne sont pas retenus', async () => {
    const projectId = await projetVideo();
    const avant = await compte(projectId);
    const v = await courante(projectId);
    const r = await planifierStoryboardPour(ctxDe(ids, 'ua'), { projectId, nbPlans: 2, dureeCibleMs: 6000, speechMode: 'voiceover' }, deps);
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, statut: 'plans' });
    if (!r.ok || r.statut !== 'plans') return;
    expect(texte.recues).toHaveLength(1);
    // Identifiants ALLOUÉS par le serveur, jamais ceux des plans existants.
    expect(r.plans.map((p) => p.shotId)).toEqual(['s4', 's5']);
    expect({ ...(await compte(projectId)), runs: 0 }).toEqual({ ...avant, runs: 0 });
    expect((await compte(projectId)).runs).toBe(avant.runs + 1);
    expect((await courante(projectId)).id).toBe(v.id);

    // Retenir · même validation qu'une saisie, nouvelle version, timeline recalée, plan d'impact rangé.
    const g = await geste(projectId, { type: 'scenario', plans: r.plans });
    const c = g.version.content as ContenuVersion;
    expect(c.shots.order).toEqual(['s4', 's5']);
    const s4 = c.shots.byId.s4!;
    expect({ subject: s4.subject, action: s4.action, camera: s4.camera, narration: s4.narration, onScreenText: s4.onScreenText, estimatedDurationMs: s4.estimatedDurationMs })
      .toEqual({ subject: 'Léa face au miroir', action: 'soupire en voyant un bouton', camera: 'travelling avant lent', narration: 'Encore un bouton ce matin ?', onScreenText: [], estimatedDurationMs: 2500 });
    expect(c.timeline!.durationTicks).toBe(4_500_000);
    expect(Object.values(c.timeline!.tracks[PISTES_VIDEO.video]!.items).map((i) => [i.source.shotId, i.startTicks])).toEqual([['s4', 0], ['s5', 2_500_000]]);
    const apres = await compte(projectId);
    expect({ devis: apres.devis - avant.devis, jobs: apres.jobs - avant.jobs, versions: apres.versions - avant.versions, impacts: apres.impacts - avant.impacts }).toEqual({ devis: 0, jobs: 0, versions: 1, impacts: 1 });
  });

  it('brief sans texte · un storyboard qui pose du texte écran est refusé par le registre (trace en échec), rien retenu', async () => {
    const projectId = await projetVideo();
    const avant = await compte(projectId);
    texteEcran = ['Marre des boutons ?'];
    const r = await planifierStoryboardPour(ctxDe(ids, 'ua'), { projectId, nbPlans: 2, dureeCibleMs: 6000, speechMode: 'voiceover' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    const apres = await compte(projectId);
    expect({ ...apres, runs: 0 }).toEqual({ ...avant, runs: 0 });
    expect(apres.runs).toBe(avant.runs + 1);
  });

  it('sans fournisseur de texte · refus dit, aucune trace, aucun appel', async () => {
    const projectId = await projetVideo();
    const avant = await compte(projectId);
    const r = await planifierStoryboardPour(ctxDe(ids, 'ua'), { projectId, nbPlans: 2, dureeCibleMs: 6000, speechMode: 'voiceover' }, { ...deps, adaptateur: null });
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'Le fournisseur de texte n’est pas configuré sur ce serveur. Rien n’a été facturé.' });
    expect(await compte(projectId)).toEqual(avant);
    expect(texte.recues).toHaveLength(0);
  });
});

/* ───────────────────── Images clés · consigne shot.image ──────────────────── */

describe('images clés des plans · consigne shot.image attestée, devis, approbation · plus jamais parametres: {}', () => {
  it('compiler atteste sans écrire ; retenir ne touche que le plan ; devis et job portent CETTE consigne', async () => {
    const projectId = await projetVideo();
    const v0 = await courante(projectId);
    const avant = await compte(projectId);
    const c = await compilerConsignePlanPour(ctxDe(ids, 'ua'), { projectId, shotId: 's3' }, deps);
    expect(c, JSON.stringify(c)).toMatchObject({ ok: true, statut: 'compilee' });
    if (!c.ok || c.statut !== 'compilee') return;
    expect((await courante(projectId)).id).toBe(v0.id);
    expect((await compte(projectId)).runs).toBe(avant.runs + 1);
    const [att] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, ACTION_CONSIGNE_PLAN)));
    const id5 = await photo(projectId, 5);
    expect(att!.details).toMatchObject({ runId: c.runId, shotId: 's3', empreinte: c.empreinte, consigne: { schema: 'consigne_plan/1', shotId: 's3', references: [{ assetId: id5, role: 'product' }], format: { largeur: 1080, hauteur: 1920 } } });
    expect(c.consigne.consigne.negativeConstraints).toEqual([INTERDIT_TEXTE_IMAGE_CLE]);
    expect(c.consigne.consigne.protectedComponents).toEqual(expect.arrayContaining(['lunettes', 'bandeau']));

    const r = await retenirConsignePlanPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v0.id, runId: c.runId });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const k0 = empreintesKeyframes(v0.content as ContenuVersion);
    const k1 = empreintesKeyframes(r.version.content as ContenuVersion);
    expect(Object.keys(k0).filter((k) => k0[k] !== k1[k])).toEqual(['keyframe:s3']);
    expect(consigneDuPlan(r.version.content as ContenuVersion, 's3')).toEqual(c.consigne);

    const s0 = await solde();
    const d = await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId: 's3' }, T);
    if (!d.ok) throw new Error(JSON.stringify(d));
    expect(d.devis.lignes.map((l: LigneDevis) => [l.operation, l.profil, l.credits])).toEqual([['keyframe:s3', 'image_generation', 4]]);
    const [audit] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, d.devis.id), eq(schema.studioAuditEvents.action, 'quote.create')));
    expect(audit!.details).toMatchObject({ consignesPlans: empreinteConsignesDevis([c.consigne]) });
    const [q] = await db.select().from(schema.studioQuotes).where(eq(schema.studioQuotes.id, d.devis.id));
    const [ip] = await db.select().from(schema.studioImpactPlans).where(eq(schema.studioImpactPlans.id, q!.impactPlanId));
    const [rel] = q!.promptReleaseId ? await db.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, q!.promptReleaseId)) : [];
    expect(d.devis.inputHash).toBe(empreinteEntreesDevisImage({
      workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: r.version.id, contentHash: r.version.contentHash, impactPlanHash: ip!.planHash,
      pricingVersion: PRICING_VERSION, lignes: d.devis.lignes, epinglage: rel ? { promptReleaseId: rel.id, releaseHash: rel.releaseHash } : null,
    }, empreinteConsignesDevis([c.consigne])));

    // Sans fournisseur d'images · rien n'est approuvé ni débité.
    const refus = await approuverKeyframePour(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: 4, idempotencyKey: `l6a-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: false, maintenant: T });
    expect(refus).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    expect(await solde()).toBe(s0);

    const a = await approuverKeyframePour(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: 4, idempotencyKey: `l6a-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: true, maintenant: T });
    if (!a.ok) throw new Error(JSON.stringify(a));
    const [job] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, a.job.id));
    const snap = job!.snapshot as SnapshotJob;
    expect(snap.parametres).toEqual(parametresDepuisConsignePlan(c.consigne));
    expect(lireParametresImage(snap.parametres)).toMatchObject({ ok: true, parametres: { schema: 'studio_image/1', promptRunId: c.runId, references: [{ assetId: id5, role: 'product' }] } });
    expect(await solde()).toBe(s0 - 4);
  });

  it('sans consigne · consigne écrite à la main (non attestée) · devis refusés, rien écrit', async () => {
    const projectId = await projetVideo();
    const avant = await compte(projectId);
    expect(await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId: 's2' }, T)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', targetIds: ['keyframe:s2'], message: 'Aucune consigne d’image retenue pour le plan 2 · compile-la puis retiens-la avant de demander un devis.' });
    const { compilation, version } = await consigneRetenue(projectId, 's1');
    const forgee = { ...compilation.consigne, consigne: { ...compilation.consigne.consigne, generationInstruction: 'Reprendre le mannequin du concurrent.' } };
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: version.id, changes: [{ op: 'replace', path: '/styleRef/consignesPlans/s1', newValue: forgee, reason: 'navigateur' }] });
    expect(w.ok).toBe(true);
    const milieu = await compte(projectId);
    expect(await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId: 's1' }, T)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', message: 'La consigne du plan 1 ne vient pas d’une compilation validée par le serveur · recompile-la, rien n’est parti.' });
    const apres = await compte(projectId);
    expect(apres.devis).toBe(avant.devis);
    expect(apres.devis).toBe(milieu.devis);
    expect(apres.jobs).toBe(0);
  });

  it('un plan qui montre le produit sans photo épinglée · compilation bloquée AVANT l’appel', async () => {
    const p = await projetStatique(db, ids, cat);
    const v = await courante(p.projectId);
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, changes: [{ op: 'replace', path: '/productRef', newValue: { productId: 'p_libre' }, reason: 'x' }] });
    if (!w.ok) throw new Error(JSON.stringify(w));
    await geste(p.projectId, { type: 'scenario', plans: [PLAN({ shotId: 's1', referenceIds: ['p_libre'] })] });
    const runs = (await compte(p.projectId)).runs;
    expect(await compilerConsignePlanPour(ctxDe(ids, 'ua'), { projectId: p.projectId, shotId: 's1' }, deps)).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect((await compte(p.projectId)).runs).toBe(runs);
    expect(texte.recues).toHaveLength(0);
  });

  it('animation · refusée dès le devis, l’écran le dit', async () => {
    const projectId = await projetVideo();
    const avant = await compte(projectId);
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['clip:s1'], variante: true }, base, T)).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    expect((await compte(projectId)).devis).toBe(avant.devis);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projectId, LECTURE);
    expect(l.ok && l.vue.disponibilite.animation).toEqual({ disponible: false, raison: 'Le service ne sait pas encore vérifier une vidéo produite : aucune animation n’est proposée, devisée ni facturée. Les images clés, le montage et le texte restent utilisables.' });
  });
});

/* ─────────────── Gestes de montage · aucune génération inutile ─────────────── */

describe('gestes de montage sur un projet dont l’image clé du plan 1 est livrée', () => {
  async function projetAvecKeyframe() {
    const projectId = await projetVideo();
    await consigneRetenue(projectId, 's1');
    await produireKeyframe(projectId, 's1');
    return projectId;
  }

  it('VIDEO-08 · permuter les plans 2 et 1 · montage recalé, empreintes identiques, aucun devis ni job ; l’image clé livrée reste valide', async () => {
    const projectId = await projetAvecKeyframe();
    const avant = await compte(projectId);
    const g = await geste(projectId, { type: 'ordre', ordre: ['s2', 's1', 's3'] });
    const a = g.avant.content as ContenuVersion;
    const b = g.version.content as ContenuVersion;
    expect(empreintesKeyframes(b)).toEqual(empreintesKeyframes(a));
    const ip = await dernierImpact(projectId, g.version.id);
    expect((ip.redo as Array<{ id: string; nature: string }>).filter((n) => n.nature === 'generation'), 'réordonner a déclenché une génération').toEqual([]);
    expect((ip.redo as Array<{ id: string }>).map((n) => n.id)).toEqual(['montage', 'mix', 'sous_titres', 'export']);
    expect(g.impact.aucuneGeneration).toBe(true);
    expect(Object.values(b.timeline!.tracks[PISTES_VIDEO.video]!.items).sort((x, y) => x.startTicks - y.startTicks).map((i) => i.source.shotId)).toEqual(['s2', 's1', 's3']);
    const apres = await compte(projectId);
    expect({ devis: apres.devis - avant.devis, jobs: apres.jobs - avant.jobs }).toEqual({ devis: 0, jobs: 0 });
    // Aucun appel image inutile : l'image clé du plan 1 est réutilisée, elle ne se devise pas sans variante volontaire.
    const e = await estimerImpact(ctxDe(ids, 'ua'), { projectId, versionAvantId: g.avant.id });
    expect(e.ok && e.plan.reutilisees).toContain('keyframe:s1');
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, versionAvantId: g.avant.id, operations: ['keyframe:s1'] }, base, T)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projectId, LECTURE);
    expect(l.ok && l.vue.keyframes.s1!.etat).toBe('valide');
    expect(l.ok && l.vue.keyframes.s1!.media).not.toBeNull();
  });

  it('VIDEO-05 · narration du plan 2 · images clés identiques par empreinte, durées recalculées et dites, voix du plan 2 seule à refaire', async () => {
    const projectId = await projetAvecKeyframe();
    const avant = await compte(projectId);
    const g = await geste(projectId, { type: 'narration', shotId: 's2', narration: 'Chaque matin, devant le miroir, la même déception, et ce bouton qui revient toujours.' });
    const a = g.avant.content as ContenuVersion;
    const b = g.version.content as ContenuVersion;
    expect(empreintesKeyframes(b)).toEqual(empreintesKeyframes(a));
    expect(b.shots.byId.s2!.estimatedDurationMs).toBe(5600);
    expect(g.durees).toMatchObject({ avantMs: 9000, apresMs: 11600, phrase: 'Durée totale 9,0 s → 11,6 s (plan 2 : 3,0 s → 5,6 s).' });
    expect(b.timeline!.durationTicks).toBe(11_600_000);
    const ip = await dernierImpact(projectId, g.version.id);
    const gen = (ip.redo as Array<{ id: string; nature: string }>).filter((n) => n.nature === 'generation').map((n) => n.id);
    expect(gen).toContain('voix:s2');
    expect(gen.filter((x) => x.startsWith('keyframe:'))).toEqual([]);
    expect(ip.reused as string[]).toEqual(expect.arrayContaining(['keyframe:s1', 'keyframe:s2', 'keyframe:s3', 'voix:s1']));
    const apres = await compte(projectId);
    expect({ devis: apres.devis - avant.devis, jobs: apres.jobs - avant.jobs }).toEqual({ devis: 0, jobs: 0 });
    // La consigne de l'image clé du plan 2 n'est pas périmée par la narration.
    expect(entreesConsignePlan(b, 's2')).toBe(entreesConsignePlan(a, 's2'));
  });

  it('VIDEO-10 · musique seule · voix, images clés et clips identiques, mix et export seuls', async () => {
    const projectId = await projetAvecKeyframe();
    const avant = await compte(projectId);
    const g = await geste(projectId, { type: 'musique', musique: { assetId: 'a_musique', gainDb: -9 } });
    const ga = grapheImpact(g.avant.content as ContenuVersion);
    const gb = grapheImpact(g.version.content as ContenuVersion);
    for (const n of ['keyframe:s1', 'keyframe:s2', 'keyframe:s3', 'clip:s1', 'clip:s2', 'clip:s3', 'voix:s1', 'voix:s2', 'montage']) expect(gb.get(n)!.empreinte, n).toBe(ga.get(n)!.empreinte);
    const ip = await dernierImpact(projectId, g.version.id);
    expect((ip.redo as Array<{ id: string }>).map((n) => n.id)).toEqual(['mix', 'export']);
    expect((g.version.content as ContenuVersion).timeline!.music).toEqual({ assetId: 'a_musique', gainDb: -9 });
    const apres = await compte(projectId);
    expect({ devis: apres.devis - avant.devis, jobs: apres.jobs - avant.jobs }).toEqual({ devis: 0, jobs: 0 });
  });

  it('VIDEO-09 · sans texte · aucun overlay, sous-titres coupés, texte incrusté éventuel de l’image livrée signalé', async () => {
    const projectId = await projetAvecKeyframe();
    const avant = await compte(projectId);
    const g = await geste(projectId, { type: 'sans_texte' });
    const b = g.version.content as ContenuVersion;
    expect(Object.values(b.shots.byId).every((p) => p.onScreenText.length === 0)).toBe(true);
    expect(b.timeline!.subtitles).toEqual({ enabled: false });
    expect(surimpressions(b.timeline)).toEqual([]);
    expect(g.signalements).toEqual(['Plan 1 : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.']);
    const ip = await dernierImpact(projectId, g.version.id);
    expect((ip.redo as Array<{ nature: string }>).filter((n) => n.nature === 'generation')).toEqual([]);
    const apres = await compte(projectId);
    expect({ devis: apres.devis - avant.devis, jobs: apres.jobs - avant.jobs }).toEqual({ devis: 0, jobs: 0 });
  });

  it('VIDEO-03 · tenue changée (plans 1 et 2) · images et clips liés obsolètes, voix conservées ; consignes 1-2 périmées, 3 tient', async () => {
    const projectId = await projetAvecKeyframe();
    await consigneRetenue(projectId, 's3');
    const v = await courante(projectId);
    const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, changes: [{ op: 'replace', path: '/characterRefs/c_lea/tenue', newValue: 'veste verte', reason: 'tenue' }], raison: 'tenue verte' });
    if (!w.ok) throw new Error(JSON.stringify(w));
    // L'impact du GESTE (graphe L1, chaque sortie de la version de départ supposée produite).
    const gen = calculerPlanImpact(v.content as ContenuVersion, w.version.content as ContenuVersion).aRefaire.filter((n) => n.nature === 'generation').map((n) => n.id).sort();
    expect(gen).toEqual(['clip:s1', 'clip:s2', 'identite:c_lea', 'keyframe:s1', 'keyframe:s2']);
    const k0 = empreintesKeyframes(v.content as ContenuVersion);
    const k1 = empreintesKeyframes(w.version.content as ContenuVersion);
    expect(k1['keyframe:s3']).toBe(k0['keyframe:s3']);
    expect(k1['keyframe:s1']).not.toBe(k0['keyframe:s1']);
    const ga = grapheImpact(v.content as ContenuVersion);
    const gb = grapheImpact(w.version.content as ContenuVersion);
    for (const n of ['voix:s1', 'voix:s2']) expect(gb.get(n)!.empreinte, `${n} préservée`).toBe(ga.get(n)!.empreinte);
    // L'image livrée du plan 1 est désormais obsolète (consultable), sa consigne périmée.
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projectId, LECTURE);
    expect(l.ok && l.vue.keyframes.s1!.etat).toBe('obsolete');
    expect(l.ok && l.vue.keyframes.s1!.retenue!.verdict).toMatchObject({ ok: false, cause: 'perimee' });
    expect(l.ok && l.vue.keyframes.s3!.retenue!.verdict).toEqual({ ok: true });
    const avant = await compte(projectId);
    expect(await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId: 's1' }, T)).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', targetIds: ['keyframe:s1'] });
    expect((await compte(projectId)).devis).toBe(avant.devis);
    expect((await devisKeyframePour(ctxDe(ids, 'ua'), { projectId, shotId: 's3' }, T)).ok).toBe(true);
  });
});

/* ───────────────────────────── Droits et lecture ──────────────────────────── */

describe('droits, portée, lecture pure', () => {
  it('lecteur client : aucun geste ; autre espace : NOT_FOUND neutre ; lire n’écrit rien ; base périmée ⇒ 409', async () => {
    const projectId = await projetVideo();
    const v = await courante(projectId);
    const avant = await compte(projectId);
    etat.session = session(ids, 'uv');
    expect(await actions.appliquerOperationVideo({ projectId, baseVersionId: v.id, operation: { type: 'sans_texte' } })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.demanderDevisKeyframe({ projectId, shotId: 's1' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await actions.compilerConsignePlan({ projectId, shotId: 's1' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const ub = ctxDe(ids, 'ub');
    expect(await appliquerOperationVideoPour(ub, { projectId, baseVersionId: v.id, operation: { type: 'sans_texte' } })).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    expect(await lireVideoPour(ub, projectId, LECTURE)).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    await lireVideoPour(ctxDe(ids, 'ua'), projectId, LECTURE);
    expect(await compte(projectId)).toEqual(avant);
    // Deux onglets : le second geste part d'une base périmée.
    await geste(projectId, { type: 'ordre', ordre: ['s3', 's1', 's2'] });
    expect(await appliquerOperationVideoPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, operation: { type: 'sans_texte' } })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
  });
});
