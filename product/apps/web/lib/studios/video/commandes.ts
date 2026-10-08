import 'server-only';
import { db, schema } from '@tiktrends/db';
import {
  appliquerOperationVideo, lireOperationVideo, impactVideo, erreurStudio, CHEMINS_VIDEO,
  type ContenuVersion, type ErreurStudio, type BilanDurees, type LigneImpactVideo,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, estUuid, lireProjet, lireVersion, type VersionStudio } from '../depot';
import { creerDevis, approuverEtMettreEnFile, type DevisPresente, type JobPresente, type OptionsApprobation } from '../execution/commandes';
import { mediasProduits } from './lecture';

/**
 * Studios · L6-A · les gestes de l'écran vidéo.
 *
 *  · `appliquerOperationVideoPour` · `studio.propose`, AUCUN appel, AUCUN
 *    coût : le serveur rejoue l'opération (noyau) sur la version de base,
 *    écrit une nouvelle version (`enregistrerVersion` : base obligatoire, 409,
 *    audit) sur `/shots` et `/timeline` seulement, et range le plan d'impact
 *    du geste (`studio_impact_plans`, immuable). Aucun devis, aucun job.
 *  · `devisKeyframePour` · `studio.generate`, devis L3 d'UNE image clé de plan
 *    (variante volontaire), raccordé à sa consigne `shot.image` ;
 *  · `approuverKeyframePour` · `studio.generate`, la SEULE qui engage de
 *    l'argent, refusée si le fournisseur d'images n'est pas branché.
 *
 * L'animation n'a aucun geste ici : un clip est refusé dès le devis (L3)
 * tant que le worker n'a pas PROUVÉ son décodeur vidéo (sonde fraîche,
 * `lireCapaciteVideo`) et tant qu'aucun fournisseur d'animation n'est branché
 * (`FOURNISSEUR_ANIMATION_BRANCHE`) ; l'écran le dit.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface ImpactPresente {
  resume: string;
  aRefaire: LigneImpactVideo[];
  conservees: LigneImpactVideo[];
  mediasObsoletes: LigneImpactVideo[];
  aucuneGeneration: boolean;
  planHash: string;
}

export async function appliquerOperationVideoPour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; operation: unknown }):
  Promise<Resultat<{ version: VersionStudio; inchange: boolean; impact: ImpactPresente; durees: BilanDurees; signalements: string[] }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const op = lireOperationVideo(e.operation);
  if (!op.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'operation', raison: op.message }] });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!estUuid(e.baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const base = await lireVersion(ctx, e.baseVersionId);
  if (!base.ok || base.version.projectId !== projet.id) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  const avant = base.version.content as ContenuVersion;
  const medias = await mediasProduits(db, { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id }, avant);

  const r = appliquerOperationVideo(avant, op.operation, { sortiesExistantes: medias.valides });
  if (!r.ok) {
    if (r.code === 'AUCUN_CHANGEMENT') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'operation', raison: r.message }], message: r.message });
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: r.violations.length ? r.violations : [{ chemin: 'operation', raison: r.message }], message: r.message });
  }
  const w = await enregistrerVersion(ctx, { projectId: projet.id, baseVersionId: base.version.id, changes: r.changes, allowedPaths: CHEMINS_VIDEO, raison: r.libelle });
  if (!w.ok) return w;
  const i = impactVideo(avant, w.version.content as ContenuVersion, { mediasExistants: medias.valides });
  if (!w.inchange) {
    try {
      await db.insert(schema.studioImpactPlans).values({
        workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id,
        fromVersionId: base.version.id, toVersionId: w.version.id,
        changedInputs: i.plan.entreesModifiees, reused: i.plan.reutilisees, obsolete: i.plan.obsoletes, redo: i.plan.aRefaire,
        planHash: i.plan.empreinte, createdBy: ctx.userId,
      });
    } catch (err) {
      // La version est écrite ; le plan d'impact se recalcule à l'identique depuis les deux versions.
      console.error(`[studios:l6a] ${ctx.traceId} plan d’impact`, err instanceof Error ? err.message : err);
    }
  }
  return {
    ok: true, version: w.version, inchange: w.inchange, durees: r.durees, signalements: r.signalements,
    impact: { resume: i.resume, aRefaire: i.aRefaire, conservees: i.conservees, mediasObsoletes: i.mediasObsoletes, aucuneGeneration: i.aucuneGeneration, planHash: i.plan.empreinte },
  };
}

/** Devis d'UNE image clé de plan · consigne exigée par le raccord L3 (aucune dépense). */
export async function devisKeyframePour(ctx: ContexteStudio, e: { projectId: unknown; shotId: unknown }, maintenant: Date = new Date()): Promise<Resultat<{ devis: DevisPresente }>> {
  if (typeof e.shotId !== 'string' || !e.shotId || e.shotId === 's_image') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotId', raison: 'plan vidéo attendu' }] });
  const d = await creerDevis(ctx, { projectId: e.projectId, operations: [`keyframe:${e.shotId}`], variante: true }, db, maintenant);
  if (!d.ok) {
    if (d.code === 'INVALID_SCHEMA' && d.violations?.some((v) => v.chemin === 'operations' && v.raison.startsWith('opérations absentes'))) {
      return erreurStudio('NOT_FOUND', { traceId: ctx.traceId, message: 'Ce plan n’existe plus dans la version courante · recharge le storyboard.' });
    }
    return d;
  }
  return { ok: true, devis: d.devis };
}

/** Approuver et lancer · refusé tant que le fournisseur d'images n'est pas branché (rien ne serait exécuté). */
export async function approuverKeyframePour(
  ctx: ContexteStudio,
  e: { quoteId: unknown; inputHash: unknown; creditsAnnonces: unknown; idempotencyKey: unknown },
  o: OptionsApprobation & { fournisseurImage: boolean },
): Promise<Resultat<{ job: JobPresente; deja: boolean }>> {
  if (!o.fournisseurImage) {
    return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: 'Le fournisseur d’images n’est pas branché sur ce serveur · rien n’a été approuvé ni débité.' });
  }
  return approuverEtMettreEnFile(ctx, e, o);
}
