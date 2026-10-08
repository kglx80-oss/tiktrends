import { gardeStudio } from '../../../../../lib/studios/garde';
import { telechargerExportPour } from '../../../../../lib/studios/export/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Studios · L7-A · téléchargement d'un export AUDITÉ, désigné par sa version,
 * son format et son empreinte (jamais par un nom de fichier).
 *
 * LECTURE PURE : aucune écriture métier (l'audit est écrit par la commande
 * explicite d'export, pas ici). La garde `studio.export` est relue à chaque
 * requête ; la version est relue dans la portée, re-rendue (rendu
 * déterministe) et doit redonner l'empreinte de l'export audité. Hors portée,
 * inconnu ou jamais exporté : 404 neutre.
 */

const ENTETES_COMMUNS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'cache-control': 'private, no-store',
  vary: 'Cookie',
};

function refus(status: number, code: string, message: string, traceId: string): Response {
  return new Response(JSON.stringify({ ok: false, code, message, traceId }), {
    status,
    headers: { ...ENTETES_COMMUNS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ versionId: string }> }): Promise<Response> {
  const g = await gardeStudio('studio.export');
  if (!g.ok) return refus(g.status, g.code, g.message, g.traceId);
  const { versionId } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const r = await telechargerExportPour(g.ctx, { versionId, format: q.get('format'), empreinte: q.get('empreinte') });
  if (!r.ok) return refus(r.status, r.code, r.message, r.traceId);
  const f = r.fichier;
  return new Response(new Uint8Array(f.octets), {
    status: 200,
    headers: {
      ...ENTETES_COMMUNS,
      'content-type': f.mime,
      'content-length': String(f.octets.length),
      'content-disposition': `attachment; filename="${f.nomFichier}"`,
      etag: `"${f.sha256}"`,
      'x-studio-version-id': f.version.id,
      'x-studio-sha256': f.sha256,
    },
  });
}
