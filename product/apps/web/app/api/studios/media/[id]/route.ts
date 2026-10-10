import { gardeStudio } from '../../../../../lib/studios/garde';
import { lireMediaDansPortee } from '../../../../../lib/studios/rendu/medias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Studios · L5-A · un média studio (`studio_assets`), servi par son identifiant.
 *
 * LECTURE PURE (garde `lecture-seule`) : aucune écriture, aucune URL signée
 * fabriquée ni stockée. La session est relue à chaque requête (`gardeStudio`
 * : espace, marques, restriction de marque), puis le média est lu dans cette
 * portée (`lireMediaDansPortee`). Hors portée, inconnu, non stocké, altéré ou
 * d'un type non servi : 404, corps identique, sans cible ni indice.
 *
 * Réponse : les OCTETS, avec le type MIME RÉEL relu dans le fichier, en cache
 * privé (jamais partagé entre personnes : `private`, `Vary: Cookie`), sans
 * interprétation possible par le navigateur (`nosniff`, CSP fermée, bac à sable).
 */

const ENTETES_COMMUNS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  vary: 'Cookie',
};

function refus(status: number, code: string, message: string, traceId: string): Response {
  return new Response(JSON.stringify({ ok: false, code, message, traceId }), {
    status,
    headers: { ...ENTETES_COMMUNS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return refus(g.status, g.code, g.message, g.traceId);
  const { id } = await ctx.params;
  const m = await lireMediaDansPortee(g.ctx, id);
  if (!m.ok) return refus(m.status, m.code, m.message, m.traceId);

  const etag = `"${m.asset.sha256}"`;
  const entetes: Record<string, string> = {
    ...ENTETES_COMMUNS,
    'cache-control': 'private, max-age=300',
    etag,
  };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: entetes });
  return new Response(new Uint8Array(m.octets), {
    status: 200,
    headers: {
      ...entetes,
      'content-type': m.mime,
      'content-length': String(m.octets.length),
      'content-disposition': `inline; filename="${m.asset.id}.${EXTENSIONS[m.mime] ?? 'bin'}"`,
    },
  });
}
