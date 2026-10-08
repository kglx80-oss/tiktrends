import 'server-only';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  calculerPlanImpact, lignesDuDevis, empreinteEntreesDevis, expirationDevis, dureeValidite, verifierApprobation,
  decisionIdempotence, cleIdempotenceValide, refsDuJob, refusPlafondDollars, bilanRegistre, preuveSoumission,
  vueJob, transitionJob, transitionQualite, jobTerminal, objetDansPortee, erreurStudio,
  operationsNonVerifiables, DECODEUR_VIDEO_WORKER, PRICING_VERSION, OPERATION_JOB_STUDIO, empreinteEntreesDevisImage,
  type ContenuVersion, type PlanImpact, type LigneDevis, type ErreurStudio, type SnapshotJob, type VueJob,
  type EtatJob, type StatutQualite, type EpinglageDevis,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { estUuid } from '../depot';
import { debiterCreditsDans } from '../../credits';
import { epinglerReleaseDuDevis, revocationDe } from './epinglage';
// F-B · raccord de l'image du studio (`keyframe:s_image`) · sans effet sur les autres opérations.
import { raccordImageDevis, parametresImageApprobation } from '../image/raccord';
// L6-B · contradictions identité ↔ plan, refusées avant devis et débit.
import { refusIdentitesDevis } from '../identites/devis';
import type { BaseStudio, ExecStudio, TxStudio } from './types';

/**
 * Commandes d'exécution des studios (plan 06 §3 · estimateImpact, createQuote,
 * approveAndEnqueue, cancelJob, getJobStatus, acceptMedia/rejectMedia).
 *
 * ── Portée ───────────────────────────────────────────────────────────────────
 *
 * Même double garde que `depot.ts` : chaque requête filtre `workspace_id` ET
 * `brand_id IN (marques visibles)`, chaque ligne revenue est revérifiée par la
 * règle pure `objetDansPortee`. Hors portée ⇒ `NOT_FOUND` neutre.
 *
 * ── Argent ───────────────────────────────────────────────────────────────────
 *
 * Seule `approuverEtMettreEnFile` engage de l'argent, et dans UNE transaction :
 * approbation consommée une fois, job `queued`, réserve au registre studio,
 * débit des crédits de l'espace (même référence dans `credit_ledger.ref_id`),
 * événement outbox, audit. Aucun appel externe dans la transaction. Le reste
 * est lecture, calcul ou statut, sans coût.
 *
 * `base` est le client drizzle (par défaut `db`) · les tests de concurrence en
 * passent un par connexion Postgres.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}

function horsPortee(ctx: ContexteStudio, l: { workspaceId: string; brandId: string | null } | undefined): boolean {
  return !l || !l.brandId || !objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    { workspaceId: l.workspaceId, brandId: l.brandId },
  );
}

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

function echecPersistance(ctx: ContexteStudio, e: unknown): ErreurStudio {
  console.error(`[studios:l3] ${ctx.traceId} persistance`, e instanceof Error ? e.message : e);
  return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}

/** Violation d'unicité Postgres (postgres-js comme pglite exposent `code`). */
function violationUnicite(e: unknown): string | null {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    const o = x as { code?: unknown; constraint_name?: unknown; constraint?: unknown; message?: unknown };
    if (o.code === '23505') return String(o.constraint_name ?? o.constraint ?? o.message ?? '');
  }
  return null;
}

type Projet = typeof schema.studioProjects.$inferSelect;
type Version = typeof schema.studioProjectVersions.$inferSelect;
type Job = typeof schema.studioJobs.$inferSelect;
type Devis = typeof schema.studioQuotes.$inferSelect;

