import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { validerSelectionEssai, planLotEssai, erreurStudio, type PlanLotEssai, type VariantePourEssai } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import type { BaseStudio } from '../execution/types';
import { liensEtVerdicts } from './variantes';
import { porteeSql, horsPortee, introuvable, estUuid, type Resultat } from './commun';

/**
 * Lot 3b · préparer un LOT D'ESSAI depuis les variantes d'un projet.
 *
 * LECTURE PURE : aucune écriture, aucune génération, aucun coût. Le serveur
 * relit dans la portée de la session (espace ET marques visibles, double garde
 * de `commun.ts`) les variantes demandées, le contenu de LEUR version, le plan
 * qui a livré chaque média et leur test ; la règle pure `planLotEssai` décide.
 *
 * Toute variante hors portée, d'un autre projet ou inconnue rend le même refus
 * neutre (`NOT_FOUND`) que le reste des Studios : un autre espace ne voit rien
 * et ne prépare rien.
 *
 * La suite passe par le chemin EXISTANT : le plan donne, par variante, la
 * saisie à reprendre dans `rattacherVarianteAuTest` (fiche Adsmap en
 * brouillon), puis le regroupement en lot se fait dans Résultats › Lots de test.
 */

const P = schema.studioProjects;
const VA = schema.studioVariants;
const V = schema.studioProjectVersions;
const A = schema.studioAssets;
const J = schema.studioJobs;

export interface EntreeEssai { projectId: unknown; variable: unknown; variantIds: unknown }

function assetsDuJob(result: unknown): Record<string, string> {
  const a = (result as { assets?: unknown } | null)?.assets;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (typeof v === 'string') out[k] = v;
  return out;
}

export async function preparerLotEssai(ctx: ContexteStudio, e: EntreeEssai, o: { adsmapAcces: boolean }, base: BaseStudio = db): Promise<Resultat<{ plan: PlanLotEssai }>> {
  if (!estUuid(e.projectId)) return introuvable(ctx);
  const s = validerSelectionEssai({ variable: e.variable, variantIds: e.variantIds });
  if (!s.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'selection', raison: s.raison }], message: s.raison });
  const { variable, variantIds } = s.selection;

  const [projet] = await base.select({ id: P.id, workspaceId: P.workspaceId, brandId: P.brandId }).from(P).where(and(eq(P.id, e.projectId), porteeSql(P, ctx))).limit(1);
  if (horsPortee(ctx, projet)) return introuvable(ctx);
  const p = projet!;

  const variantes = (await base.select().from(VA).where(and(inArray(VA.id, variantIds), eq(VA.projectId, p.id), porteeSql(VA, ctx))))
    .filter((v) => !horsPortee(ctx, v));
  // Une seule variante manquante (autre projet, autre espace, inconnue) ⇒ refus neutre, rien n'est révélé.
  if (variantes.length !== variantIds.length) return introuvable(ctx);

  const versions = await base.select({ id: V.id, content: V.content, workspaceId: V.workspaceId, brandId: V.brandId }).from(V)
    .where(and(inArray(V.id, [...new Set(variantes.map((v) => v.projectVersionId))]), eq(V.projectId, p.id), porteeSql(V, ctx)));
  const contenuParVersion = new Map(versions.filter((v) => !horsPortee(ctx, v)).map((v) => [v.id, v.content]));
  const assets = await base.select({ id: A.id, sha256: A.sha256, workspaceId: A.workspaceId, brandId: A.brandId }).from(A)
    .where(and(inArray(A.id, variantes.map((v) => v.mediaAssetId)), porteeSql(A, ctx)));
  const shaParAsset = new Map(assets.filter((a) => !horsPortee(ctx, a)).map((a) => [a.id, a.sha256]));

  // L'opération qui a livré chaque média · lue dans `result.assets` des jobs du projet, pas déduite.
  const jobs = (await base.select({ result: J.result, workspaceId: J.workspaceId, brandId: J.brandId }).from(J).where(and(eq(J.projectId, p.id), porteeSql(J, ctx))))
    .filter((j) => !horsPortee(ctx, j));
  const operationParAsset = new Map<string, string>();
  for (const j of jobs) for (const [op, id] of Object.entries(assetsDuJob(j.result))) operationParAsset.set(id, op);

  const liens = await liensEtVerdicts(base, ctx, variantes.map((v) => v.id));
  const dernierLien = new Map<string, (typeof liens)[number]>();
  for (const l of liens) if (!horsPortee(ctx, l) && !dernierLien.has(l.variantId)) dernierLien.set(l.variantId, l);

  const parId = new Map(variantes.map((v) => [v.id, v]));
  const lues: VariantePourEssai[] = variantIds.map((id) => {
    const v = parId.get(id)!;
    const l = dernierLien.get(id);
    return {
      variantId: v.id, libelle: v.label, contenu: contenuParVersion.get(v.projectVersionId) ?? null,
      operation: operationParAsset.get(v.mediaAssetId) ?? null, sha256: shaParAsset.get(v.mediaAssetId) ?? '',
      test: l ? { adsmapAdId: l.adsmapAdId, adStatus: l.adStatus } : null,
    };
  });

  return { ok: true, plan: planLotEssai(lues, variable, { adsmapAcces: o.adsmapAcces }) };
}
