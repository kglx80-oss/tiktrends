import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  preparerShotImage, construireConsignePlan, lireConsignePlan, empreinteConsignePlan, entreesConsignePlan, changementsConsignePlan,
  formatVideo, estSansTexte, erreurStudio, ACTION_CONSIGNE_PLAN, CHEMINS_CONSIGNE_PLAN,
  type ConsignePlanPersistee, type ContenuVersion, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { enregistrerVersion, estUuid, lireProjet, lireVersion, type VersionStudio } from '../depot';
import { executerTache } from '../prompts/resolveur';
import type { AdaptateurModele } from '../prompts/adaptateur';
import type { EnvironnementPrompts } from '../prompts/environnement';
import type { ExecStudio } from '../execution/types';

/**
 * Studios · L6-A · la consigne d'image d'un plan vidéo (`shot.image`),
 * conservée CÔTÉ SERVEUR sur le modèle exact de F-B :
 *
 *  1. `compilerConsignePlanPour` · contrôle avant l'appel (plan présent,
 *     produit cité ⇒ photo épinglée), `executerTache('shot.image')`
 *     (registre, release, barrière de dépense), consigne persistable, puis
 *     ATTESTATION au journal d'audit (ajout seul) · rien n'est écrit dans le
 *     projet ;
 *  2. `retenirConsignePlanPour` · le navigateur ne donne que le `runId` : le
 *     serveur relit l'attestation de CE projet, vérifie que les entrées de
 *     l'image clé n'ont pas changé, puis écrit `styleRef.consignesPlans.<plan>`
 *     dans une nouvelle version (`enregistrerVersion`, 409 respecté).
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface DependancesTexteVideo {
  adaptateur: AdaptateurModele | null;
  environnement: EnvironnementPrompts;
  maintenant: Date;
}

export const MESSAGE_SANS_RELEASE = 'Cette tâche n’est pas encore activée : aucune version des consignes n’est publiée. Rien n’a été facturé · le chemin manuel reste ouvert.';
export const MESSAGE_SANS_FOURNISSEUR = 'Le fournisseur de texte n’est pas configuré sur ce serveur. Rien n’a été facturé.';

/** Les erreurs du registre, dites en clair · même table que la compilation image (L5-C). */
export function erreurTache(ctx: ContexteStudio, code: string): ErreurStudio {
  const traceId = ctx.traceId;
  if (code === 'RELEASE_ACTIVE_ABSENTE') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_SANS_RELEASE });
  if (code === 'UNSUPPORTED_CAPABILITY') return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId, message: MESSAGE_SANS_FOURNISSEUR });
  if (code === 'BUDGET_EXCEEDED') return erreurStudio('BUDGET_EXCEEDED', { traceId });
  if (code === 'PROVIDER_ERROR') return erreurStudio('PROVIDER_UNCERTAIN', { traceId, message: 'Le fournisseur n’a pas répondu · rien n’est relancé automatiquement.' });
  return erreurStudio('INVALID_SCHEMA', { traceId, message: 'La réponse reçue n’est pas exploitable · rien n’a été retenu.' });
}

export interface Portee { workspaceId: string; brandId: string; projectId: string }

/** La consigne attestée d'une compilation (`runId`) de ce projet · relue en base, revérifiée. */
export async function consignePlanDuRun(ex: ExecStudio, p: Portee, runId: string): Promise<{ consigne: ConsignePlanPersistee; empreinte: string } | null> {
  const A = schema.studioAuditEvents;
  const [l] = await ex.select({ details: A.details }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_PLAN),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId), sql`${A.details}->>'runId' = ${runId}`,
  )).orderBy(desc(A.occurredAt)).limit(1);
  const d = l?.details as { consigne?: unknown; empreinte?: unknown; shotId?: unknown } | null | undefined;
  const c = lireConsignePlan(d?.consigne);
  if (!c || c.runId !== runId || d?.shotId !== c.shotId || d?.empreinte !== empreinteConsignePlan(c)) return null;
  return { consigne: c, empreinte: d.empreinte as string };
}

/** Les consignes compilées (attestées) sur une version donnée, la plus récente par plan. */
export async function consignesCompileesSur(ex: ExecStudio, p: Portee, versionId: string): Promise<Map<string, { consigne: ConsignePlanPersistee; empreinte: string }>> {
  const A = schema.studioAuditEvents;
  const lignes = await ex.select({ details: A.details }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_PLAN),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId), eq(A.versionBefore, versionId),
  )).orderBy(desc(A.occurredAt)).limit(60);
  const out = new Map<string, { consigne: ConsignePlanPersistee; empreinte: string }>();
  for (const l of lignes) {
    const d = l.details as { consigne?: unknown; empreinte?: unknown } | null;
    const c = lireConsignePlan(d?.consigne);
    if (!c || d?.empreinte !== empreinteConsignePlan(c) || out.has(c.shotId)) continue;
    out.set(c.shotId, { consigne: c, empreinte: d.empreinte as string });
  }
  return out;
}

export type ResultatCompilationPlan =
  | { ok: true; statut: 'compilee'; consigne: ConsignePlanPersistee; empreinte: string; runId: string; projectVersionId: string }
  | { ok: true; statut: 'questions'; questions: string[]; runId: string | null; projectVersionId: string }
  | ErreurStudio;

