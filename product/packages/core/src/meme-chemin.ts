/**
 * Un lien vers le MÊME chemin avec une autre recherche (recette #106b).
 *
 * ── Le défaut mesuré ─────────────────────────────────────────────────────────
 *
 * Depuis `/veille?q=zzzzzzzz`, cliquer « Veille » dans le rail (`/veille`)
 * envoyait la requête de page (200, charge complète), mais l'URL et l'écran ne
 * changeaient pas. Mesuré au navigateur sur main (Next 15.5) · tête du rail
 * « Veille » 4 échecs sur 4, `router.push('/veille')` 4 sur 4, sous-lien
 * « Ce qui scale » depuis `/veille/scale?q=cafe` 2 sur 4, tête « Adsmap »
 * depuis `/adsmap?vue=table` environ une fois sur deux · alors qu'un lien vers
 * un AUTRE chemin (fil d'Ariane `/assets?ok=drive` → `/assets`) passe 4 sur 4.
 * La transition du routeur client ne se termine pas · aucune exception.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Une entrée de navigation vers le chemin courant, recherche différente, est
 * une REMISE À ZÉRO de l'écran · on la confie au navigateur (chargement
 * complet) plutôt qu'au routeur client. Une simple ancre (même chemin, même
 * recherche) reste au routeur. Une autre origine n'est pas concernée.
 */
export function chargementCompletRequis(courant: { origin: string; pathname: string; search: string }, cible: { origin: string; pathname: string; search: string }): boolean {
  if (courant.origin !== cible.origin) return false;
  if (courant.pathname !== cible.pathname) return false;
  return courant.search !== cible.search;
}