async function projetEtVersions(ex: ExecStudio, ctx: ContexteStudio, projectId: unknown, avantId: unknown, verrou: 'share' | null):
  Promise<Resultat<{ projet: Projet; courante: Version; avant: Version }>> {
  if (!estUuid(projectId)) return introuvable(ctx);
  const P = schema.studioProjects;
  const V = schema.studioProjectVersions;
  const q = ex.select().from(P).where(and(eq(P.id, projectId), porteeSql(P, ctx))).limit(1);
  const [projet] = verrou ? await q.for('share') : await q;
  if (horsPortee(ctx, projet) || !projet!.currentVersionId) return introuvable(ctx);
  const [courante] = await ex.select().from(V).where(and(eq(V.id, projet!.currentVersionId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
  if (!courante) return introuvable(ctx);
  let avant = courante;
  if (avantId !== undefined && avantId !== null && avantId !== courante.id) {
    if (!estUuid(avantId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'versionAvantId', raison: 'version inconnue pour ce projet' }] });
    const [a] = await ex.select().from(V).where(and(eq(V.id, avantId), eq(V.projectId, projet!.id), porteeSql(V, ctx))).limit(1);
    if (!a) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'versionAvantId', raison: 'version inconnue pour ce projet' }] });
    avant = a;
  }
  return { ok: true, projet: projet!, courante, avant };
}

/**
 * Sorties qui existent RÉELLEMENT pour une version : celles livrées par un job
 * `completed` de cette version (fichier stocké et relié). Rien d'autre.
 */
async function sortiesExistantes(ex: ExecStudio, ctx: ContexteStudio, projectId: string, versionId: string): Promise<string[]> {
  const J = schema.studioJobs;
  const jobs = await ex.select({ result: J.result }).from(J)
    .where(and(eq(J.projectId, projectId), eq(J.projectVersionId, versionId), eq(J.state, 'completed'), porteeSql(J, ctx)));
  const s = new Set<string>();
  for (const j of jobs) for (const op of Object.keys((j.result as { assets?: Record<string, string> } | null)?.assets ?? {})) s.add(op);
  return [...s];
}

/* ─────────────────────────────── estimerImpact ───────────────────────────── */

/**
 * `variante: true` · nouvelle variante VOLONTAIRE : les sorties déjà livrées
 * sont refaites (nouveau devis, nouveau job), au lieu d'être réutilisées.
 */
export interface EntreeImpact { projectId: unknown; versionAvantId?: unknown; operations?: unknown; variante?: unknown }

/** LECTURE et CALCUL · aucune écriture, aucun job, aucune consommation (COST-05). */
export async function estimerImpact(ctx: ContexteStudio, e: EntreeImpact, base: BaseStudio = db):
  Promise<Resultat<{ projectVersionId: string; plan: PlanImpact; devisIndicatif: ReturnType<typeof lignesDuDevis> }>> {
  const pv = await projetEtVersions(base, ctx, e.projectId, e.versionAvantId, null);
  if (!pv.ok) return pv;
  const plan = calculerPlanImpact(pv.avant.content as ContenuVersion, pv.courante.content as ContenuVersion, {
    sortiesExistantes: e.variante === true ? [] : await sortiesExistantes(base, ctx, pv.projet.id, pv.avant.id),
  });
  const selection = Array.isArray(e.operations) ? e.operations.filter((x): x is string => typeof x === 'string') : null;
  return { ok: true, projectVersionId: pv.courante.id, plan, devisIndicatif: lignesDuDevis(plan, selection) };
}

/* ──────────────────────────────── creerDevis ─────────────────────────────── */

export interface EntreeDevis { projectId: unknown; versionAvantId?: unknown; operations?: unknown; validiteMs?: unknown; variante?: unknown }

export interface DevisPresente {
  id: string;
  projectVersionId: string;
  inputHash: string;
  impactPlanHash: string;
  pricingVersion: string;
  lignes: LigneDevis[];
  maximumCredits: number;
  maximumUsdMicros: number;
  expiresAt: string;
  promptReleaseId: string | null;
}

function presenter(q: Devis): DevisPresente {
  return {
    id: q.id, projectVersionId: q.projectVersionId, inputHash: q.inputHash, impactPlanHash: q.impactPlanHash,
    pricingVersion: q.pricingVersion, lignes: q.lines as LigneDevis[], maximumCredits: q.maximumCredits,
    maximumUsdMicros: Number(q.maximumUsdMicros), expiresAt: q.expiresAt.toISOString(), promptReleaseId: q.promptReleaseId,
  };
}

/**
 * Devis IMMUABLE sur la version COURANTE du projet · aucune dépense. Deux
 * appels donnent deux devis (deux identifiants) aux mêmes entrées : deux
 * variantes volontaires ne sont jamais fusionnées (COST-02).
 */
