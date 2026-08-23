'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const backOf = (fd: FormData, fallback: string) => norm(fd.get('back')) || fallback;

/* ----------------------------- Sauvegardes ------------------------------- */
export async function saveAdAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const platform = norm(formData.get('platform'));
  const externalId = norm(formData.get('externalId'));
  const back = backOf(formData, '/inspo');
  if (!platform || !externalId) redirect(back);

  let snapshot: unknown = {};
  try { snapshot = JSON.parse(norm(formData.get('snapshot')) || '{}'); } catch { snapshot = {}; }

  await db.insert(schema.savedAds)
    .values({ workspaceId: s.workspaceId, userId: s.user.id, platform, externalId, snapshot })
    .onConflictDoNothing();
  redirect(back);
}

export async function unsaveAdAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const platform = norm(formData.get('platform'));
  const externalId = norm(formData.get('externalId'));
  const back = backOf(formData, '/saved');
  await db.delete(schema.savedAds).where(and(
    eq(schema.savedAds.workspaceId, s.workspaceId),
    eq(schema.savedAds.platform, platform),
    eq(schema.savedAds.externalId, externalId),
  ));
  redirect(back);
}

/* ----------------------------- Suivi marque ------------------------------ */
export async function followBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const platform = norm(formData.get('platform'));
  const name = norm(formData.get('name'));
  const back = backOf(formData, '/inspo');
  if (!platform || !name) redirect(back);

  await db.insert(schema.followedBrands)
    .values({ workspaceId: s.workspaceId, platform, name, externalId: norm(formData.get('externalId')) || null, logoUrl: norm(formData.get('logoUrl')) || null })
    .onConflictDoNothing();
  redirect(back);
}

export async function unfollowBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const platform = norm(formData.get('platform'));
  const name = norm(formData.get('name'));
  const back = backOf(formData, '/saved');
  await db.delete(schema.followedBrands).where(and(
    eq(schema.followedBrands.workspaceId, s.workspaceId),
    eq(schema.followedBrands.platform, platform),
    eq(schema.followedBrands.name, name),
  ));
  redirect(back);
}