export async function compilerConsignePlanPour(ctx: ContexteStudio, e: { projectId: unknown; shotId: unknown }, o: DependancesTexteVideo): Promise<ResultatCompilationPlan> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  if (!p.projet.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const v = await lireVersion(ctx, p.projet.currentVersionId);
  if (!v.ok) return v;
  const contenu = v.version.content as ContenuVersion;
  if (typeof e.shotId !== 'string') return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'shotId', raison: 'identifiant de plan attendu' }] });
  // Contrôle AVANT l'appel · un refus n'écrit rien, pas même une trace, et n'appelle aucun fournisseur.
  const prep = preparerShotImage(contenu, e.shotId, v.version.id);
  if (!prep.ok) return erreurStudio(prep.code, { traceId: ctx.traceId, targetIds: [`keyframe:${e.shotId}`], message: `${prep.motif} Rien n’est parti, rien n’a été facturé.` });
  if (!o.adaptateur) return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: MESSAGE_SANS_FOURNISSEUR });

  const sansTexte = estSansTexte(contenu);
  const r = await executerTache({
    templateKey: 'shot.image',
    portee: { workspaceId: ctx.workspaceId, brandId: p.projet.brandId },
    acteur: { userId: ctx.userId, traceId: ctx.traceId },
    taskInputs: prep.taskInputs,
    contexte: {
      language: 'fr', projectVersionId: v.version.id, invariants: prep.invariants, references: prep.references,
      resolvedDocuments: prep.resolvedDocuments, selectionIds: [e.shotId],
    },
    liens: { projectId: p.projet.id, documentVersionId: v.version.id },
    adaptateur: o.adaptateur,
    environnement: o.environnement,
    sansTexte,
  });
  if (!r.ok) return erreurTache(ctx, r.code);
  const sortie = r.sortie as { status: string; questions?: string[]; result: { generationInstruction: string; referenceBindings: Array<{ referenceId: string; role: string; scope: string }>; protectedComponents: string[] } | null };
  if (sortie.status !== 'ready' || !sortie.result) {
    return { ok: true, statut: 'questions', questions: (sortie.questions ?? []).slice(0, 5), runId: r.runId, projectVersionId: v.version.id };
  }
  const plan = contenu.shots.byId[e.shotId]!;
  const format = formatVideo(contenu);
  const c = construireConsignePlan({
    runId: r.runId, shotId: e.shotId, sourceVersionId: v.version.id, entrees: prep.entrees, resultat: sortie.result,
    references: prep.references, composantsProteges: prep.composantsProteges, surimpression: !sansTexte && plan.onScreenText.length > 0,
    largeur: format.largeur, hauteur: format.hauteur, compileeLe: o.maintenant,
  });
  if (!c.ok) {
    return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: c.violations.map((raison) => ({ chemin: 'consigne', raison })), message: 'La consigne reçue lie une référence non transmise ou ne protège pas un composant · rien n’a été retenu.' });
  }
  try {
    await ajouterAudit(db, ctx, {
      action: ACTION_CONSIGNE_PLAN, brandId: p.projet.brandId, targetType: 'studio_project', targetId: p.projet.id,
      versionBefore: v.version.id, versionAfter: null, reason: `Consigne d’image du plan ${e.shotId} compilée et validée par le serveur`,
      details: { runId: r.runId, shotId: e.shotId, empreinte: c.empreinte, consigne: c.consigne },
    });
  } catch (err) {
    console.error(`[studios:l6a] ${ctx.traceId} attestation`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId, message: 'La consigne a été compilée mais n’a pas pu être conservée · recompile-la (un nouvel appel texte).' });
  }
  return { ok: true, statut: 'compilee', consigne: c.consigne, empreinte: c.empreinte, runId: r.runId, projectVersionId: v.version.id };
}

/** Range la consigne ATTESTÉE d'une compilation dans une nouvelle version · `styleRef.consignesPlans.<plan>` seul. */
export async function retenirConsignePlanPour(ctx: ContexteStudio, e: { projectId: unknown; baseVersionId: unknown; runId: unknown }): Promise<Resultat<{ version: VersionStudio; inchange: boolean; consigne: ConsignePlanPersistee }>> {
  if (!estUuid(e.projectId)) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const p = await lireProjet(ctx, e.projectId);
  if (!p.ok) return p;
  const projet = p.projet;
  if (!estUuid(e.runId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'runId', raison: 'identifiant de compilation attendu' }] });
  const a = await consignePlanDuRun(db, { workspaceId: projet.workspaceId, brandId: projet.brandId, projectId: projet.id }, e.runId);
  if (!a) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, message: 'Aucune consigne compilée par le serveur ne porte cet identifiant pour ce projet · compile-la d’abord.' });
  if (!estUuid(e.baseVersionId)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version de base obligatoire' }] });
  const base = await lireVersion(ctx, e.baseVersionId);
  if (!base.ok || base.version.projectId !== projet.id) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'baseVersionId', raison: 'version inconnue pour ce projet' }] });
  const contenu = base.version.content as ContenuVersion;
  if (entreesConsignePlan(contenu, a.consigne.shotId) !== a.consigne.entrees) {
    return erreurStudio('VERSION_CONFLICT', { traceId: ctx.traceId, targetIds: [`keyframe:${a.consigne.shotId}`], message: 'Le plan, le style, le produit ou une fiche citée a changé depuis cette compilation · recompile la consigne, rien n’a été retenu.' });
  }
  const rang = contenu.shots.order.indexOf(a.consigne.shotId) + 1;
  const raison = `Consigne d’image retenue · plan ${rang} · compilation ${a.consigne.runId.slice(0, 8)}`;
  const w = await enregistrerVersion(ctx, { projectId: projet.id, baseVersionId: base.version.id, changes: changementsConsignePlan(contenu, a.consigne, raison), allowedPaths: CHEMINS_CONSIGNE_PLAN, raison });
  if (!w.ok) return w;
  return { ...w, consigne: a.consigne };
}
