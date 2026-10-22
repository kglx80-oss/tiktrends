import 'server-only';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { aPermissionEspace, erreurStudio, type ErreurStudio } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { estUuid } from './sources';

type Resultat = { ok: true } | ErreurStudio;

/** Suppression réversible : conserve versions, médias et comptabilité. Le verrou
 * exclusif du projet sérialise ce geste avec l'approbation d'une génération. */
async function changerStatut(ctx: ContexteStudio, projectId: unknown, status: 'active' | 'archived'): Promise<Resultat> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estUuid(projectId) || ctx.marques.length === 0) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const P = schema.studioProjects;
  const portee = and(eq(P.id, projectId), eq(P.workspaceId, ctx.workspaceId), inArray(P.brandId, ctx.marques));
  try {
    return await db.transaction(async (tx): Promise<Resultat> => {
      const [p] = await tx.select().from(P).where(portee).limit(1).for('update');
      if (!p) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      if (p.status === status) return { ok: true };
      if (status === 'archived') {
        const J = schema.studioJobs;
        const [job] = await tx.select({ id: J.id }).from(J).where(and(
          eq(J.projectId, p.id), eq(J.workspaceId, p.workspaceId), eq(J.brandId, p.brandId),
          notInArray(J.state, ['completed', 'failed', 'cancelled']),
        )).limit(1);
        if (job) return erreurStudio('INVARIANT_CONFLICT', {
          traceId: ctx.traceId,
          message: 'Une génération est encore en cours ou son résultat doit être vérifié. Attends sa résolution avant de supprimer ce projet.',
        });
      }
      await tx.update(P).set({ status, updatedAt: new Date(), rowVersion: sql`${P.rowVersion} + 1` }).where(portee);
      await ajouterAudit(tx, ctx, {
        action: status === 'archived' ? 'studio.project.archived' : 'studio.project.restored',
        brandId: p.brandId, targetType: 'studio_project', targetId: p.id,
        versionBefore: p.currentVersionId, versionAfter: p.currentVersionId,
        details: { statusBefore: p.status, statusAfter: status },
      });
      return { ok: true };
    });
  } catch {
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'Le projet n’a pas pu être mis à jour. Actualise la page puis réessaie.' });
  }
}

export const supprimerProjetPour = (ctx: ContexteStudio, projectId: unknown): Promise<Resultat> => changerStatut(ctx, projectId, 'archived');
export const restaurerProjetPour = (ctx: ContexteStudio, projectId: unknown): Promise<Resultat> => changerStatut(ctx, projectId, 'active');
