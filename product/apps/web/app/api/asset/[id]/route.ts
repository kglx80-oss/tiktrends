import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { googleAccessToken, driveDownload } from '@tiktrends/integrations';
import { getSession } from '../../../../lib/auth';
import { driveRefreshTokenFor } from '../../../../lib/drive-token';
import { assetServing } from '../../../../lib/asset-url';
import { octetsDataUri } from '../../../../lib/import-image';
import { refusMedia, servirMedia, servirAdresseDirecte } from '../../../../lib/media-reponse';
import { refusLectureBibliotheque } from '../../../../lib/bibliotheque-acces';

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
 *
 * ── Lot 4b · requêtes partielles ─────────────────────────────────────────────
 *
 * Une vidéo de la bibliothèque (Drive) se lit dans une `<video>` · Safari et
 * l'iPhone exigent `206`. Les octets servis par nous (embarqués, Drive) passent
 * par `servirPlage` (noyau) : `Accept-Ranges: bytes` partout, `206` +
 * `Content-Range` sur une plage valide, `416` sinon. Une adresse `direct` est
 * redirigée · c'est l'hébergeur qui sert les plages.
 *
 * ── Sécurité · type relu, en-têtes fermés ────────────────────────────────────
 *
 * Cette route sert sur l'ORIGINE de l'application. Elle servait le type stocké
 * (`mime_type`, préfixe du `data:` URI, déclaration de Drive ou du navigateur),
 * sans `nosniff` ni CSP : un SVG importé, ouvert par « ouvrir ↗ », exécutait
 * son script avec la session de qui cliquait. Désormais (`decisionMediaServi`,
 * noyau) le type se relit dans les OCTETS et appartient à une liste fermée de
 * types non exécutables ; hors liste (SVG ancien compris) ⇒ TÉLÉCHARGEMENT seul,
 * `application/octet-stream` en pièce jointe (aucun média ne disparaît) ; le
 * 404 neutre reste pour l'asset inconnu ou d'un autre espace. Toute
 * réponse, refus et redirection compris, porte `ENTETES_MEDIA_FERMES`
 * (`nosniff`, CSP `default-src 'none'; sandbox`).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db) return refusMedia(401);
  // Règle de LECTURE de la Bibliothèque (rôle Membre, sans offre · un espace
  // Starter garde ses médias). Refus neutre, identique à un asset inconnu.
  if (refusLectureBibliotheque(s)) return refusMedia(404);
  const { id } = await ctx.params;

  const [a] = await db.select({
    url: schema.assets.url, name: schema.assets.name, kind: schema.assets.kind,
    source: schema.assets.source, externalId: schema.assets.externalId, brandId: schema.assets.brandId,
  })
    .from(schema.assets)
    .where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId)))
    .limit(1);
  if (!a) return refusMedia(404);

  const mode = assetServing({
    id, kind: a.kind, source: a.source, url: a.url,
    embedded: /^data:/i.test(a.url), externalId: a.externalId,
  });

  switch (mode) {
    case 'embedded': {
      // Le préfixe du `data:` URI et la colonne `mime_type` sont des
      // DÉCLARATIONS · seuls les octets décident du type servi.
      const octets = octetsDataUri(a.url);
      if (!octets) return refusMedia(404);
      // Le contenu d'un asset ne change jamais · un téléversement crée une
      // nouvelle ligne, il ne réécrit pas l'ancienne. Le navigateur peut
      // donc la garder longtemps sans revenir demander si elle a bougé.
      return servirMedia(req, octets, { id, nom: a.name }, 'private, max-age=2592000, immutable');
    }

    case 'drive': {
      // Rediriger vers l'adresse Google renverrait une page de connexion · on
      // télécharge avec le jeton de l'espace et on sert les octets.
      const rt = await driveRefreshTokenFor(s.workspaceId, a.brandId);
      if (!rt) return refusMedia(404);
      let bytes: Buffer;
      try {
        const token = await googleAccessToken(rt);
        bytes = await driveDownload(token, a.externalId!);
      } catch {
        return refusMedia(502);
      }
      return servirMedia(req, bytes, { id, nom: a.name }, 'private, max-age=3600');
    }

    case 'direct':
      // Déjà hébergée ailleurs · on redirige plutôt que de faire transiter les
      // octets par nous, ce qui n'ajouterait qu'un saut.
      return servirAdresseDirecte(req, a.url, { id, nom: a.name });

    default: {
      // Exhaustivité vérifiée à la compilation · un quatrième mode de service
      // casse le build ici tant que cette route ne le traite pas.
      const jamais: never = mode;
      void jamais;
      return refusMedia(404);
    }
  }
}
