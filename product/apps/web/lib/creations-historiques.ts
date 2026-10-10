import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { elementCreationHistorique, SORTES_CREATION_HISTORIQUE, STATUT_CREATION_LIVREE, LIMITE_BIBLIOTHEQUE, type ElementCreationHistorique } from '@tiktrends/core';
import { getSession } from './auth';
import { roleAtLeast } from './rbac';
import { getActiveBrand } from './brands';
import type { AssetItem } from '../app/actions/assets';

/**
 * Les créations des anciens studios (Pubs IA, Image IA, Vidéo IA, Textes IA,
 * retirés le 10/10), pour la bibliothèque `/assets` · LECTURE SEULE.
 *
 * Portée : celle de la bibliothèque (`listAssets`) · l'espace de la session,
 * la marque active si elle est posée, sinon toutes les marques de l'espace.
 * `generations` n'a pas d'espace direct · il est relu par la marque. Aucune
 * écriture, aucun appel fournisseur ; la sélection vit dans le noyau
 * (`elementCreationHistorique`).
 */
export async function listerCreationsHistoriques(limite: number = LIMITE_BIBLIOTHEQUE): Promise<ElementCreationHistorique[]> {
  const s = await getSession();
  if (!s || !db || !roleAtLeast(s.role, 'member')) return [];
  const active = await getActiveBrand(s.workspaceId);
  const G = schema.generations;
  const B = schema.brands;
  const lignes = await db.select({ id: G.id, kind: G.kind, status: G.status, assetUrls: G.assetUrls, createdAt: G.createdAt })
    .from(G).innerJoin(B, eq(G.brandId, B.id))
    .where(and(
      eq(B.workspaceId, s.workspaceId),
      ...(active ? [eq(G.brandId, active.id)] : []),
      eq(G.status, STATUT_CREATION_LIVREE),
      inArray(G.kind, SORTES_CREATION_HISTORIQUE as unknown as Array<'ad' | 'image' | 'video' | 'script' | 'copy'>),
    ))
    .orderBy(desc(G.createdAt))
    .limit(Math.max(1, Math.min(Math.trunc(limite), LIMITE_BIBLIOTHEQUE)));
  return lignes.map(elementCreationHistorique).filter((e): e is ElementCreationHistorique => e !== null);
}

/** Une création historique, sous la forme d'une ligne de la bibliothèque · lecture seule. */
export function creationCommeAsset(e: ElementCreationHistorique): AssetItem {
  return {
    id: e.id, name: e.name, kind: e.kind, source: 'historique', url: e.url, thumbUrl: null,
    brandId: null, useForAi: false, sizeBytes: null, tags: [], createdAt: e.createdAt, isTemplate: false,
    historique: e.historique,
  };
}