export async function creerDevis(ctx: ContexteStudio, e: EntreeDevis, base: BaseStudio = db, maintenant: Date = new Date()): Promise<Resultat<{ devis: DevisPresente; plan: PlanImpact }>> {
  try {
    return await base.transaction(async (tx) => {
      const pv = await projetEtVersions(tx, ctx, e.projectId, e.versionAvantId, 'share');
      if (!pv.ok) throw new Refus(pv);
      const { projet, courante, avant } = pv;
      const plan = calculerPlanImpact(avant.content as ContenuVersion, courante.content as ContenuVersion, {
        sortiesExistantes: e.variante === true ? [] : await sortiesExistantes(tx, ctx, projet.id, avant.id),
      });
      const selection = Array.isArray(e.operations) ? e.operations.filter((x): x is string => typeof x === 'string') : null;
      if (e.operations !== undefined && !Array.isArray(e.operations)) {
        throw new Refus(erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'operations', raison: 'liste d’identifiants d’opérations' }] }));
      }
      const l = lignesDuDevis(plan, selection);
      if (!l.ok) {
        throw new Refus(l.code === 'UNSUPPORTED_CAPABILITY'
          ? erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, targetIds: l.cibles, message: `Opération sans tarif ni fournisseur branché · ${l.cibles.join(', ')}. Retire-la du devis.` })
          : erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'operations', raison: `${l.motif}${l.cibles.length ? ` · ${l.cibles.join(', ')}` : ''}` }] }));
      }
      // Une sortie que le worker ne saurait pas vérifier n'est jamais devisée :
      // aucun devis pour un échec certain (contre-recette du 8 octobre).
      const nonVerifiables = operationsNonVerifiables(l.lignes, { video: DECODEUR_VIDEO_WORKER });
      if (nonVerifiables.length) {
        throw new Refus(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, targetIds: nonVerifiables, message: `Vidéo indisponible · le service ne sait pas encore vérifier une vidéo produite · ${nonVerifiables.join(', ')}. Retire-la du devis.` }));
      }
      // L6-B · identités : un plan qui contredit sa fiche ne se devise pas (VIDEO-02).
      const identites = refusIdentitesDevis(ctx, courante.content as ContenuVersion, l.lignes);
      if (identites) throw new Refus(identites);
      const ep = await epinglerReleaseDuDevis(tx, projet.workspaceId, projet.brandId);
      if (!ep.ok) throw new Refus(erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: `Consigne indisponible pour ce devis · ${ep.motif}` }));
      // F-B · image du studio : consigne retenue, attestée, à jour, références intactes.
      const image = await raccordImageDevis(tx, ctx, { projet, contenu: courante.content as ContenuVersion, lignes: l.lignes });
      if (!image.ok) throw new Refus(image);

      const [ip] = await tx.insert(schema.studioImpactPlans).values({
        workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id,
        fromVersionId: avant.id, toVersionId: courante.id,
        changedInputs: plan.entreesModifiees, reused: plan.reutilisees, obsolete: plan.obsoletes, redo: plan.aRefaire,
        planHash: plan.empreinte, createdBy: ctx.userId,
      }).returning();
      const entrees = {
        workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id,
        projectVersionId: courante.id, contentHash: courante.contentHash, impactPlanHash: plan.empreinte,
        pricingVersion: PRICING_VERSION, lignes: l.lignes, epinglage: ep.epinglage,
      };
      const inputHash = image.empreinte ? empreinteEntreesDevisImage(entrees, image.empreinte) : empreinteEntreesDevis(entrees);
      const [q] = await tx.insert(schema.studioQuotes).values({
        workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id, projectVersionId: courante.id,
        impactPlanId: ip!.id, impactPlanHash: plan.empreinte, inputHash, promptReleaseId: ep.epinglage?.promptReleaseId ?? null,
        pricingVersion: PRICING_VERSION, lines: l.lignes, maximumCredits: l.totalCredits, maximumUsdMicros: l.totalUsdMicros,
        expiresAt: expirationDevis(maintenant, dureeValidite(e.validiteMs)), createdBy: ctx.userId,
      }).returning();
      await ajouterAudit(tx, ctx, {
        action: 'quote.create', brandId: projet.brandId, targetType: 'studio_quote', targetId: q!.id,
        versionBefore: null, versionAfter: courante.id, reason: 'devis',
        details: { credits: l.totalCredits, usdMicros: l.totalUsdMicros, pricingVersion: PRICING_VERSION, releaseHash: ep.epinglage?.releaseHash ?? null, ...(image.empreinte ? { consigneImage: image.empreinte } : {}) },
      });
      return { ok: true as const, devis: presenter(q!), plan };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}

