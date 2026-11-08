import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  ACTION_AUDIT_RELECTURE_EXPORT, aPermissionEspace, erreurStudio, libelleAuteurVersion, lireTraceRelecture, objetDansPortee, pointsRelectureValides,
  type ErreurStudio, type RelectureExport, type TraceRelectureExport,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { lireProjet, lireVersion, type ProjetStudio, type VersionStudio } from '../depot';
import { ajouterAudit } from '../audit';

/**
 * Studios · lot 8 V5 · la relecture HUMAINE avant export (règle :
 * `C/studios/export/relecture.ts`).
 *
 *  · valider · `studio.export` relu (la garde neuve de l'action), projet et
 *    version lus DANS LA PORTÉE, les cinq points tous cochés · une seule
 *    écriture, l'événement d'audit `project.export.review` (acteur, date,
 *    version, points) dans le journal existant (ajout seul) · aucune migration ;
 *  · lire · la relecture la plus récente de CETTE version, relue dans la
 *    portée · `null` si aucune (l'export reste fermé) ;
 *  · l'export (`exporterVersionPour`) la relit au clic · sans elle, rien
 *    n'est fabriqué ni écrit.
 *
 * Gratuit · aucun appel IA, aucune génération.
 */

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

const portee = (ctx: ContexteStudio) => ({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque });

/** La relecture enregistrée la plus récente d'une version du projet · `null` sans relecture complète. */
export async function relectureDeVersion(ctx: ContexteStudio, projet: ProjetStudio, version: VersionStudio): Promise<RelectureExport | null> {
  if (ctx.marques.length === 0 || version.projectId !== projet.id) return null;
  const E = schema.studioAuditEvents;
  const U = schema.users;
  const lignes = await db.select({
    details: E.details, workspaceId: E.workspaceId, brandId: E.brandId, le: E.occurredAt,
    acteur: E.actorId, nom: U.name, email: U.email, masque: U.hidePersonalInfo,
  }).from(E).leftJoin(U, eq(U.id, E.actorId))
    .where(and(
      eq(E.action, ACTION_AUDIT_RELECTURE_EXPORT), eq(E.targetType, 'studio_project_version'), eq(E.targetId, version.id),
      eq(E.workspaceId, ctx.workspaceId), inArray(E.brandId, ctx.marques),
    ))
    .orderBy(desc(E.occurredAt)).limit(5);
  for (const l of lignes) {
    if (!l.workspaceId || !l.brandId || !objetDansPortee(portee(ctx), { workspaceId: l.workspaceId, brandId: l.brandId })) continue;
    const t = lireTraceRelecture(l.details);
    if (!t || t.versionId !== version.id || t.projectId !== projet.id) continue;
    const par = libelleAuteurVersion({ authorId: l.acteur, nom: l.nom, email: l.email, masque: !!l.masque }, ctx.userId);
    return { par: par === 'Toi' ? 'toi' : par, le: l.le.toISOString(), versionN: t.versionN };
  }
  return null;
}

/**
 * Valide la relecture humaine d'une version · les cinq points, par la personne
 * de la session, maintenant. `versionId` absent · la version courante (comme l'export).
 */
export async function validerRelecturePour(ctx: ContexteStudio, e: { projectId: unknown; versionId?: unknown; points: unknown }): Promise<Resultat<{ relecture: RelectureExport }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.export')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const v = await lireVersion(ctx, e.versionId ?? p.projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const pts = pointsRelectureValides(e.points);
  if (!pts.ok) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'points', raison: pts.raison }] });
  }
  const trace: TraceRelectureExport = { projectId: p.projet.id, versionId: v.version.id, versionN: v.version.n, points: pts.points };
  try {
    await ajouterAudit(db, ctx, {
      action: ACTION_AUDIT_RELECTURE_EXPORT, brandId: p.projet.brandId, targetType: 'studio_project_version', targetId: v.version.id,
      versionBefore: v.version.id, versionAfter: v.version.id,
      reason: `Relecture humaine avant export de la version ${v.version.n} · ${pts.points.length} points validés`,
      details: { ...trace },
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} relecture d'export`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
  const r = await relectureDeVersion(ctx, p.projet, v.version);
  return r ? { ok: true, relecture: r } : erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
}
