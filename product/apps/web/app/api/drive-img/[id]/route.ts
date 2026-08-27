import { NextResponse, type NextRequest } from 'next/server';
import { db, schema, eq, and } from '@tiktrends/db';
import { googleAccessToken, driveDownload } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy d'affichage pour une image Drive privée : on la sert depuis Drive avec le
 * token de l'espace (le navigateur est authentifié par le cookie de session).
 * Si l'asset est déjà hébergé (bucket), on redirige vers son URL publique.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return new NextResponse('unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const [a] = await db.select({ ext: schema.assets.externalId, mime: schema.assets.mimeType, url: schema.assets.url, brandId: schema.assets.brandId })
    .from(schema.assets).where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  if (!a) return new NextResponse('not found', { status: 404 });

  // Déjà hébergé ailleurs (bucket public) : simple redirection.
  if (a.url && !/drive\.google\.com|googleusercontent\.com/.test(a.url)) return NextResponse.redirect(a.url);
  if (!a.ext) return new NextResponse('not found', { status: 404 });

  // Le jeton Drive est stocké sur la marque, pas sur l'espace.
  const rt = await driveRefreshTokenFor(s.workspaceId, a.brandId);
  if (!rt) return new NextResponse('drive not connected', { status: 404 });

  try {
    const token = await googleAccessToken(rt);
    const bytes = await driveDownload(token, a.ext);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': a.mime || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return new NextResponse('drive error', { status: 502 });
  }
}