/* ────────────────────────── approuverEtMettreEnFile ──────────────────────── */

export interface EntreeApprobation { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown }

export interface OptionsApprobation {
  /** Compte à crédits illimités (fondateur, équipe à accès total) · aucun débit. */
  illimite: boolean;
  /** Barrière dollars existante, lue par l'action (`spendStatus`). */
  plafond?: { capUsd: number; depenseUsd: number; bloque: boolean } | null;
  base?: BaseStudio;
  maintenant?: Date;
}

export interface JobPresente { id: string; etat: EtatJob; quoteId: string | null; idempotencyKey: string; brandId: string; projectId: string }

const presenterJob = (j: Job): JobPresente => ({ id: j.id, etat: j.state as EtatJob, quoteId: j.quoteId, idempotencyKey: j.idempotencyKey, brandId: j.brandId, projectId: j.projectId });

async function jobParCle(ex: ExecStudio, workspaceId: string, cle: string): Promise<Job | null> {
  const J = schema.studioJobs;
  const [j] = await ex.select().from(J).where(and(eq(J.workspaceId, workspaceId), eq(J.idempotencyKey, cle))).limit(1);
  return j ?? null;
}

/** Même clé déjà vue · même intention ⇒ même job ; autre intention ⇒ conflit. */
function rejouer(ctx: ContexteStudio, existant: Job, quoteId: string, inputHash: unknown): Resultat<{ job: JobPresente; deja: boolean }> {
  if (horsPortee(ctx, existant)) return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, message: 'Cette clé de commande est déjà utilisée · recharge la page.' });
  const d = decisionIdempotence({ quoteId: existant.quoteId ?? '', inputHash: existant.inputHash }, { quoteId, inputHash: typeof inputHash === 'string' ? inputHash : '' });
  if (d === 'meme_job') return { ok: true, job: presenterJob(existant), deja: true };
  return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [existant.id], message: 'Cette clé de commande a déjà servi pour une autre demande · rien n’a été créé.' });
}

/**
 * UNE transaction : droits (garde en amont), devis non expiré et inchangé,
 * version courante, approbation consommée une fois, job `queued`, réserve,
 * débit atomique des crédits, outbox, audit. Aucun appel externe.
 */
