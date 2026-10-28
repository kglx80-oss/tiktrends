import { NextResponse, type NextRequest } from 'next/server';
// Import direct des modules, pas du point d'entrée du noyau · le paquet Edge du
// middleware ne tire que ces règles et leurs dépendances (le point d'entrée
// tirerait tout le noyau, `ajv` compris).
import { redirectionServeur } from '@tiktrends/core/src/redirections-serveur';
import { ENTETE_CHEMIN, ENTETE_SECTION, ecranSpatial } from '@tiktrends/core/src/spatial/bascule';

/**
 * 1 · Adresses retirées · servies en vraie 307 HTTP, AVANT tout rendu. La
 *     cible est décidée par la règle pure (`redirectionServeur`) · les cinq
 *     anciennes adresses de création (`/studio`, `/studio/ads`, `/studio/image`,
 *     `/studio/video`, `/studio/textes`) et `/adsmap/jarvis`. Leurs pages
 *     `redirect()` (`app/studio/…`, hors coquille) restent en filet.
 *
 * 2 · Interface Spatial (mandat Kevin du 27/10) · un écran PORTÉ
 *     (`ecranSpatial`, noyau) est réécrit vers l'arbre `app/(spatial)/sp` ·
 *     l'adresse du navigateur ne change pas. La section d'accent part dans
 *     l'en-tête `x-tt-section` (lue par le layout racine). L'ancienne interface
 *     (V5) est retirée · plus de cookie `tt_ui` ni de `?ui=` · un chemin non
 *     porté passe inchangé (page publique, route, ou 404 normale).
 *
 * Session · le middleware n'en lit aucune. Un visiteur non connecté suit la
 * 307 ou la réécriture, puis la coquille Spatial le renvoie à `/login`.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  const cible = redirectionServeur(pathname, searchParams);
  if (cible) return NextResponse.redirect(new URL(cible, request.url), 307);

  const e = ecranSpatial(pathname);
  if (e) {
    const u = request.nextUrl.clone();
    u.pathname = e.interne;
    const h = new Headers(request.headers);
    h.set(ENTETE_SECTION, e.section);
    h.set(ENTETE_CHEMIN, pathname);
    return NextResponse.rewrite(u, { request: { headers: h } });
  }
  return NextResponse.next();
}

export const config = {
  // Toutes les pages · jamais l'API, les ressources Next ni les fichiers statiques.
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
