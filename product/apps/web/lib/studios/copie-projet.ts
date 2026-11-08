import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, contenuCopieProjet, objetDansPortee, erreurStudio, mediasCitesCopie, raisonCopieProjet, titreCopieProjet, titreProjetValide,
  type BilanCopieProjet, type ContenuVersion, type ErreurStudio, type OrigineMediaCopie,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';
import { ajouterAudit } from './audit';
import { creerProjet, estUuid, lireProjet, lireVersion, type ProjetStudio, type VersionStudio } from './depot';

/**
 * Studios · lot 8 V5 · renommer et dupliquer un projet (règles :
 * `C/studios/copie-projet.ts`). Les deux gestes demandent `studio.propose`,
 * la permission qui édite déjà le projet (`enregistrerDocument`) · aucune
 * permission nouvelle. Portée relue dans chaque requête (hors portée =
 * introuvable). Gratuit · aucun appel IA, aucune génération.
 *
 *  · renommer · `studio_projects.title` seul, sous le verrou de la ligne, avec
 *    l'audit `project.rename` (avant, après) dans la même transaction · les
 *    versions ne changent pas ;
 *  · dupliquer · un NOUVEAU projet de la MÊME marque et du même type, créé
 *    par `creerProjet` (le chemin de création, ses contrôles et son audit),
 *    dont la version 1 reprend la STRUCTURE de la version courante
 *    (`contenuCopieProjet`) · aucune ligne de génération, d'export, de
 *    variante, de test, de mesure ni de verdict n'est copiée.
 */

type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export async function renommerProjetPour(ctx: ContexteStudio, e: { projectId: unknown; titre: unknown }): Promise<Resultat<{ projet: ProjetStudio }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  if (!estUuid(e.projectId) || ctx.marques.length === 0) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const t = titreProjetValide(e.titre);
  if (!t.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'titre', raison: t.raison }] });
  const P = schema.studioProjects;
  const portee = and(eq(P.id, e.projectId), eq(P.workspaceId, ctx.workspaceId), inArray(P.brandId, ctx.marques));
  try {
    return await db.transaction(async (tx): Promise<Resultat<{ projet: ProjetStudio }>> => {
      const [p] = await tx.select().from(P).where(portee).limit(1).for('update');
      // Relu par la portée du dépôt (restrictions de marque comprises) · deux gardes valent mieux qu'une.
      if (!p || !objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, p)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
      if (p.title === t.titre) return { ok: true, projet: p };
      const [maj] = await tx.update(P).set({ title: t.titre, updatedAt: new Date(), rowVersion: sql`${P.rowVersion} + 1` }).where(portee).returning();
      await ajouterAudit(tx, ctx, {
        action: 'project.rename', brandId: p.brandId, targetType: 'studio_project', targetId: p.id,
        versionBefore: p.currentVersionId, versionAfter: p.currentVersionId,
        reason: 'Projet renommé', details: { avant: p.title, apres: t.titre },
      });
      return { ok: true, projet: maj! };
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} renommage`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'Le projet n’a pas pu être renommé · actualise la page puis réessaie.' });
  }
}

/** L'origine RELUE (dans la portée) de chaque média cité · un média du catalogue ou inconnu n'en a pas. */
async function originesMedias(ctx: ContexteStudio, ids: string[]): Promise<Record<string, OrigineMediaCopie>> {
  const uuids = ids.filter(estUuid);
  if (!uuids.length || ctx.marques.length === 0) return {};
  const A = schema.studioAssets;
  const lignes = await db.select({ id: A.id, origin: A.origin }).from(A)
    .where(and(inArray(A.id, uuids), eq(A.workspaceId, ctx.workspaceId), inArray(A.brandId, ctx.marques)));
  return Object.fromEntries(lignes.map((l) => [l.id, l.origin as OrigineMediaCopie]));
}

export async function dupliquerProjetPour(ctx: ContexteStudio, e: { projectId: unknown }): Promise<Resultat<{ projet: ProjetStudio; version: VersionStudio; source: { id: string; versionId: string }; bilan: BilanCopieProjet }>> {
  if (!aPermissionEspace(ctx.permissions, 'studio.propose')) return erreurStudio('FORBIDDEN', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  if (v.version.projectId !== p.projet.id) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const source = v.version.content as ContenuVersion;
  const { contenu, bilan } = contenuCopieProjet(source, await originesMedias(ctx, mediasCitesCopie(source)));
  // La marque de la copie est CELLE du projet source, relue · jamais une marque venue du client.
  const c = await creerProjet(ctx, {
    brandId: p.projet.brandId, kind: p.projet.kind, title: titreCopieProjet(p.projet.title), contenu,
    raison: raisonCopieProjet({ titre: p.projet.title, versionN: v.version.n }, bilan),
  });
  if (!c.ok) return c;
  return { ok: true, projet: c.projet, version: c.version, source: { id: p.projet.id, versionId: v.version.id }, bilan };
}
