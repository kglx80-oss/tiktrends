/**
 * Les liens sortants d'une créa/marque de veille · vers la source, pas une
 * impasse.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * Depuis la Veille on voit une créa, mais on ne pouvait ni ouvrir la
 * bibliothèque publicitaire de la marque, ni son site. On sortait de l'outil
 * pour retrouver ça à la main. Ici, deux liens calculés à partir de ce qu'on a.
 */

/**
 * La bibliothèque publicitaire Meta d'un annonceur · recherche par NOM.
 *
 * On ne fait pas de lien profond par identifiant de page · l'id renvoyé par la
 * source n'est pas garanti d'être l'id de page Facebook, et un lien profond
 * faux ouvre une page vide. La recherche par nom, elle, atterrit toujours sur
 * les annonces de la marque. Réservé à Meta · les autres plateformes n'ont pas
 * cette bibliothèque au même endroit, on renvoie `null`.
 */
export function bibliothequeMeta(o: { platform?: string | null; name?: string | null }): string | null {
  if (o.platform && o.platform !== 'meta') return null;
  const name = o.name?.trim();
  if (!name) return null;
  const q = new URLSearchParams({
    active_status: 'all', ad_type: 'all', country: 'ALL',
    media_type: 'all', search_type: 'keyword_unordered', q: name,
  });
  return 'https://www.facebook.com/ads/library/?' + q.toString();
}

/** Le site de la marque · à partir du domaine d'atterrissage, sinon de l'URL. */
export function siteMarque(o: { landingDomain?: string | null; landingUrl?: string | null }): string | null {
  const dom = o.landingDomain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
  if (dom) return 'https://' + dom;
  if (o.landingUrl) { try { return new URL(o.landingUrl).origin; } catch { return null; } }
  return null;
}
