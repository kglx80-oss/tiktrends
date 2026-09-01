/**
 * Sous quelle adresse une image de la bibliothèque est servie.
 *
 * ── Pourquoi c'est une fonction, et pas trois lignes dans l'action ───────────
 *
 * C'est ici qu'était le défaut le plus coûteux du produit : une image téléversée
 * est stockée en base sous forme de `data:` URI — jusqu'à six mégaoctets de
 * base64 — et la liste des assets la renvoyait telle quelle. Vingt-quatre
 * vignettes pesaient alors plus lourd que tout le reste de l'application, dans
 * une page qu'aucun cache ne peut aider : le navigateur ne sait pas mettre en
 * cache un morceau de HTML.
 *
 * Sortie de l'action, la règle se teste. Dans un fichier `'use server'` elle ne
 * pouvait pas l'être · tout ce qu'on y exporte devient un point d'entrée réseau.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * **Aucun contenu d'image ne part dans la page.** Ce qui est embarqué en base,
 * et ce qui vit derrière un accès privé, passe par le proxy · le reste garde son
 * adresse d'origine, parce qu'un saut de plus ne servirait à rien.
 */

/** Lien Drive privé · non affichable directement dans une balise `<img>`. */
export function isPrivateDriveUrl(url: string): boolean {
  return /drive\.google\.com|googleusercontent\.com/.test(url);
}

export interface AssetAddress {
  id: string;
  kind: string;
  source: string;
  /** L'adresse telle qu'en base · vide quand le contenu est embarqué. */
  url: string;
  /** Vrai quand la base contient les octets et non une adresse. */
  embedded: boolean;
}

export function servedAssetUrl(a: AssetAddress): string {
  if (a.embedded) return `/api/asset/${a.id}`;
  if (a.kind === 'image' && a.source === 'drive' && isPrivateDriveUrl(a.url)) return `/api/asset/${a.id}`;
  return a.url;
}
