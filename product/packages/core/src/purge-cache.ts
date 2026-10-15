/**
 * Purge du cache navigateur, une fois par navigateur · la règle, pure.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Avant #798, `/api/asset/<id>` servait un SVG importé avec son type déclaré
 * (`image/svg+xml`) et `cache-control: private, max-age=2592000, immutable`.
 * Un SVG piégé déjà ouvert reste donc dans le cache du navigateur, à la même
 * adresse, jusqu'à trente jours : un lien vers `/api/asset/<id>` le rejoue
 * depuis le cache, sans jamais revenir au serveur corrigé.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * 1. L'adresse servie change (`/api/asset/<id>?v=2`, `VERSION_CACHE_MEDIAS`) ·
 *    les pages ne pointent plus vers l'entrée en cache.
 * 2. Le cache est vidé UNE fois par navigateur : sur une réponse HTML d'une
 *    session ouverte (cookie `tt_session`) dont le cookie `tt_cache_v` n'est
 *    pas exactement la version courante (absent, ancien, autre), on pose
 *    `Clear-Site-Data: "cache"` et le cookie `tt_cache_v=2` pour un an. La
 *    réponse suivante porte le cookie · plus de purge.
 *
 * La règle est appliquée par `next.config.mjs` (`headers()`, conditions
 * `has`/`missing`), recopiée en littéraux · un test l'évalue avec le moteur de
 * conditions de Next et la tient égale à `regleEnTetesPurgeCache()`.
 */

export const VERSION_CACHE_MEDIAS = 2;
export const COOKIE_VERSION_CACHE = 'tt_cache_v';
export const COOKIE_SESSION = 'tt_session';
const UN_AN = 365 * 24 * 3600;

export interface RequetePurge {
  /** Valeur du cookie `tt_cache_v`, absent ⇒ `null`. */
  cookieVersion: string | null | undefined;
  /** Cookie de session présent. */
  session: boolean;
  /** En-tête `Accept` de la requête. */
  accepte: string | null | undefined;
}

/** Faut-il purger le cache sur CETTE réponse ? */
export function purgeCacheAFaire(r: RequetePurge): boolean {
  if (!r.session) return false;
  if (!/text\/html/.test(r.accepte || '')) return false;
  return r.cookieVersion !== String(VERSION_CACHE_MEDIAS);
}

/** Les deux en-têtes posés quand la purge est due. */
export function entetesPurgeCache(): Array<{ key: string; value: string }> {
  return [
    { key: 'Clear-Site-Data', value: '"cache"' },
    { key: 'Set-Cookie', value: `${COOKIE_VERSION_CACHE}=${VERSION_CACHE_MEDIAS}; Max-Age=${UN_AN}; Path=/; SameSite=Lax` },
  ];
}

/** La règle `headers()` de Next qui applique `purgeCacheAFaire`. */
export function regleEnTetesPurgeCache() {
  return {
    source: '/:path*',
    has: [
      { type: 'cookie' as const, key: COOKIE_SESSION },
      { type: 'header' as const, key: 'accept', value: '.*text/html.*' },
    ],
    missing: [{ type: 'cookie' as const, key: COOKIE_VERSION_CACHE, value: String(VERSION_CACHE_MEDIAS) }],
    headers: entetesPurgeCache(),
  };
}
