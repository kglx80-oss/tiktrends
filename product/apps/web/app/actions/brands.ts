'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { BRAND_COOKIE } from '../../lib/brands';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

/** Sélection de la marque active (tout membre) — pose un cookie, sans redirection. */
export async function setActiveBrand(brandId: string): Promise<void> {
  const s = await getSession();
  if (!s) return;
  const c = await cookies();
  if (!brandId) { c.delete(BRAND_COOKIE); return; }
  if (db) {
    const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
      .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
    if (!b) return;
  }
  c.set(BRAND_COOKIE, brandId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
}

export async function createBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const name = norm(formData.get('name'));
  const url = norm(formData.get('url'));
  const industry = norm(formData.get('industry'));
  if (!name) redirect('/brands?e=name');
  const [b] = await db.insert(schema.brands).values({ workspaceId: s.workspaceId, name, url: url || null, industry: industry || null }).returning();
  // La marque créée devient active.
  if (b) { const c = await cookies(); c.set(BRAND_COOKIE, b.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 }); }
  redirect('/brands?ok=1');
}

export async function renameBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  const name = norm(formData.get('name'));
  if (id && name) await db.update(schema.brands).set({ name }).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
  redirect('/brands?ok=renamed');
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/brands?e=forbidden');
  const id = norm(formData.get('id'));
  if (id) await db.delete(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId)));
  redirect('/brands?ok=deleted');
}
