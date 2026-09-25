/**
 * La préférence de repli du rail · lue AU RENDU, pas après.
 *
 * ── Ce qui clignotait ────────────────────────────────────────────────────────
 *
 * L'état `collapsed` partait à `false`, puis un `useEffect` lisait
 * `localStorage` APRÈS le montage et corrigeait. Résultat, pour qui préfère le
 * rail replié : à chaque chargement, le rail s'affiche déployé (184px), puis
 * saute à 64px une fois l'effet passé. Un `useEffect` ne peut pas tuer ce
 * flash · le serveur, lui, ne connaît pas `localStorage`, donc il rend toujours
 * la version déployée.
 *
 * ── Pourquoi un cookie, et pas la base ───────────────────────────────────────
 *
 * Le cookie voyage avec la requête · le composant serveur le lit et rend
 * DÉJÀ la bonne géométrie, donc le premier pixel est juste et rien ne saute.
 *
 * Et la persistance s'arrête au navigateur, à dessein. Replier le rail est un
 * choix d'ERGONOMIE lié à l'écran · un grand moniteur veut le rail déployé, un
 * portable étroit le veut replié. Synchroniser ce choix entre appareils via la
 * base imposerait la préférence de l'un à l'autre · ce serait un défaut, pas
 * une fonctionnalité. La bonne unité de persistance est donc l'appareil, ce
 * que le cookie fait exactement.
 */

/** Nom du cookie · court, sans donnée personnelle, lisible côté client. */
export const RAIL_COOKIE = 'tt_rail';

/** Le rail est-il replié ? · seule la valeur « 1 » vaut replié. Tout le reste
 * (absent, « 0 », vide, valeur inconnue) vaut déployé · le défaut sûr est le
 * rail visible. */
export function railCollapsedFromCookie(raw: string | undefined | null): boolean {
  return raw === '1';
}

/**
 * La chaîne à poser dans `document.cookie` au basculement (côté client).
 * `path=/` · le rail est partout ; `max-age` d'un an · la préférence survit à
 * la session ; `samesite=lax` · un cookie d'ergonomie n'a rien à faire dans
 * une requête tierce.
 */
export function railCookieString(collapsed: boolean): string {
  const UN_AN = 60 * 60 * 24 * 365;
  return `${RAIL_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${UN_AN}; samesite=lax`;
}
