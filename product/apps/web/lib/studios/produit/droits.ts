import 'server-only';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import {
  normaliserDroitsAsset, lireDroitsAsset, libelleDroitsAsset, provenanceRenseignee, objetDansPortee, erreurStudio,
  type ErreurStudio, type LicenceAsset,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { ajouterAudit } from '../audit';
import { estUuid } from '../depot';

/**
 * Provenance et droits d'un média studio (`studio_assets.rights`) · SAISIE
 * gardée et LECTURE pour l'affichage (contrôle V5 A19 / L54, défaut F3).
 *
 * ── Portée, dans chaque requête ──────────────────────────────────────────────
 *
 * Comme le dépôt : `workspace_id = session` ET `brand_id IN marques visibles`,
 * puis revérification pure (`objetDansPortee`) de chaque ligne. Hors portée :
 * `NOT_FOUND`, identique à « n'existe pas » · AUCUNE écriture n'a lieu avant ce
 * contrôle. La règle « quels droits » vit dans le noyau (`droits-asset.ts`) :
 * ici on ne fait que lire la session, la ligne et écrire ce que le noyau valide.
 */

export type Resultat<T> = ({ ok: true } & T) | ErreurStudio;

export interface VueDroitsAsset {
  assetId: string;
  /** La licence posée, ou `null` tant que rien n'est renseigné. */
  licence: LicenceAsset | null;
  /** Le libellé à afficher · « Droits à préciser » par défaut. */
  libelle: string;
  source: string;
  renseigne: boolean;
  poseLe: string | null;
}

const introuvable = (ctx: ContexteStudio) => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });

function porteeSql(t: { workspaceId: PgColumn; brandId: PgColumn }, ctx: ContexteStudio): SQL {
  if (ctx.marques.length === 0) return sql`false`;
  return and(eq(t.workspaceId, ctx.workspaceId), inArray(t.brandId, ctx.marques))!;
}
const dansPortee = (ctx: ContexteStudio, l: { workspaceId: string; brandId: string } | undefined): boolean =>
  !!l && objetDansPortee({ workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque }, l);

function vue(assetId: string, rights: unknown): VueDroitsAsset {
  const d = lireDroitsAsset(rights);
  return {
    assetId,
    licence: d?.licence ?? null,
    libelle: libelleDroitsAsset(d),
    source: d?.source ?? '',
    renseigne: provenanceRenseignee(d),
    poseLe: d?.poseLe ?? null,
  };
}

export const ACTION_DROITS = 'asset.set_rights';

/**
 * Pose la provenance et les droits d'un média studio · garde de portée AVANT
 * écriture, licence validée par le noyau, trace d'audit dans la MÊME
 * transaction que l'écriture. Rejoue la lecture pour rendre la valeur stockée.
 */
export async function definirDroitsAssetPour(
  ctx: ContexteStudio,
  e: { assetId: unknown; licence: unknown; source?: unknown },
  o: { maintenant: Date },
): Promise<Resultat<{ droits: VueDroitsAsset }>> {
  if (!estUuid(e.assetId)) return introuvable(ctx);
  const assetId = e.assetId;
  const norm = normaliserDroitsAsset({ licence: e.licence, source: e.source }, { posePar: ctx.userId, poseLe: o.maintenant });
  if (!norm.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'licence', raison: norm.raison }] });

  const S = schema.studioAssets;
  const [row] = await db.select({ id: S.id, workspaceId: S.workspaceId, brandId: S.brandId, rights: S.rights })
    .from(S).where(and(eq(S.id, assetId), porteeSql(S, ctx))).limit(1);
  // Deux gardes valent mieux qu'une · filtre SQL PUIS revérification pure (restrictions de marque).
  if (!dansPortee(ctx, row)) return introuvable(ctx);

  try {
    await db.transaction(async (tx) => {
      // Re-contrôle de portée dans la transaction · la ligne ne sort jamais du filtre.
      await tx.update(S).set({ rights: norm.droits }).where(and(eq(S.id, assetId), porteeSql(S, ctx)));
      await ajouterAudit(tx, ctx, {
        action: ACTION_DROITS, brandId: row!.brandId, targetType: 'studio_asset', targetId: assetId,
        reason: 'provenance et droits', details: { licence: norm.droits.licence, source: norm.droits.source },
      });
    });
  } catch (err) {
    console.error(`[studios] ${ctx.traceId} droits média`, err instanceof Error ? err.message : err);
    return erreurStudio('PERSISTENCE_FAILED', { traceId: ctx.traceId });
  }
  const [relu] = await db.select({ rights: S.rights }).from(S).where(and(eq(S.id, assetId), porteeSql(S, ctx))).limit(1);
  return { ok: true, droits: vue(assetId, relu?.rights ?? norm.droits) };
}

/**
 * Lit les droits des médias d'un projet (portée relue) · pour l'affichage dans
 * la vue du projet (trace dans la version) et la restitution au rechargement.
 */
export async function lireDroitsAssetsProjetPour(ctx: ContexteStudio, projectId: string): Promise<VueDroitsAsset[]> {
  if (!estUuid(projectId) || ctx.marques.length === 0) return [];
  const S = schema.studioAssets;
  const rows = await db.select({ id: S.id, workspaceId: S.workspaceId, brandId: S.brandId, rights: S.rights })
    .from(S).where(and(eq(S.projectId, projectId), porteeSql(S, ctx)));
  return rows.filter((r) => dansPortee(ctx, r)).map((r) => vue(r.id, r.rights));
}
