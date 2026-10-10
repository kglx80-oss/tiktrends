import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  verdictSortieLivree, lotsLivreurs, elementStudioBibliotheque, objetDansPortee,
  ORIGINES_SORTIE_STUDIO, LIMITE_BIBLIOTHEQUE, type ElementStudioBibliotheque,
} from '@tiktrends/core';
import { gardeStudio } from './garde';
import { getActiveBrand } from '../brands';
import type { AssetItem } from '../../app/actions/assets';

/**
 * Sorties LIVRÉES des projets Studios, pour la bibliothèque `/assets`.
 *
 * Portée : la MÊME que la route qui sert le média (`/api/studios/media/:id`) ·
 * `gardeStudio('studio.read', 'projets')` relit la session, l'espace, les
 * marques de l'espace et les restrictions de marque. Refus (pas de session,
 * pas de droit Studios, capacité coupée) ⇒ aucune ligne : la bibliothèque
 * reste celle d'avant, jamais une vignette qui répondrait 404.
 *
 * Marque : comme `listAssets` · la marque active si elle est posée (et
 * visible), sinon toutes les marques visibles de l'espace. Une sortie Studios
 * a toujours une marque : elle n'est jamais « commune ».
 *
 * La sélection (`verdictSortieLivree`) vit dans le noyau. Chaque ligne revenue
 * de la base est revérifiée par `objetDansPortee` (deux gardes valent mieux
 * qu'une). La clé de stockage ne quitte pas ce module.
 */
export async function listerSortiesStudiosBibliotheque(limite: number = LIMITE_BIBLIOTHEQUE): Promise<ElementStudioBibliotheque[]> {
  if (!db) return [];
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return [];
  const ctx = g.ctx;
  const active = await getActiveBrand(ctx.workspaceId);
  const marques = active ? ctx.marques.filter((m) => m === active.id) : ctx.marques;
  if (marques.length === 0) return [];

  const S = schema.studioAssets;
  const lignes = await db.select({
    id: S.id, workspaceId: S.workspaceId, brandId: S.brandId, projectId: S.projectId,
    origin: S.origin, mime: S.mime, storageState: S.storageState, createdAt: S.createdAt,
    simule: sql<boolean>`(coalesce(${S.rights}->>'simule', '') = 'true' or ${S.storageKey} like 'simule/%')`,
  }).from(S).where(and(
    eq(S.workspaceId, ctx.workspaceId), inArray(S.brandId, marques),
    eq(S.storageState, 'stored'), inArray(S.origin, ORIGINES_SORTIE_STUDIO as Array<'generated' | 'render'>),
  )).orderBy(desc(S.createdAt)).limit(Math.max(1, Math.min(Math.trunc(limite), LIMITE_BIBLIOTHEQUE)));

  const dansPortee = lignes.filter((l) => objetDansPortee(
    { workspaceId: ctx.workspaceId, marquesDuWorkspace: ctx.marquesDuWorkspace, restrictionsMarque: ctx.restrictionsMarque },
    l,
  ));
  const projets = [...new Set(dansPortee.map((l) => l.projectId).filter((p): p is string => !!p))];
  if (projets.length === 0) return [];

  const P = schema.studioProjects;
  const titres = new Map((await db.select({ id: P.id, title: P.title }).from(P)
    .where(and(eq(P.workspaceId, ctx.workspaceId), inArray(P.brandId, marques), inArray(P.id, projets)))).map((p) => [p.id, p.title]));
  const J = schema.studioJobs;
  const lots = lotsLivreurs(await db.select({ state: J.state, qualityStatus: J.qualityStatus, result: J.result }).from(J)
    .where(and(eq(J.workspaceId, ctx.workspaceId), inArray(J.brandId, marques), inArray(J.projectId, projets))));

  const out: ElementStudioBibliotheque[] = [];
  for (const l of dansPortee) {
    // Le projet doit être lisible dans la même portée · sinon pas de lien d'origine honnête.
    if (!l.projectId || !titres.has(l.projectId)) continue;
    const v = verdictSortieLivree({ ...l, lot: lots.get(l.id) ?? null });
    if (!v.livree) continue;
    out.push(elementStudioBibliotheque({ id: l.id, projectId: l.projectId, origin: l.origin, mime: l.mime, createdAt: l.createdAt }, titres.get(l.projectId)));
  }
  return out;
}

/** Une sortie livrée, sous la forme d'une ligne de la bibliothèque · lecture seule. */
export function sortieCommeAsset(e: ElementStudioBibliotheque): AssetItem {
  return {
    id: e.id, name: e.name, kind: e.kind, source: 'studios', url: e.url, thumbUrl: null,
    brandId: null, useForAi: false, sizeBytes: null, tags: [], createdAt: e.createdAt, isTemplate: false,
    studio: e.studio,
  };
}
