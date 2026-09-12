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
 * La bibliothèque publicitaire officielle d'un annonceur · recherche par NOM.
 *
 * ── Pourquoi par nom, et par plateforme ──────────────────────────────────────
 *
 * On ne fait pas de lien profond par identifiant · l'id renvoyé par la source
 * n'est pas garanti d'être l'id officiel de la plateforme, et un lien profond
 * faux ouvre une page vide. La recherche par nom, elle, atterrit toujours sur
 * les annonces de la marque (ou, au pire, sur la bibliothèque prête à chercher).
 *
 * Chaque plateforme a SA bibliothèque · Meta (Ad Library) et TikTok (Commercial
 * Content Library). Google n'expose pas de recherche par nom fiable dans son
 * Transparency Center (il indexe par identifiant d'annonceur) · plutôt qu'un
 * lien qui tomberait à côté, on renvoie `null` · pas de bouton vaut mieux qu'un
 * bouton mort.
 *
 * Renvoie l'URL ET le libellé · le libellé nomme la bonne plateforme à l'écran.
 */
export function bibliothequePub(o: { platform?: string | null; name?: string | null }): { url: string; label: string } | null {
  const name = o.name?.trim();
  if (!name) return null;
  const p = o.platform ?? 'meta';

  if (p === 'tiktok') {
    // TikTok Commercial Content Library · recherche par nom d'annonceur.
    const q = new URLSearchParams({ region: 'all', type: 'all', adv_name: name });
    return { url: 'https://library.tiktok.com/ads?' + q.toString(), label: 'Bibliothèque TikTok' };
  }
  if (p === 'google') return null;

  // Meta Ad Library · par défaut (plateforme absente = Meta).
  const q = new URLSearchParams({
    active_status: 'all', ad_type: 'all', country: 'ALL',
    media_type: 'all', search_type: 'keyword_unordered', q: name,
  });
  return { url: 'https://www.facebook.com/ads/library/?' + q.toString(), label: 'Bibliothèque Meta' };
}

/**
 * Nettoie un nom de marque pour une recherche dans la bibliothèque publicitaire.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * On saisit un concurrent avec une note de désambiguïsation · « Feel (compléments
 * France) », « Nova — DE », « Bloom™ ». La source cherche la chaîne LITTÉRALE :
 * le qualificatif entre parenthèses ne correspond à aucune page, et la recherche
 * revient vide. L'utilisateur en conclut que « l'analyse ne marche pas », alors
 * que c'est le terme qui ne matche pas.
 *
 * On retire donc ce qui est une annotation, pas un nom : parenthèses/crochets et
 * leur contenu, symboles de marque, séparateurs de queue. On ne touche PAS au
 * cœur du nom · sur-nettoyer transformerait « Dr. Martens » en « Dr », ce qui
 * matcherait pire, pas mieux.
 */
export function nettoieNomConcurrent(name: string): string {
  return (name || '')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')   // (compléments France), [FR], {test}
    .replace(/[™®©]/g, ' ')                  // Bloom™ → Bloom
    .replace(/\s*[·—–-]\s*[A-Za-zÀ-ÿ]{2,3}\s*$/u, ' ') // « Nova — DE » en queue
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Les termes à essayer dans l'ordre pour retrouver un concurrent · le nom
 * nettoyé d'abord (le plus susceptible de matcher), puis le nom brut si le
 * nettoyage l'a changé. Vides écartés, doublons fusionnés.
 *
 * Le nom brut reste un repli légitime · une marque peut S'APPELER « X (Paris) »
 * sur sa page. On tente le probable, puis l'exact.
 */
export function variantesRechercheConcurrent(name: string): string[] {
  const brut = (name || '').trim();
  const propre = nettoieNomConcurrent(name);
  const out: string[] = [];
  for (const t of [propre, brut]) {
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Le site de la marque · à partir du domaine d'atterrissage, sinon de l'URL. */
export function siteMarque(o: { landingDomain?: string | null; landingUrl?: string | null }): string | null {
  const dom = o.landingDomain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').trim();
  if (dom) return 'https://' + dom;
  if (o.landingUrl) { try { return new URL(o.landingUrl).origin; } catch { return null; } }
  return null;
}
