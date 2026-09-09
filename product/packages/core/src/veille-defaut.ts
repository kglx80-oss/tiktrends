/**
 * Le mot-clé d'amorçage de la Veille quand l'utilisateur n'a rien tapé.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * En arrivant sur la Veille sans requête, l'écran était vide · un outil de
 * veille qui ne montre rien tant qu'on ne cherche pas rate son premier rôle,
 * donner à voir le marché. On amorce donc un affichage par défaut : les
 * gagnants installés, cadrés sur la catégorie de la marque active quand on la
 * connaît, sinon une niche large par défaut.
 *
 * Le « bon filtre » n'est pas posé d'instinct · c'est le proxy de gagnant déjà
 * recommandé partout dans l'app (tri « plus anciennes » + statut actif +
 * ancienneté minimale), appliqué au mot-clé d'amorçage. L'utilisateur reste
 * libre · une recherche ou une thématique reprend la main.
 */
export const NICHE_DEFAUT = 'skincare';

export function veilleSeedDefaut(o: { category?: string | null }): { seed: string; parCategorie: boolean } {
  const c = o.category?.trim();
  if (c) return { seed: c, parCategorie: true };
  return { seed: NICHE_DEFAUT, parCategorie: false };
}
