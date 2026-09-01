/**
 * Ranger les univers visuels pour qu'on puisse les choisir à l'œil.
 *
 * ── Pourquoi une liste déroulante ne convient pas ────────────────────────────
 *
 * Un univers visuel est une décision d'image. « Éditorial premium » et
 * « Sombre cinématique » ne se départagent pas en lisant deux libellés · on les
 * reconnaît, ou on ne les choisit pas. Une ligne de texte demande de deviner ce
 * qu'on va obtenir, et le seul moyen de vérifier était de payer une génération.
 *
 * ── Les familles ne sont pas décoratives ─────────────────────────────────────
 *
 * Huit vignettes se parcourent, pas se comparent. La famille répond à la
 * question qu'on se pose vraiment avant de regarder les images : **est-ce qu'on
 * met le produit seul, quelqu'un qui s'en sert, ou une ambiance ?** C'est un
 * choix de direction, et il précède le choix de style.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export type UniverseFamily = 'produit' | 'humain' | 'ambiance' | 'graphique';

export const UNIVERSE_FAMILIES: Array<{ key: UniverseFamily; label: string; hint: string }> = [
  { key: 'produit', label: 'Produit seul', hint: 'Le produit occupe l’image · packshot, flat lay.' },
  { key: 'humain', label: 'Avec quelqu’un', hint: 'Une personne s’en sert · UGC, sport, quotidien.' },
  { key: 'ambiance', label: 'Ambiance', hint: 'L’image raconte un climat · éditorial, nuit, nature.' },
  { key: 'graphique', label: 'Graphique', hint: 'La couleur porte l’image plus que le décor.' },
];

/**
 * Chaque univers appartient à une famille et une seule.
 *
 * Une clé sans famille disparaîtrait de tous les filtres · elle resterait
 * atteignable par « Tous », donc invisible à qui filtre, ce qui est la pire des
 * absences : elle ne se remarque pas.
 */
export const UNIVERSE_FAMILY: Record<string, UniverseFamily> = {
  studio: 'produit',
  flatlay: 'produit',
  lifestyle: 'humain',
  energy: 'humain',
  editorial: 'ambiance',
  cinematic: 'ambiance',
  nature: 'ambiance',
  bold: 'graphique',
};

/**
 * Ce qu'un univers donne, en une phrase.
 *
 * Le prompt existe déjà, mais il est en anglais et écrit pour un modèle · le
 * montrer tel quel demanderait de traduire mentalement une consigne technique
 * pour choisir une ambiance.
 */
export const UNIVERSE_HINT: Record<string, string> = {
  studio: 'Fond uni, lumière douce, zéro décor · le produit et rien d’autre.',
  lifestyle: 'Quelqu’un chez soi, lumière du jour, photo prise au téléphone.',
  editorial: 'Lumière dirigée, beaucoup de vide, allure de magazine.',
  nature: 'Plantes fraîches, bois ou pierre, ombres de feuillage.',
  bold: 'Aplats de couleur vive aux teintes de la marque, contraste franc.',
  cinematic: 'Nuit, ombres profondes, un liseré de lumière sur le produit.',
  flatlay: 'Vu du dessus, quelques accessoires posés autour, lumière égale.',
  energy: 'Mouvement, salle de sport ou plein air, lumière punchy.',
};

/** Le dégradé qui tient lieu d'aperçu tant qu'aucune créa de la marque n'existe. */
export const UNIVERSE_SWATCH: Record<string, string> = {
  studio: 'linear-gradient(135deg,#e9e9ee,#c7c7d1)',
  lifestyle: 'linear-gradient(135deg,#f4c99a,#d98c5f)',
  editorial: 'linear-gradient(135deg,#2b2b33,#6b6b7a)',
  nature: 'linear-gradient(135deg,#8fd39a,#4c8a5a)',
  bold: 'linear-gradient(135deg,#ff5db1,#7a5bff)',
  cinematic: 'linear-gradient(135deg,#141420,#3a2b52)',
  flatlay: 'linear-gradient(135deg,#f0e6da,#cbb79b)',
  energy: 'linear-gradient(135deg,#ff8a3c,#ff3c6e)',
};

/** Clé spéciale du composeur · laisser l'IA varier d'une créa à l'autre. */
export const UNIVERSE_AUTO = 'auto';

export function familyOf(key: string): UniverseFamily | null {
  return UNIVERSE_FAMILY[key] ?? null;
}

/**
 * Filtre une liste d'univers · `null` = tous.
 *
 * « Varié (auto) » traverse tous les filtres. Ce n'est pas un univers, c'est le
 * refus d'en choisir un · le cacher derrière un filtre obligerait à revenir sur
 * « Tous » pour renoncer, ce qui est exactement le geste qu'on veut garder
 * facile.
 */
export function filterUniverses<T extends { key: string }>(list: T[], family: UniverseFamily | null): T[] {
  if (!family) return list;
  return list.filter((u) => u.key === UNIVERSE_AUTO || UNIVERSE_FAMILY[u.key] === family);
}
