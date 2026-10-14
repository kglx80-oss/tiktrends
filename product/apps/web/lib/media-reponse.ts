import { servirPlage, decisionMediaServi, ENTETES_MEDIA_FERMES } from '@tiktrends/core';

/**
 * Réponses des routes qui servent un média de la bibliothèque sur l'origine de
 * l'application (`/api/asset/[id]`, `/api/drive-img/[id]`).
 *
 * Toute réponse porte `ENTETES_MEDIA_FERMES` (`nosniff`, CSP fermée en bac à
 * sable) · refus, redirection et `416` compris. Les octets ne sortent qu'avec le
 * type RELU par le noyau (`decisionMediaServi`) ; hors liste ⇒ refus neutre,
 * même corps et même statut qu'un asset inconnu.
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
 * morceau ne peut pas échapper au contrôle.
 */
export function servirMedia(req: Request, octets: Uint8Array, nom: string, cacheControl: string): Response {
  const d = decisionMediaServi(octets, nom);
  if (!d.ok) return refusMedia(404);
  const p = servirPlage(octets, { range: req.headers.get('range'), ifRange: req.headers.get('if-range') });
  if (p.statut === 416) return new Response(null, { status: 416, headers: { ...ENTETES_MEDIA_FERMES, 'cache-control': 'no-store', ...p.entetes } });
  return new Response(p.corps ? new Uint8Array(p.corps) : null, {
    status: p.statut,
    headers: { ...d.entetes, 'cache-control': cacheControl, ...p.entetes },
  });
}

/** Redirection vers une adresse http(s) uniquement · en-têtes fermés posés. */
export function redirectionMedia(url: string): Response {
  let cible: URL;
  try { cible = new URL(url); } catch { return refusMedia(404); }
  if (cible.protocol !== 'https:' && cible.protocol !== 'http:') return refusMedia(404);
  return new Response(null, { status: 302, headers: { ...ENTETES_MEDIA_FERMES, location: cible.toString(), 'cache-control': 'private, no-store' } });
}
