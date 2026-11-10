import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  aPermissionEspace, contenuCopieProjet, objetDansPortee, erreurStudio, mediasCitesCopie, raisonCopieProjet, titreCopieProjet, titreProjetValide,
  lireCopieDe, ACTION_COPIE_DE, CLE_COPIE_DE,
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
 *    variante, de test, de mesure ni de verdict n'est copiée · l'audit de la
 *    création porte `copieDe` (projet et version sources · `detailsCopieDe`),
 *    le seul lien entre les deux projets, relu par `liensDeCopie` (journal du
 *    projet source, lignée des deux projets).
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
    copieDe: { projectId: p.projet.id, versionId: v.version.id },
  });
  if (!c.ok) return c;
  return { ok: true, projet: c.projet, version: c.version, source: { id: p.projet.id, versionId: v.version.id }, bilan };
}

/* ─────────────────────── le lien de copie, relu ─────────────────────── */

export interface CopieLue { id: string; titre: string; versionId: string; evenementId: string; le: Date; acteurId: string | null }
export interface LiensDeCopie {
  /** Le projet dont celui-ci est la copie · `null` sans lien enregistré (duplication passée) ou hors portée. */
  source: { id: string; titre: string; versionId: string } | null;
  /** Les copies de ce projet · leur création porte `copieDe` vers lui · `titre` `null` quand la copie n'est plus lisible. */
  copies: Array<Omit<CopieLue, 'titre'> & { titre: string | null }>;
}

/** Au plus ce nombre de copies relues · la lecture reste bornée. */
export const COPIES_MAX_LUES = 200;

/**
 * Les liens de copie d'un projet DÉJÀ relu dans la portée · LECTURE seule ·
 * l'audit de la création de chaque copie (`project.create` · `copieDe` vers ce
 * projet), et celui de la création de ce projet (sa source) · chaque projet
 * cité est relu dans la portée (espace, marques visibles, restrictions) · un
 * projet hors portée ne se dit pas (ni titre, ni lien). Une duplication passée
 * (sans `copieDe`) n'apparaît nulle part · rien n'est deviné.
 */
export async function liensDeCopie(ctx: ContexteStudio, projet: { id: string; brandId: string }): Promise<LiensDeCopie> {
  if (ctx.marques.length === 0 || !ctx.marques.includes(projet.brandId)) return { source: null, copies: [] };
  const E = schema.studioAuditEvents;
  const P = schema.studioProjects;
  const portee = { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque };
  const base = and(eq(E.action, ACTION_COPIE_DE), eq(E.targetType, 'studio_project'), eq(E.workspaceId, ctx.workspaceId), eq(E.brandId, projet.brandId));
  const [cree, copies] = await Promise.all([
    db.select({ details: E.details }).from(E).where(and(base, eq(E.targetId, projet.id))).limit(1),
    db.select({ id: E.id, cible: E.targetId, details: E.details, le: E.occurredAt, acteur: E.actorId }).from(E)
      .where(and(base, sql`${E.details} -> ${CLE_COPIE_DE} ->> 'projectId' = ${projet.id}`)).orderBy(E.occurredAt).limit(COPIES_MAX_LUES),
  ]);
  const lien = lireCopieDe(cree[0]?.details);
  const ids = [...new Set([...(lien ? [lien.projectId] : []), ...copies.map((c) => c.cible)])].filter(estUuid);
  const lus = ids.length
    ? (await db.select({ id: P.id, titre: P.title, workspaceId: P.workspaceId, brandId: P.brandId }).from(P)
      .where(and(inArray(P.id, ids), eq(P.workspaceId, ctx.workspaceId), inArray(P.brandId, ctx.marques)))).filter((x) => objetDansPortee(portee, x))
    : [];
  const titre = new Map(lus.map((x) => [x.id, x.titre]));
  const src = lien && lien.projectId !== projet.id && titre.has(lien.projectId) ? { id: lien.projectId, titre: titre.get(lien.projectId)!, versionId: lien.versionId } : null;
  return {
    source: src,
    copies: copies.flatMap((c) => {
      const l = lireCopieDe(c.details);
      // Le lien relu doit désigner CE projet · la requête le filtre, la lecture défensive le confirme.
      if (!l || l.projectId !== projet.id || c.cible === projet.id) return [];
      return [{ id: c.cible, titre: titre.get(c.cible) ?? null, versionId: l.versionId, evenementId: c.id, le: c.le, acteurId: c.acteur }];
    }),
  };
}
