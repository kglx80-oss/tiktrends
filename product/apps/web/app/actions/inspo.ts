'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import type { InspoAd } from '@tiktrends/integrations';

/* Appels directs (depuis des boutons client via useTransition) · pas de redirection,
   donc pas de rechargement de page ni de nouvelle recherche Trendtrack. */

export async function saveAd(input: { platform: string; externalId: string; snapshot: InspoAd }): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  const brand = await getActiveBrand(s.workspaceId);
  await db.insert(schema.savedAds)
    .values({ workspaceId: s.workspaceId, userId: s.user.id, brandId: brand?.id ?? null, platform: input.platform, externalId: input.externalId, snapshot: input.snapshot })
    .onConflictDoNothing();
}

/** Range une créa sauvegardée dans un board/dossier (null = « Sans dossier »). */
export async function setSavedAdFolder(input: { platform: string; externalId: string; folder: string | null }): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  const folder = input.folder?.trim().slice(0, 60) || null;
  await db.update(schema.savedAds).set({ folder }).where(and(
    eq(schema.savedAds.workspaceId, s.workspaceId),
    eq(schema.savedAds.platform, input.platform),
    eq(schema.savedAds.externalId, input.externalId),
  ));
}

export async function unsaveAd(input: { platform: string; externalId: string }): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  await db.delete(schema.savedAds).where(and(
    eq(schema.savedAds.workspaceId, s.workspaceId),
    eq(schema.savedAds.platform, input.platform),
    eq(schema.savedAds.externalId, input.externalId),
  ));
}

export async function followBrand(input: { platform: string; name: string; externalId?: string; logoUrl?: string }): Promise<void> {
  const s = await getSession();
  if (!s || !db || !input.name) return;
  const brand = await getActiveBrand(s.workspaceId);
  await db.insert(schema.followedBrands)
    .values({ workspaceId: s.workspaceId, brandId: brand?.id ?? null, platform: input.platform, name: input.name, externalId: input.externalId || null, logoUrl: input.logoUrl || null })
    .onConflictDoNothing();
}

export async function unfollowBrand(input: { platform: string; name: string }): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  await db.delete(schema.followedBrands).where(and(
    eq(schema.followedBrands.workspaceId, s.workspaceId),
    eq(schema.followedBrands.platform, input.platform),
    eq(schema.followedBrands.name, input.name),
  ));
}
