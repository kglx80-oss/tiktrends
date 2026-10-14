import type { NextRequest } from 'next/server';
import { db, schema, eq, and } from '@tiktrends/db';
import { googleAccessToken, driveDownload } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';
import { refusMedia, servirMedia, redirectionMedia } from '../../../../lib/media-reponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Proxy d'affichage pour une image Drive privée : on la sert depuis Drive avec le
 * token de l'espace (le navigateur est authentifié par le cookie de session).
 * Si l'asset est déjà hébergé (bucket), on redirige vers son URL publique.
 *
 * Lot 4b · requêtes partielles (`servirPlage`, noyau) : `Accept-Ranges: bytes`
 * partout, `206` + `Content-Range` sur une plage valide, `416` sinon · un
 * fichier Drive vidéo servi ici se lit aussi sur Safari et l'iPhone.
 *
 * Sécurité : type relu dans les octets (`decisionMediaServi`, noyau), liste
 * fermée, en-têtes fermés (`nosniff`, CSP en bac à sable) sur toute réponse.
 * Le type stocké venait de la déclaration du navigateur à la synchro : un
 * `text/html` annoncé était servi tel quel sur l'origine de l'application.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return refusMedia(401);
  const { id } = await ctx.params;

  const [a] = await db.select({ ext: schema.assets.externalId, url: schema.assets.url, brandId: schema.assets.brandId })
    .from(schema.assets).where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
  if (!a) return refusMedia(404);

  // Déjà hébergé ailleurs (bucket public) : simple redirection, http(s) seulement
  // (un `data:` URI n'est pas une adresse · il se sert par `/api/asset`).
  if (a.url && !/drive\.google\.com|googleusercontent\.com/.test(a.url)) return redirectionMedia(a.url);
  if (!a.ext) return refusMedia(404);

  // Le jeton Drive est stocké sur la marque, pas sur l'espace.
  const rt = await driveRefreshTokenFor(s.workspaceId, a.brandId);
  if (!rt) return refusMedia(404);

  let bytes: Buffer;
  try {
    const token = await googleAccessToken(rt);
    bytes = await driveDownload(token, a.ext);
  } catch {
    return refusMedia(502);
  }
  // Type RELU dans les octets (liste fermée) · jamais celui que Drive ou le
  // navigateur ont déclaré à la synchro. Hors liste ⇒ 404 neutre.
  return servirMedia(req, bytes, id, 'private, max-age=3600');
}
