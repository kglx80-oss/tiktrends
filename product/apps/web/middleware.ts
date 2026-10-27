import { NextResponse, type NextRequest } from 'next/server';
// Import direct des modules, pas du point d'entrée du noyau · le paquet Edge du
// middleware ne tire que ces règles et leurs dépendances (le point d'entrée
// tirerait tout le noyau, `ajv` compris).
import { redirectionServeur } from '@tiktrends/core/src/redirections-serveur';
import { ENTETE_SECTION, UI_COOKIE, ecranSpatial, uiDemandee, uiDepuisCookie } from '@tiktrends/core/src/spatial/bascule';

/**
 * 1 · `?ui=spatial` / `?ui=v5` · pose le cookie `tt_ui` et revient à la même
 *     adresse sans le paramètre (307). Aucune autre valeur n'est prise.
 *
 * 2 · Adresses retirées · servies en vraie 307 HTTP, AVANT tout rendu.
 *     Une page sous `(app)` qui appelle `redirect()` sort en `200` (la
 *     coquille et son `loading.tsx` ont déjà commencé à diffuser) · au
 *     navigateur, React lève l'erreur #310 le temps que la redirection client
 *     aboutisse. La cible est décidée par la règle pure (`redirectionServeur`).
 *
 * 3 · Interface Spatial (mandat Kevin du 27/10) · quand `tt_ui=spatial`, un
 *     écran PORTÉ (`ecranSpatial`, noyau) est réécrit vers l'arbre
 *     `app/(spatial)/sp` · l'adresse du navigateur ne change pas. La section
 *     d'accent part dans l'en-tête `x-tt-section` (lue par le layout racine).
 *     Un écran non porté passe inchangé · l'ancienne interface le sert.
 *
 * Session · le middleware n'en lit aucune. Un visiteur non connecté suit la
 * 307 ou la réécriture, puis la coquille le renvoie à `/login`, comme avant.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname, searchParams } = request.nextUrl;

  const demande = uiDemandee(searchParams.get('ui'));
  if (demande) {
    const u = request.nextUrl.clone();
    u.searchParams.delete('ui');
    const r = NextResponse.redirect(u, 307);
    r.cookies.set(UI_COOKIE, demande, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    return r;
  }

  const cible = redirectionServeur(pathname, searchParams);
  if (cible) return NextResponse.redirect(new URL(cible, request.url), 307);

  if (uiDepuisCookie(request.cookies.get(UI_COOKIE)?.value) === 'spatial') {
    const e = ecranSpatial(pathname);
    if (e) {
      const u = request.nextUrl.clone();
      u.pathname = e.interne;
      const h = new Headers(request.headers);
      h.set(ENTETE_SECTION, e.section);
      return NextResponse.rewrite(u, { request: { headers: h } });
    }
  }
  return NextResponse.next();
}

export const config = {
  // Toutes les pages · jamais l'API, les ressources Next ni les fichiers statiques.
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
