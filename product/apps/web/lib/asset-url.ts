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
 *
 * ── Pourquoi le mode de service est un TYPE ──────────────────────────────────
 *
 * Première version : `servedAssetUrl` envoyait les images Drive privées vers
 * `/api/asset/[id]`, une route qui ne savait pas les lire · elle les redirigeait
 * vers Google, qui répondait une page de connexion, et la bibliothèque affichait
 * des cadres vides. Le test existait pourtant · il vérifiait **l'adresse**, pas
 * que la porte s'ouvre.
 *
 * Le mode est donc nommé, et la route l'épuise avec un `never` final. Ajouter un
 * quatrième cas casse la compilation tant que la route ne le traite pas · c'est
 * la seule forme de rappel qui ne s'oublie pas.
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
  /** Identifiant chez la source · sans lui, un fichier Drive est intéléchargeable. */
  externalId?: string | null;
}

/**
 * Comment cet asset doit être servi.
 *
 * - `embedded` · les octets sont en base, le proxy les décode.
 * - `drive` · fichier Google privé, le proxy le télécharge avec le jeton.
 * - `direct` · adresse publique, on la donne telle quelle.
 */
export type AssetServing = 'embedded' | 'drive' | 'direct';

export function assetServing(a: AssetAddress): AssetServing {
  if (a.embedded) return 'embedded';
  // Sans identifiant externe on ne saurait pas quoi demander à Drive · mieux
  // vaut tenter l'adresse publique que promettre un proxy qui échouera.
  if (isPrivateDriveUrl(a.url) && a.externalId) return 'drive';
  return 'direct';
}

export function servedAssetUrl(a: AssetAddress): string {
  return assetServing(a) === 'direct' ? a.url : `/api/asset/${a.id}`;
}
