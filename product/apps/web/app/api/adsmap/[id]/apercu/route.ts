import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../../lib/auth';
import { adsmapGuard } from '../../../../../lib/adsmap-guard';
import { adsDeLaMarque } from '../../../../../lib/adsmap-marque';
import { cleObjetStockage } from '../../../../../lib/brand-media-url';
import { refusMedia, servirAdresseDirecte } from '../../../../../lib/media-reponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Le média d'une ad Adsmap (« Lien de l'Ad » rangé au stockage PRIVÉ), servi
 * par l'identifiant de l'ad · l'adresse que reçoit le navigateur
 * (`routeApercuAdAdsmap`, noyau) est stable, sans clé ni signature.
 *
 * Aucune route existante ne convenait · `/api/brands/[id]/media` ne sert que le
 * catalogue de la marque (logos, photos produit) sous la règle de lecture de la
 * Bibliothèque ; `/api/asset/[id]` la Bibliothèque ; `/api/ad/[id]` les pubs
 * composées. Une ad se lit sous la garde d'Adsmap.
 *
 * À chaque requête · session (401), garde Adsmap (offre, rôle, marque active),
 * l'ad doit remonter à la marque active par son graphe (`adsDeLaMarque`,
 * même portée que `listAdsAction`), et son lien doit être un objet du stockage
 * de l'espace · alors `302` vers une adresse signée éphémère
 * (`servirAdresseDirecte`). Tout le reste · 404 neutre, sans indice. Un lien
 * externe n'est jamais relayé (aucun proxy ouvert vers une adresse saisie) ·
 * l'écran l'affiche tel quel.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return refusMedia(401);
  const g = await adsmapGuard();
  if ('error' in g) return refusMedia(404);
  const { id } = await ctx.params;
  if (!UUID.test(id)) return refusMedia(404);
  if (!(await adsDeLaMarque(g.s.workspaceId, g.brand.id, [id])).has(id)) return refusMedia(404);
  const [ad] = await db.select({ assetUrl: schema.ads.assetUrl }).from(schema.ads)
    .where(and(eq(schema.ads.id, id), eq(schema.ads.workspaceId, g.s.workspaceId))).limit(1);
  if (!ad?.assetUrl || cleObjetStockage(ad.assetUrl) === null) return refusMedia(404);
  return servirAdresseDirecte(req, ad.assetUrl, { id, workspaceId: g.s.workspaceId });
}
