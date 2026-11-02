import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { mediaAdDemande, sourceMediaAd } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { adsmapGuard } from '../../../../../lib/adsmap-guard';
import { adsDeLaMarque } from '../../../../../lib/adsmap-marque';
import { jointureCreaDeLaMarque } from '../../../../../lib/adsmap-medias';
import { cleObjetStockage } from '../../../../../lib/brand-media-url';
import { refusMedia, servirAdresseDirecte } from '../../../../../lib/media-reponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un média d'une ad Adsmap rangé au stockage PRIVÉ, servi par l'identifiant de
 * l'ad · l'adresse que reçoit le navigateur (`routeApercuAdAdsmap`, noyau) est
 * stable, sans clé ni signature. `?media=` choisit lequel (`mediaAdDemande`) ·
 * absent, le « Lien de l'Ad » (`ads.asset_url`) ; `vignette`, la vignette de
 * l'ad (miniature puis fichier de sa créa, puis son lien · `vignetteSourceAd`,
 * la MÊME règle que les écrans) ; `brief`, le « Lien du Brief créa »
 * (`ads.brief_url`). Toute autre valeur · 404.
 *
 * Aucune route existante ne convenait · `/api/brands/[id]/media` ne sert que le
 * catalogue de la marque (logos, photos produit) sous la règle de lecture de la
 * Bibliothèque ; `/api/asset/[id]` la Bibliothèque ; `/api/ad/[id]` les pubs
 * composées. Une ad, sa créa et son brief se lisent sous la garde d'Adsmap.
 *
 * À chaque requête · session (401), garde Adsmap (offre, rôle, marque active),
 * l'ad doit remonter à la marque active par son graphe (`adsDeLaMarque`,
 * même portée que `listAdsAction`), sa créa doit être celle de la marque
 * active, et l'adresse retenue doit être un objet du stockage de l'espace ·
 * alors `302` vers une adresse signée éphémère (`servirAdresseDirecte`, ≤ 300 s,
 * clé sous `assets/<espace>/`). Tout le reste · 404 neutre, sans indice. Un lien
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
  const media = mediaAdDemande(new URL(req.url).searchParams.get('media'));
  if (!media) return refusMedia(404);
  if (!(await adsDeLaMarque(g.s.workspaceId, g.brand.id, [id])).has(id)) return refusMedia(404);
  const [ad] = await db.select({ lien: schema.ads.assetUrl, brief: schema.ads.briefUrl, miniature: schema.creatives.thumbUrl, fichier: schema.creatives.storageUrl })
    .from(schema.ads)
    .leftJoin(schema.creatives, jointureCreaDeLaMarque(g.brand.id))
    .where(and(eq(schema.ads.id, id), eq(schema.ads.workspaceId, g.s.workspaceId))).limit(1);
  const source = ad ? sourceMediaAd(media, ad) : null;
  if (!source || cleObjetStockage(source) === null) return refusMedia(404);
  return servirAdresseDirecte(req, source, { id, workspaceId: g.s.workspaceId });
}
