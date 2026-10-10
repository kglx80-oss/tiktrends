import { gardeSources } from '../../../../../../../../lib/studios/sources/acces';
import { fichierAServirPour } from '../../../../../../../../lib/studios/produit/vue';
import { octetsDataUri } from '../../../../../../../../lib/studios/produit/catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aperçu d'une photo produit ou d'un logo du catalogue d'un projet · la page
 * ne transporte qu'une adresse courte, jamais la data URI (même raison que
 * `/api/asset/[id]`). Garde studio relue, projet dans la portée, fichier du
 * catalogue de la marque DU PROJET ; sinon 404 neutre.
 *
 * Une photo distante n'est pas téléchargée par le serveur : redirection vers
 * son adresse publique (https seulement), comme les écrans existants.
 */
const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const g = await gardeSources('studio.read');
  if (!g.ok) return new Response('introuvable', { status: 404 });
  const { id, assetId } = await ctx.params;
  const f = await fichierAServirPour(g.ctx, id, assetId, { veilleOuverte: g.veilleOuverte, maintenant: new Date() });
  if (!f.ok) return new Response('introuvable', { status: 404 });
  const d = octetsDataUri(f.url);
  if (d) {
    if (!TYPES_IMAGE.has(d.mime)) return new Response('introuvable', { status: 404 });
    return new Response(new Uint8Array(d.octets), {
      status: 200,
      headers: { 'content-type': d.mime === 'image/jpg' ? 'image/jpeg' : d.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
    });
  }
  if (!/^https:\/\//i.test(f.url)) return new Response('introuvable', { status: 404 });
  return Response.redirect(f.url, 302);
}