export async function approuverEtMettreEnFile(ctx: ContexteStudio, e: EntreeApprobation, o: OptionsApprobation): Promise<Resultat<{ job: JobPresente; deja: boolean }>> {
  const base = o.base ?? db;
  const maintenant = o.maintenant ?? new Date();
  if (!estUuid(e.quoteId)) return introuvable(ctx);
  if (!cleIdempotenceValide(e.idempotencyKey)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'idempotencyKey', raison: '1 à 160 caractères parmi lettres, chiffres, « _ . : - »' }] });
  }
  const quoteId = e.quoteId;
  const cle = e.idempotencyKey;

  // Double clic, délai dépassé, reconnexion : la clé retrouve le job.
  const deja = await jobParCle(base, ctx.workspaceId, cle);
  if (deja) return rejouer(ctx, deja, quoteId, e.inputHash);

  const Q = schema.studioQuotes;
  const [devis] = await base.select().from(Q).where(and(eq(Q.id, quoteId), porteeSql(Q, ctx))).limit(1);
  if (horsPortee(ctx, devis)) return introuvable(ctx);
  const q = devis!;

  const refusDollars = o.plafond ? refusPlafondDollars({ ...o.plafond, devisUsdMicros: Number(q.maximumUsdMicros) }) : null;
  if (refusDollars) return erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId, message: `Le plafond de dépense ne permet pas ce lancement · ${refusDollars}.` });

  try {
    // F-B · paramètres natifs de l'image du studio, relus côté serveur (hors transaction : lecture seule) ;
    // le refus éventuel est rendu APRÈS les contrôles du devis, dans la transaction. `{}` pour les autres opérations.
    const image = await parametresImageApprobation(base, ctx, q);
    return await base.transaction(async (tx) => {
      const enCours = await jobParCle(tx, ctx.workspaceId, cle);
      if (enCours) return rejouer(ctx, enCours, quoteId, e.inputHash);

      const P = schema.studioProjects;
      const [projet] = await tx.select().from(P).where(and(eq(P.id, q.projectId), porteeSql(P, ctx))).limit(1).for('share');
      if (horsPortee(ctx, projet)) throw new Refus(introuvable(ctx));

      const AP = schema.studioApprovals;
      const [approbation] = await tx.select().from(AP).where(eq(AP.quoteId, q.id)).limit(1);
      if (approbation) {
        // Clic jumeau commité entre la recherche par clé et cette lecture (READ
        // COMMITTED) : même clé ⇒ même job, jamais un refus.
        const jumeau = await jobParCle(tx, ctx.workspaceId, cle);
        if (jumeau) return rejouer(ctx, jumeau, quoteId, e.inputHash);
        throw new Refus(erreurStudio('VERSION_CONFLICT', {
          traceId: ctx.traceId, targetIds: approbation.consumedJobId ? [approbation.consumedJobId] : [],
          message: 'Ce devis a déjà été approuvé · pour une nouvelle variante, demande un nouveau devis.',
        }));
      }

      let revocation: string | null = null;
      if (q.promptReleaseId) {
        const [r] = await tx.select({ evaluation: schema.studioPromptReleases.evaluation }).from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, q.promptReleaseId)).limit(1);
        revocation = r ? revocationDe(r.evaluation) : 'release introuvable';
      }
      const v = verifierApprobation(
        { id: q.id, projectVersionId: q.projectVersionId, inputHash: q.inputHash, maximumCredits: q.maximumCredits, expiresAt: q.expiresAt, pricingVersion: q.pricingVersion, promptReleaseId: q.promptReleaseId },
        { inputHash: e.inputHash, creditsAnnonces: e.creditsAnnonces },
        { maintenant, versionCouranteId: projet!.currentVersionId, revocationRelease: revocation },
      );
      if (!v.ok) throw new Refus(erreurStudio(v.code, { traceId: ctx.traceId, targetIds: [q.id], message: v.motif }));
      if (!image.ok) throw new Refus(image);

      const lignes = q.lines as LigneDevis[];
      const creditsDebites = o.illimite ? 0 : q.maximumCredits;
      const [ap] = await tx.insert(AP).values({ quoteId: q.id, workspaceId: q.workspaceId, brandId: q.brandId, inputHash: q.inputHash, approvedBy: ctx.userId, approvedAt: maintenant }).returning();
      const [version] = await tx.select({ contentHash: schema.studioProjectVersions.contentHash }).from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, q.projectVersionId)).limit(1);
      const [rel] = q.promptReleaseId
        ? await tx.select({ releaseHash: schema.studioPromptReleases.releaseHash }).from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id, q.promptReleaseId)).limit(1)
        : [];
      const epinglage: EpinglageDevis | null = q.promptReleaseId && rel ? { promptReleaseId: q.promptReleaseId, releaseHash: rel.releaseHash } : null;
      const snapshot: SnapshotJob = {
        v: 1, quoteId: q.id, projectVersionId: q.projectVersionId, contentHash: version?.contentHash ?? '', impactPlanHash: q.impactPlanHash,
        pricingVersion: q.pricingVersion, lignes, epinglage,
        reserve: { credits: creditsDebites, usdMicros: Number(q.maximumUsdMicros) },
        parametres: image.parametres,
      };
      const [job] = await tx.insert(schema.studioJobs).values({
        workspaceId: q.workspaceId, brandId: q.brandId, projectId: q.projectId, projectVersionId: q.projectVersionId,
        quoteId: q.id, approvalId: ap!.id, operation: OPERATION_JOB_STUDIO, state: 'queued', idempotencyKey: cle,
        inputHash: q.inputHash, snapshot, promptReleaseId: q.promptReleaseId, createdBy: ctx.userId, createdAt: maintenant, updatedAt: maintenant,
      }).returning();
      await tx.update(AP).set({ consumedAt: maintenant, consumedJobId: job!.id }).where(eq(AP.id, ap!.id));

      const refs = refsDuJob(job!.id);
      if (!(await debiterCreditsDans(tx, q.workspaceId, creditsDebites, 'Studio · réservation de génération', refs.reserve))) {
        throw new Refus(erreurStudio('BUDGET_EXCEEDED', { traceId: ctx.traceId, targetIds: [q.id], message: `Crédits insuffisants · ce lancement en demande ${creditsDebites}. Recharge ou réduis le devis.` }));
      }
      await tx.insert(schema.studioBudgetLedger).values({
        workspaceId: q.workspaceId, brandId: q.brandId, projectId: q.projectId, jobId: job!.id, quoteId: q.id,
        kind: 'reserve', credits: creditsDebites, usdMicros: Number(q.maximumUsdMicros), ref: refs.reserve,
        reason: o.illimite ? 'réserve · compte illimité, aucun débit de crédits' : 'réserve · crédits débités', createdBy: ctx.userId,
      });
      await tx.insert(schema.studioOutbox).values({ workspaceId: q.workspaceId, topic: 'studio.job.queued', aggregateId: job!.id, payload: { jobId: job!.id, quoteId: q.id, brandId: q.brandId, projectId: q.projectId } });
      await ajouterAudit(tx, ctx, {
        action: 'job.enqueue', brandId: q.brandId, targetType: 'studio_job', targetId: job!.id,
        versionBefore: null, versionAfter: q.projectVersionId, reason: 'approbation du devis',
        details: { quoteId: q.id, approvalId: ap!.id, credits: creditsDebites, usdMicros: Number(q.maximumUsdMicros), promptReleaseId: q.promptReleaseId },
      });
      return { ok: true as const, job: presenterJob(job!), deja: false };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    if (violationUnicite(err) !== null) {
      // Course perdue contre un clic jumeau : la clé retrouve son job.
      const j = await jobParCle(base, ctx.workspaceId, cle);
      if (j) return rejouer(ctx, j, quoteId, e.inputHash);
      return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [quoteId], message: 'Ce devis a déjà été approuvé · pour une nouvelle variante, demande un nouveau devis.' });
    }
    return echecPersistance(ctx, err);
  }
}

