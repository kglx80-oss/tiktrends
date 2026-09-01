import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Une image de la bibliothèque, servie par son adresse.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Une image téléversée est rangée en base sous forme de `data:` URI · jusqu'à
 * six mégaoctets de base64 dans une colonne texte. Tant qu'elle y reste, ça va.
 * Le problème est qu'on la RENVOYAIT telle quelle : la liste des assets partait
 * dans la page, base64 compris, et vingt-quatre vignettes pesaient plus lourd
 * que tout le reste de l'application réunie.
 *
 * Une page qui transporte ses images à l'intérieur d'elle-même ne peut pas être
 * rapide, et aucun cache ne peut l'aider · le navigateur ne sait pas mettre en
 * cache un morceau de HTML.
 *
 * ── Ce que change une adresse ────────────────────────────────────────────────
 *
 * La page ne transporte plus qu'un lien de quarante caractères. Le navigateur
 * télécharge les vignettes en parallèle, **après** l'affichage, en garde une
 * copie, et ne les redemande plus. C'est exactement ce que fait n'importe quelle
 * balise `<img>` depuis toujours · on l'avait contourné sans le vouloir.
 *
 * L'accès reste vérifié : l'image appartient à l'espace de la session, sinon
 * 404. Le cookie suffit, comme pour le proxy Drive à côté.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return new Response('unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const [a] = await db.select({ url: schema.assets.url, mime: schema.assets.mimeType })
    .from(schema.assets)
    .where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId)))
    .limit(1);
  if (!a) return new Response('not found', { status: 404 });

  // Déjà hébergée ailleurs · on redirige plutôt que de faire transiter les
  // octets par nous, ce qui ne servirait qu'à ajouter un saut.
  if (!a.url.startsWith('data:')) return Response.redirect(a.url, 302);

  const virgule = a.url.indexOf(',');
  const entete = a.url.slice(5, virgule);
  if (virgule < 0 || !entete.endsWith(';base64')) return new Response('unsupported', { status: 415 });

  const octets = Buffer.from(a.url.slice(virgule + 1), 'base64');
  return new Response(new Uint8Array(octets), {
    headers: {
      'content-type': a.mime || entete.replace(';base64', '') || 'image/jpeg',
      // Le contenu d'un asset ne change jamais · un téléversement crée une
      // nouvelle ligne, il ne réécrit pas l'ancienne. Le navigateur peut donc
      // la garder longtemps sans jamais revenir demander si elle a bougé.
      'cache-control': 'private, max-age=2592000, immutable',
    },
  });
}
