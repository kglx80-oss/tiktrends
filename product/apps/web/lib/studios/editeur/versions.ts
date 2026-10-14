import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  comparerPourRestauration, differencesDetaillees, erreurStudio, libelleAuteurVersion, objetDansPortee, planRestauration, validerDocument,
  type ContenuVersion, type DocumentStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { enregistrerVersion, lireProjet, lireVersion } from '../depot';
import { urlsApercu } from './apercus';
import type { ApercuVersion, ReponseEditeur, VersionListee } from './types';

/**
 * Versions du projet vues depuis l'éditeur · liste, aperçu comparé, et
 * restauration NON DESTRUCTIVE (spec UX V2 § 3).
 *
 * Portée : `lireProjet` / `lireVersion` du dépôt (filtre SQL espace + marques
 * visibles, puis revérification pure) ; la liste applique les deux mêmes
 * gardes. Une version d'un autre projet, d'une autre marque ou d'un autre
 * espace répond `NOT_FOUND`, comme une version inconnue.
 *
 * La restauration passe par `enregistrerVersion` · le MÊME chemin que
 * « Enregistrer » (version de base obligatoire, 409 si elle n'est plus la
 * courante, nouvelle ligne immuable, audit `project.version.create`). Rien
 * n'est jamais mis à jour ni supprimé dans la table des versions.
 */

/** La liste montre les cinquante dernières, comme l'écran d'export. */
export const VERSIONS_LISTEES_MAX = 50;

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

const portee = (ctx: ContexteStudio) => ({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque });

/** Document affichable d'un contenu · `null` s'il est absent ou illisible (l'aperçu le dit). */
function documentLisible(contenu: ContenuVersion | null): { document: DocumentStudio | null; illisible: boolean } {
  const brut = contenu?.document ?? null;
  if (brut === null) return { document: null, illisible: false };
  return validerDocument(brut, '/document', { base: brut }).length ? { document: null, illisible: true } : { document: brut as DocumentStudio, illisible: false };
}

export async function listerVersionsEditeur(ctx: ContexteStudio, projectId: unknown): Promise<ReponseEditeur<{ versions: VersionListee[] }>> {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (ctx.marques.length === 0) return introuvable(ctx);
  const V = schema.studioProjectVersions;
  const U = schema.users;
  const lignes = await db.select({
    id: V.id, n: V.n, workspaceId: V.workspaceId, brandId: V.brandId, createdAt: V.createdAt, reason: V.reason,
    authorId: V.authorId, nom: U.name, email: U.email, masque: U.hidePersonalInfo,
  }).from(V).leftJoin(U, eq(U.id, V.authorId))
    .where(and(eq(V.projectId, projet.id), eq(V.workspaceId, ctx.workspaceId), inArray(V.brandId, ctx.marques)))
    .orderBy(desc(V.n)).limit(VERSIONS_LISTEES_MAX);
  return {
    ok: true,
    versions: lignes.filter((l) => objetDansPortee(portee(ctx), l)).map((l) => ({
      id: l.id, n: l.n, creeLe: l.createdAt.toISOString(), raison: l.reason,
      auteur: libelleAuteurVersion({ authorId: l.authorId, nom: l.nom, email: l.email, masque: !!l.masque }, ctx.userId),
      courante: l.id === projet.currentVersionId,
    })),
  };
}

/** Une version du projet ET la courante · toutes deux dans la portée, toutes deux de CE projet. */
async function versionEtCourante(ctx: ContexteStudio, projectId: unknown, versionId: unknown) {
  const p = await lireProjet(ctx, projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return introuvable(ctx);
  const v = await lireVersion(ctx, versionId);
  if (!v.ok || v.version.projectId !== p.projet.id) return introuvable(ctx);
  const c = await lireVersion(ctx, p.projet.currentVersionId);
  if (!c.ok || c.version.projectId !== p.projet.id) return introuvable(ctx);
  return { ok: true as const, projet: p.projet, version: v.version, courante: c.version };
}

/** Lecture PURE · le document d'une version et ce que sa restauration changerait. N'écrit rien. */
export async function lireApercuVersion(ctx: ContexteStudio, projectId: unknown, versionId: unknown): Promise<ReponseEditeur<{ apercu: ApercuVersion }>> {
  const r = await versionEtCourante(ctx, projectId, versionId);
  if (!r.ok) return r;
  const contenu = r.version.content as ContenuVersion;
  const { document, illisible } = documentLisible(contenu);
  const ids = document ? Object.values(document.layers).flatMap((c) => (c.kind === 'image' || c.kind === 'logo' ? [c.assetId] : [])) : [];
  return {
    ok: true,
    apercu: {
      version: { id: r.version.id, n: r.version.n },
      courante: { id: r.courante.id, n: r.courante.n },
      document,
      documentIllisible: illisible,
      apercus: urlsApercu(ids, r.projet.id),
      comparaison: comparerPourRestauration(r.courante.content as ContenuVersion, contenu, r.version.n),
    },
  };
}

/**
 * Restaure `versionId` · une NOUVELLE version au contenu de celle-ci, partie
 * de `baseVersionId` (la courante vue par l'écran). Le patch est calculé ici,
 * à partir des contenus relus en base · le client n'envoie que des identifiants.
 */
export async function restaurerVersionEditeur(
  ctx: ContexteStudio,
  e: { projectId: unknown; versionId: unknown; baseVersionId: unknown },
): Promise<ReponseEditeur<{ version: { id: string; n: number }; restauree: { id: string; n: number }; contenu: ContenuVersion; document: DocumentStudio | null }>> {
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const cible = await lireVersion(ctx, e.versionId);
  if (!cible.ok || cible.version.projectId !== p.projet.id) return introuvable(ctx);
  const base = await lireVersion(ctx, e.baseVersionId);
  if (!base.ok || base.version.projectId !== p.projet.id) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  }
  // Base périmée · le 409 d'abord, comme « Enregistrer » (la cible peut être l'ancienne courante elle-même).
  // `enregistrerVersion` le revérifie sous verrou : deux restaurations simultanées ne passent pas toutes les deux.
  if (p.projet.currentVersionId !== base.version.id) {
    const c = p.projet.currentVersionId ? await lireVersion(ctx, p.projet.currentVersionId) : null;
    if (!c || !c.ok) return introuvable(ctx);
    return erreurStudio('VERSION_CONFLICT', {
      traceId: ctx.traceId, targetIds: [p.projet.id, c.version.id],
      conflit: { versionCouranteId: c.version.id, differences: differencesDetaillees(base.version.content, c.version.content) },
    });
  }
  const plan = planRestauration(
    { id: base.version.id, n: base.version.n, contenu: base.version.content as ContenuVersion },
    { id: cible.version.id, n: cible.version.n, contenu: cible.version.content as ContenuVersion },
  );
  if (!plan.ok) return erreurStudio('INVARIANT_CONFLICT', { traceId: ctx.traceId, message: plan.message });

  const r = await enregistrerVersion(ctx, { projectId: p.projet.id, baseVersionId: base.version.id, changes: plan.changes, raison: plan.raison });
  if (!r.ok) return r;
  const contenu = r.version.content as ContenuVersion;
  return {
    ok: true,
    version: { id: r.version.id, n: r.version.n },
    restauree: { id: cible.version.id, n: cible.version.n },
    contenu,
    document: documentLisible(contenu).document,
  };
}