/* ──────────────────────────────── etatJob ────────────────────────────────── */

export interface EntreeEtat { jobId?: unknown; idempotencyKey?: unknown }

/**
 * Lecture PURE · retrouve un job par son id ou par la clé du clic (navigateur
 * fermé puis rouvert : même job, même progrès, aucun nouveau débit).
 */
export async function etatJob(ctx: ContexteStudio, e: EntreeEtat, base: BaseStudio = db): Promise<Resultat<{ job: JobPresente; vue: VueJob }>> {
  const J = schema.studioJobs;
  let job: Job | undefined;
  if (estUuid(e.jobId)) {
    [job] = await base.select().from(J).where(and(eq(J.id, e.jobId), porteeSql(J, ctx))).limit(1);
  } else if (cleIdempotenceValide(e.idempotencyKey)) {
    [job] = await base.select().from(J).where(and(eq(J.idempotencyKey, e.idempotencyKey), porteeSql(J, ctx))).limit(1);
  }
  if (horsPortee(ctx, job)) return introuvable(ctx);
  const j = job!;
  const [t] = await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, j.id)).orderBy(desc(schema.studioJobAttempts.n)).limit(1);
  const mouvements = await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, j.id));
  const vue = vueJob({
    etat: j.state as EtatJob, qualite: j.qualityStatus as StatutQualite,
    progression: (j.result as { progression?: number } | null)?.progression ?? null,
    preuve: preuveSoumission(t ? { providerIdempotencyKey: t.providerIdempotencyKey, providerRequestId: j.providerRequestId ?? t.providerRequestId } : null),
    bilan: bilanRegistre(mouvements.map((m) => ({ kind: m.kind, credits: m.credits, usdMicros: Number(m.usdMicros) }))),
  });
  return { ok: true, job: presenterJob(j), vue };
}

/* ──────────────────────────────── annulerJob ─────────────────────────────── */

/**
 * Demande d'annulation · `cancel_requested`, le worker fait le reste (arrêt
 * des étapes non soumises, annulation distante, réconciliation du coût). Rien
 * n'est remboursé ni promis ici. Idempotente : un job déjà terminé ou déjà en
 * annulation est rendu tel quel.
 */
