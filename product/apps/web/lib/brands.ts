import 'server-only';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

export const BRAND_COOKIE = 'tt_brand';

export interface BrandLite { id: string; name: string; logoUrl?: string | null }

export async function listBrands(workspaceId: string): Promise<BrandLite[]> {
  if (!db) return [];
  return db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl })
    .from(schema.brands).where(eq(schema.brands.workspaceId, workspaceId));
}

/** Marque active (cookie), validée dans le workspace. null = « Toutes les marques ». */
export async function getActiveBrand(workspaceId: string): Promise<BrandLite | null> {
  if (!db) return null;
  const c = await cookies();
  const id = c.get(BRAND_COOKIE)?.value;
  if (!id) return null;
  const [b] = await db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl })
    .from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, workspaceId))).limit(1);
  return b ?? null;
}
