import { servirPlage, decisionMediaServi, ENTETES_MEDIA_FERMES, adresseRedirigeable } from '@tiktrends/core';
import { storageFromEnv, privateObjectUrl, objectKeyFromUrl } from '@tiktrends/integrations';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

/**
 * Réponses des routes qui servent un média de la bibliothèque sur l'origine de
 * l'application (`/api/asset/[id]`, `/api/drive-img/[id]`).
 *
 * Toute réponse porte `ENTETES_MEDIA_FERMES` (`nosniff`, CSP fermée en bac à
 * sable) · refus, redirection et `416` compris. Les octets ne sortent qu'avec le
 * type RELU par le noyau (`decisionMediaServi`) ; hors liste ⇒ pièce jointe
 * `application/octet-stream`. Le 404 neutre est réservé à l'asset inconnu ou
 * d'un autre espace.
 */

/** Refus sans indice · statut et corps identiques, quelle qu'en soit la cause. */
export function refusMedia(status: 401 | 404 | 502 = 404): Response {
  const corps = status === 401 ? 'unauthorized' : status === 502 ? 'unavailable' : 'not found';
  return new Response(corps, {
    status,
    headers: { ...ENTETES_MEDIA_FERMES, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

/**
 * Sert des octets · type relu, plage décidée par le noyau (`servirPlage`).
 * La plage est découpée APRÈS la lecture du type sur le fichier entier : un
 * morceau ne peut pas échapper au contrôle. Hors liste (SVG ancien, TIFF…),
 * l'asset reste accessible en TÉLÉCHARGEMENT seul : `application/octet-stream`
 * en pièce jointe, jamais inline, jamais avec son type déclaré.
 */
export function servirMedia(req: Request, octets: Uint8Array, asset: { id: string; nom?: string | null }, cacheControl: string): Response {
  const d = decisionMediaServi(octets, asset);
  const p = servirPlage(octets, { range: req.headers.get('range'), ifRange: req.headers.get('if-range') });
  if (p.statut === 416) return new Response(null, { status: 416, headers: { ...ENTETES_MEDIA_FERMES, 'cache-control': 'no-store', ...p.entetes } });
  return new Response(p.corps ? new Uint8Array(p.corps) : null, {
    status: p.statut,
    headers: { ...d.entetes, 'cache-control': cacheControl, ...p.entetes },
  });
}

/** Taille maximale servie par le proxy pour une adresse externe (50 Mo). */
const MAX_OCTETS_PROXY = 50_000_000;

/**
 * Asset hébergé ailleurs (`direct`) · le bucket privé est signé après contrôle
 * de la clé dans l’espace autorisé ; Drive garde sa redirection. Toute autre adresse est servie par
 * le proxy : octets lus par `safeFetch` (adresse publique seulement,
 * redirections revalidées), type RELU, pièce jointe hors liste · jamais une
 * redirection ouverte vers un hôte choisi par qui a enregistré l'asset.
 */
export async function servirAdresseDirecte(req: Request, url: string, asset: { id: string; nom?: string | null; workspaceId: string }): Promise<Response> {
  const cfg = storageFromEnv();
  const interne = cfg && objectKeyFromUrl(cfg, url) !== null;
  const cible = interne ? privateObjectUrl(cfg!, url, asset.workspaceId) : adresseRedirigeable(url, []);
  if (interne && !cible) return refusMedia(404);
  if (cible) return new Response(null, { status: 302, headers: { ...ENTETES_MEDIA_FERMES, location: cible, 'cache-control': 'private, no-store' } });
  let u: URL;
  try { u = new URL(url); } catch { return refusMedia(404); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return refusMedia(404);
  const f = await safeFetch(u.toString(), { maxBytes: MAX_OCTETS_PROXY, timeoutMs: 20_000 });
  if (!f) return refusMedia(502);
  return servirMedia(req, f.body, asset, 'private, max-age=3600');
}
