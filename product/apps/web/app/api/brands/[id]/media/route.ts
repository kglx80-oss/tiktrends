import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../../lib/auth';
import { refusMedia, servirAdresseDirecte } from '../../../../../lib/media-reponse';
import { refusLectureBibliotheque } from '../../../../../lib/bibliotheque-acces';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** URL stable d'aperçu ; adresse relue dans le catalogue de la marque, jamais une signature persistée. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return refusMedia(401);
  if (refusLectureBibliotheque(s)) return refusMedia();
  const { id } = await ctx.params;
  const url = new URL(req.url).searchParams.get('url');
  if (!url || url.length > 8192) return refusMedia();
  const [brand] = await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos })
    .from(schema.brands).where(and(eq(schema.brands.id, id), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!brand) return refusMedia();
  let autorise = [brand.logoUrl, ...(brand.logos ?? [])].includes(url);
  if (!autorise) {
    const products = await db.select({ imageUrl: schema.products.imageUrl, imageUrls: schema.products.imageUrls })
      .from(schema.products).where(eq(schema.products.brandId, id));
    autorise = products.some(p => [p.imageUrl, ...(p.imageUrls ?? [])].includes(url));
  }
  if (!autorise) return refusMedia();
  return servirAdresseDirecte(req, url, { id, workspaceId: s.workspaceId });
}
