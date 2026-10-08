import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  verdictComposants, lireReferenceEpinglee, transitionQualite, erreurStudio,
  type ControleVisuel, type ConstatComposant, type VerdictComposants, type StatutQualite, type EtatJob, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { lireJob, lireVersion } from '../depot';

/**
 * Statut QUALITÉ d'une sortie au regard des composants obligatoires du produit
 * épinglé (cahier §4.4 point 5, §4.6 ; recette IMG-03).
 *
 * Deux portes, une seule règle (`verdictComposants`, noyau) :
 *
 *  · `controlerComposantsSortie` · acteur `controle` (serveur, à la fin d'un
 *    job) : un job `completed` en `pending` passe en `rejected` (composant
 *    absent), `requires_review` (non vérifié, ou aucun contrôle visuel), ou
 *    `passed` seulement si chaque composant est confirmé. Le contrôle vient du
 *    SERVEUR (tâche `quality.visual`, ou `null` tant que la vision n'est pas
 *    routée), jamais du client.
 *  · `trancherComposants` · acteur `relecteur` : la liste cochée composant par
 *    composant. Un composant absent ⇒ `rejected` ; tous présents ⇒ `passed` ;
 *    un composant non coché ⇒ refus, rien d'écrit (pas de succès par défaut).
 *
 * Les composants requis sont relus dans la version DU JOB (`productRef`
 * épinglé), jamais reçus du client. Compare-and-set sur `row_version` et le
 * statut, audit dans la même transaction. Aucun coût, aucune régénération.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

class Refus extends Error {
  constructor(public readonly erreur: ErreurStudio) { super(erreur.code); }
}

async function composantsDuJob(ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect): Promise<Resultat<{ requis: string[] }>> {
  const v = await lireVersion(ctx, job.projectVersionId);
  if (!v.ok) return v;
  const ref = lireReferenceEpinglee((v.version.content as { productRef?: unknown }).productRef);
  return { ok: true, requis: ref ? [...ref.composantsObligatoires] : [] };
}

async function poser(
  ctx: ContexteStudio, job: typeof schema.studioJobs.$inferSelect, vers: StatutQualite, acteur: 'controle' | 'relecteur', verdict: VerdictComposants, action: string,
): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const t = transitionQualite(job.state as EtatJob, job.qualityStatus as StatutQualite, vers, acteur);
  if (!t.ok) {
    return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id], message: job.state !== 'completed' ? 'Le média n’est pas encore enregistré · attends la fin du job.' : 'Ce média a déjà été tranché.' });
  }
  const J = schema.studioJobs;
  try {
    return await db.transaction(async (tx) => {
      const [m] = await tx.update(J).set({ qualityStatus: vers, rowVersion: job.rowVersion + 1, updatedAt: new Date() })
        .where(and(eq(J.id, job.id), eq(J.workspaceId, ctx.workspaceId), eq(J.rowVersion, job.rowVersion), eq(J.qualityStatus, job.qualityStatus))).returning({ id: J.id });
      if (!m) throw new Refus(erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [job.id] }));
      await ajouterAudit(tx, ctx, {
        action, brandId: job.brandId, targetType: 'studio_job', targetId: job.id, versionBefore: job.qualityStatus, versionAfter: vers,
        reason: verdict.raison, details: { manquants: verdict.manquants, nonVerifies: verdict.nonVerifies, confirmes: verdict.confirmes },
      });
      return { ok: true as const, qualite: vers, verdict };
    });
  } catch (err) {
    if (err instanceof Refus) return err.erreur;
    console.error(`[studios:l5c] ${ctx.traceId} qualité`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
}

/** Contrôle automatique à la fin d'un job · `controle` = sortie validée de `quality.visual`, ou `null`. */
export async function controlerComposantsSortie(ctx: ContexteStudio, e: { jobId: unknown }, controle: ControleVisuel | null): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  const c = await composantsDuJob(ctx, j.job);
  if (!c.ok) return c;
  const verdict = verdictComposants({ requis: c.requis, controle });
  return poser(ctx, j.job, verdict.statut, 'controle', verdict, 'media.quality.control');
}

/** Décision du relecteur · chaque composant coché présent ou absent. */
export async function trancherComposants(ctx: ContexteStudio, e: { jobId: unknown; constats: unknown }): Promise<Resultat<{ qualite: StatutQualite; verdict: VerdictComposants }>> {
  const j = await lireJob(ctx, e.jobId);
  if (!j.ok) return j;
  const c = await composantsDuJob(ctx, j.job);
  if (!c.ok) return c;
  const brut = Array.isArray(e.constats) ? e.constats : [];
  const constats: ConstatComposant[] = brut
    .filter((x): x is { composant: string; present: unknown } => typeof x === 'object' && x !== null && typeof (x as { composant?: unknown }).composant === 'string')
    .map((x) => ({ composant: x.composant, present: x.present === true ? true : x.present === false ? false : null }));
  const verdict = verdictComposants({ requis: c.requis, controle: null, constats });
  if (verdict.statut === 'requires_review') {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: verdict.nonVerifies.length ? verdict.nonVerifies.map((n) => ({ chemin: 'constats', raison: `composant « ${n} » non coché` })) : [{ chemin: 'constats', raison: 'aucun composant obligatoire déclaré · accepte ou rejette le média depuis sa carte' }] });
  }
  return poser(ctx, j.job, verdict.statut, 'relecteur', verdict, verdict.statut === 'passed' ? 'media.accept' : 'media.reject');
}
