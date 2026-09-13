/**
 * Quel format Adsmap pour une créa générée au Studio · une règle, donc ici.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * La boucle create→test ne se refermait que pour les PUBS (`kind: 'ad'`) · le
 * pont Studio→Adsmap n'acceptait qu'elles et écrivait `format: 'static'` en
 * dur. Une vidéo ou un visuel — deux des quatre types de créatives, la vidéo
 * étant un type winneur du cap produit — ne pouvaient être poussés en test.
 *
 * Cette table dit, pour chaque type de génération, sous quel FORMAT d'ad il
 * entre dans la carte · et renvoie `null` pour ce qui n'est pas une créative à
 * tester (un script, une copie · ce sont des textes, pas des ads à arbitrer).
 * Elle vit dans le noyau, pas dans le fichier `'use server'` du pont · c'est une
 * décision, elle doit être éprouvée sans base ni réseau.
 */

/** Les types de génération du produit (miroir de `generationKindEnum`). */
export type GenerationKind = 'script' | 'copy' | 'image' | 'video' | 'ad';

/** Les formats d'ad Adsmap (miroir de `adFormatEnum`). */
export type AdFormat =
  | 'video_ugc' | 'video_vsl' | 'video_demo' | 'video_story'
  | 'static' | 'image_carousel' | 'gif';

/**
 * Le format sous lequel une génération entre dans Adsmap, ou `null` si ce type
 * ne se teste pas comme une ad.
 *
 * - `ad` et `image` · un visuel fixe · `static`.
 * - `video` · une vidéo · `video_ugc` (le format vidéo générique, déjà celui des
 *   reprises de veille) · l'utilisateur affine avant le test, la créa entre en
 *   `draft`.
 * - `script`, `copy` · du texte, pas une créative à arbitrer · `null`.
 */
export function formatAdPourGeneration(kind: GenerationKind): AdFormat | null {
  switch (kind) {
    case 'ad':
    case 'image':
      return 'static';
    case 'video':
      return 'video_ugc';
    case 'script':
    case 'copy':
      return null;
  }
}

/** Vrai si cette génération peut être poussée en test dans Adsmap. */
export function generationSuivable(kind: GenerationKind): boolean {
  return formatAdPourGeneration(kind) !== null;
}
