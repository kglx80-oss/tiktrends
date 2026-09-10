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

// Mots-outils français · un libellé de catégorie n'est pas un mot-clé de
// recherche. « Entretien et traitement de piscine » cherché tel quel dans le
// copy des pubs ne rend rien · le nom produit (« piscine »), lui, en rend.
const MOTS_OUTILS = new Set([
  'et', 'ou', 'de', 'des', 'du', "d'", 'la', 'le', 'les', "l'", 'un', 'une',
  'aux', 'au', 'à', 'a', 'pour', 'en', 'sur', 'par', 'avec', 'sans', 'chez',
]);

/**
 * Le mot-clé cherchable d'un libellé de catégorie.
 *
 * On retire la parenthèse de précision, on coupe à la première barre ou virgule
 * (une liste de sous-catégories n'est pas une requête), puis on garde le dernier
 * mot significatif · en français, le nom produit ferme le plus souvent la
 * phrase (« traitement de PISCINE », « compléments ALIMENTAIRES »). À défaut, le
 * libellé nettoyé.
 */
export function motCleCategorie(categorie: string): string {
  const nettoye = categorie.replace(/\([^)]*\)/g, ' ').split(/[/,]/)[0]!.trim();
  const mots = nettoye.toLowerCase().split(/\s+/).filter((m) => m && !MOTS_OUTILS.has(m));
  return mots.length ? mots[mots.length - 1]! : nettoye || categorie.trim();
}

export function veilleSeedDefaut(o: { category?: string | null }): { seed: string; parCategorie: boolean } {
  const c = o.category?.trim();
  if (c) return { seed: motCleCategorie(c), parCategorie: true };
  return { seed: NICHE_DEFAUT, parCategorie: false };
}