export async function annulerJob(ctx: ContexteStudio, e: { jobId: unknown }, base: BaseStudio = db): Promise<Resultat<{ job: JobPresente; vue: VueJob }>> {
  if (!estUuid(e.jobId)) return introuvable(ctx);
  const J = schema.studioJobs;
  for (let essai = 0; essai < 5; essai++) {
    const [job] = await base.select().from(J).where(and(eq(J.id, e.jobId), porteeSql(J, ctx))).limit(1);
    if (horsPortee(ctx, job)) return introuvable(ctx);
    const j = job!;
    const etat = j.state as EtatJob;
    if (jobTerminal(etat) || etat === 'cancel_requested' || etat === 'reconciliation_required') return etatJob(ctx, { jobId: j.id }, base);
    const v = transitionJob(etat, 'cancel_requested', 'utilisateur');
    if (!v.ok) return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [j.id], message: 'Ce job ne peut plus être annulé.' });
    try {
      const fait = await base.transaction(async (tx: TxStudio) => {
        const [m] = await tx.update(J).set({ state: 'cancel_requested', rowVersion: j.rowVersion + 1, updatedAt: new Date() })
          .where(and(eq(J.id, j.id), eq(J.state, j.state), eq(J.rowVersion, j.rowVersion), porteeSql(J, ctx))).returning();
        if (!m) return false;
        await tx.insert(schema.studioOutbox).values({ workspaceId: j.workspaceId, topic: 'studio.job.cancel_requested', aggregateId: j.id, payload: { jobId: j.id, brandId: j.brandId, depuis: j.state } });
        await ajouterAudit(tx, ctx, { action: 'job.cancel_requested', brandId: j.brandId, targetType: 'studio_job', targetId: j.id, versionBefore: j.state, versionAfter: 'cancel_requested', reason: 'annulation demandée' });
        return true;
      });
      if (fait) return etatJob(ctx, { jobId: j.id }, base);
    } catch (err) {
      return echecPersistance(ctx, err);
    }
  }
  return erreurStudio('RATE_LIMITED', { traceId: ctx.traceId, message: 'Le job change en ce moment · réessaie dans un instant.' });
}

/* ─────────────────────────── accepter / rejeter ──────────────────────────── */

/**
 * Statut QUALITÉ seul (relecteur) · aucun coût, aucune régénération, aucune
 * écriture au registre. Exige un job `completed` (fichier stocké et relié).
 */
export async function deciderQualite(ctx: ContexteStudio, e: { jobId: unknown; raison?: unknown }, vers: 'passed' | 'rejected', base: BaseStudio = db): Promise<Resultat<{ job: JobPresente; qualite: StatutQualite }>> {
  if (!estUuid(e.jobId)) return introuvable(ctx);
  const J = schema.studioJobs;
  const [job] = await base.select().from(J).where(and(eq(J.id, e.jobId), porteeSql(J, ctx))).limit(1);
  if (horsPortee(ctx, job)) return introuvable(ctx);
  const j = job!;
  const v = transitionQualite(j.state as EtatJob, j.qualityStatus as StatutQualite, vers, 'relecteur');
  if (!v.ok) {
    if (j.qualityStatus === vers) return { ok: true, job: presenterJob(j), qualite: vers };
    return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [j.id], message: j.state !== 'completed' ? 'Le média n’est pas encore enregistré · attends la fin du job.' : 'Ce média a déjà été tranché.' });
  }
  try {
    return await base.transaction(async (tx) => {
      const [m] = await tx.update(J).set({ qualityStatus: vers, rowVersion: j.rowVersion + 1, updatedAt: new Date() })
        .where(and(eq(J.id, j.id), eq(J.rowVersion, j.rowVersion), eq(J.qualityStatus, j.qualityStatus), porteeSql(J, ctx))).returning();
      if (!m) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [j.id] }));
      await ajouterAudit(tx, ctx, {
        action: vers === 'passed' ? 'media.accept' : 'media.reject', brandId: j.brandId, targetType: 'studio_job', targetId: j.id,
        versionBefore: j.qualityStatus, versionAfter: vers, reason: typeof e.raison === 'string' ? e.raison.slice(0, 2000) : '',
      });
      return { ok: true as const, job: presenterJob(m), qualite: vers };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    return echecPersistance(ctx, err);
  }
}
