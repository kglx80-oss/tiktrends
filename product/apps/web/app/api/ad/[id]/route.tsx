import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { renderAdPng, type AdRecipe } from '../../../../lib/ad-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ratios proposés -> dimensions de rendu (base 1080 de large).
const RATIO_SIZE: Record<string, { width: number; height: number }> = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

/** Rend la publicité composée (scène IA + couche design) en PNG, à la demande. Ratio via ?r=. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || !db) return new Response('Non autorisé', { status: 401 });
  const r = new URL(req.url).searchParams.get('r') || '';
  const size = RATIO_SIZE[r];

  const [g] = await db
    .select({ input: schema.generations.input, workspaceId: schema.brands.workspaceId, kind: schema.generations.kind })
    .from(schema.generations)
    .leftJoin(schema.brands, eq(schema.generations.brandId, schema.brands.id))
    .where(eq(schema.generations.id, id))
    .limit(1);

  if (!g || g.kind !== 'ad' || g.workspaceId !== s.workspaceId) return new Response('Introuvable', { status: 404 });
  const base = g.input as unknown as AdRecipe;
  if (!base?.sceneUrl) return new Response('Recette invalide', { status: 422 });
  const recipe: AdRecipe = size ? { ...base, width: size.width, height: size.height } : base;

  try {
    const png = await renderAdPng(recipe);
    return new Response(png, {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' },
    });
  } catch {
    // Repli : si la composition échoue, on affiche au moins la scène (sans la couche texte).
    if (recipe.sceneUrl) return Response.redirect(recipe.sceneUrl, 302);
    return new Response('Composition impossible', { status: 500 });
  }
}
