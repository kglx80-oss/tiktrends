/**
 * La requête de « Ce qui scale » · niche large ou marque unique.
 *
 * Le plafond « 3 créas par marque » évite qu'un gros annonceur monopolise un
 * fichier de NICHE. Mais quand on analyse UN domaine (fincutmen.com), c'est
 * justement cette marque qu'on veut voir en entier · le plafond se retourne
 * contre nous et on ne voit que ~10 créas. On détecte donc le cas mono-marque
 * pour chercher par domaine et lever le plafond.
 *
 * Règles pures, donc testables · la page les applique.
 */

/** L'entrée est-elle une URL ou un domaine (une marque précise), pas une niche ? */
export function estMonoMarque(query: string): boolean {
  const q = query.trim();
  return /^https?:\/\//i.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+){1,}(\/|$)/i.test(q);
}

/** Le nom d'hôte nu d'une URL/domaine · « https://www.fincutmen.com/ » → « fincutmen.com ». */
export function hoteRequete(query: string): string {
  const q = query.trim();
  try {
    return new URL(/^https?:\/\//i.test(q) ? q : 'https://' + q).hostname.replace(/^www\./, '');
  } catch {
    return q.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '');
  }
}

/** Plafond de créas par marque · large en mono-marque (on veut tout voir), 3 en niche. */
export function plafondParMarque(query: string): number {
  return estMonoMarque(query) ? 50 : 3;
}
