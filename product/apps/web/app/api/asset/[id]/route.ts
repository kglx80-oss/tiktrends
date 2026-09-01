import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { googleAccessToken, driveDownload } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';
import { assetServing } from '../../../../lib/asset-url';

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
 * 404. Le cookie suffit.
 *
 * ── Une seule porte, et elle ouvre vraiment ──────────────────────────────────
 *
 * Première version : cette route ne savait servir que les images embarquées et
 * rediriger les adresses publiques. Or `servedAssetUrl` lui envoyait AUSSI les
 * images Google Drive privées, qui vivaient jusque-là derrière `/api/drive-img`.
 * Elle les redirigeait donc vers une adresse Google qui exige une
 * authentification · le navigateur recevait une page de connexion à la place
 * d'une image, et la bibliothèque affichait des cadres vides.
 *
 * Deux entrées pour un même besoin, dont une seule savait ouvrir. Elle sait
 * maintenant les trois cas · c'est le rôle d'un proxy d'assets.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return new Response('unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const [a] = await db.select({
    url: schema.assets.url, mime: schema.assets.mimeType, kind: schema.assets.kind,
    source: schema.assets.source, externalId: schema.assets.externalId, brandId: schema.assets.brandId,
  })
    .from(schema.assets)
    .where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId)))
    .limit(1);
  if (!a) return new Response('not found', { status: 404 });

  const mode = assetServing({
    id, kind: a.kind, source: a.source, url: a.url,
    embedded: a.url.startsWith('data:'), externalId: a.externalId,
  });

  switch (mode) {
    case 'embedded': {
      const virgule = a.url.indexOf(',');
      if (virgule < 0) return new Response('unsupported', { status: 415 });
      const entete = a.url.slice(5, virgule);
      if (!entete.endsWith(';base64')) return new Response('unsupported', { status: 415 });

      const octets = Buffer.from(a.url.slice(virgule + 1), 'base64');
      return new Response(new Uint8Array(octets), {
        headers: {
          'content-type': a.mime || entete.replace(';base64', '') || 'image/jpeg',
          // Le contenu d'un asset ne change jamais · un téléversement crée une
          // nouvelle ligne, il ne réécrit pas l'ancienne. Le navigateur peut
          // donc la garder longtemps sans revenir demander si elle a bougé.
          'cache-control': 'private, max-age=2592000, immutable',
        },
      });
    }

    case 'drive': {
      // Rediriger vers l'adresse Google renverrait une page de connexion · on
      // télécharge avec le jeton de l'espace et on sert les octets.
      const rt = await driveRefreshTokenFor(s.workspaceId, a.brandId);
      if (!rt) return new Response('drive not connected', { status: 404 });
      try {
        const token = await googleAccessToken(rt);
        const bytes = await driveDownload(token, a.externalId!);
        return new Response(new Uint8Array(bytes), {
          headers: { 'content-type': a.mime || 'image/jpeg', 'cache-control': 'private, max-age=3600' },
        });
      } catch {
        return new Response('drive error', { status: 502 });
      }
    }

    case 'direct':
      // Déjà hébergée ailleurs · on redirige plutôt que de faire transiter les
      // octets par nous, ce qui n'ajouterait qu'un saut.
      return Response.redirect(a.url, 302);

    default: {
      // Exhaustivité vérifiée à la compilation · un quatrième mode de service
      // casse le build ici tant que cette route ne le traite pas.
      const jamais: never = mode;
      return new Response(`unsupported: ${String(jamais)}`, { status: 415 });
    }
  }
}
