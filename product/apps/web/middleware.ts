import { NextResponse, type NextRequest } from 'next/server';
// Import direct du module, pas du point d'entrée du noyau · le paquet Edge du
// middleware ne tire que cette règle et ses dépendances (le point d'entrée
// tirerait tout le noyau, `ajv` compris).
import { redirectionServeur } from '@tiktrends/core/src/redirections-serveur';

/**
 * Adresses retirées · servies en vraie 307 HTTP, AVANT tout rendu.
 *
 * Une page sous `(app)` qui appelle `redirect()` sort en `200` (la coquille et
 * son `loading.tsx` ont déjà commencé à diffuser) · au navigateur, React lève
 * l'erreur #310 le temps que la redirection client aboutisse. Ici, la cible
 * est décidée par la règle pure (`redirectionServeur`, noyau) sur le seul
 * chemin et ses paramètres · contexte repris (annonce, angle, test Adsmap,
 * retour Veille), rien n'est créé, rien n'est écrit.
 *
 * Session · le middleware n'en lit aucune. Un visiteur non connecté suit la
 * 307, puis la coquille de la cible le renvoie à `/login`, comme avant.
 *
 * Chemin non concerné · la requête passe inchangée. Le `matcher` doit couvrir
 * exactement `CHEMINS_REDIRIGES_SERVEUR` (test `middleware-redirections`).
 */
export function middleware(request: NextRequest): NextResponse {
  const cible = redirectionServeur(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (!cible) return NextResponse.next();
  return NextResponse.redirect(new URL(cible, request.url), 307);
}

export const config = {
  // Littéraux exigés par Next (analyse statique) · tenus égaux à la règle par test.
  matcher: ['/studio', '/studio/ads', '/studio/image', '/studio/video', '/studio/textes', '/adsmap/jarvis'],
};
