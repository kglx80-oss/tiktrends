/**
 * La vignette d'un moteur d'image · ce qu'il fait de mieux, MONTRÉ plutôt que dit.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Le choix du moteur s'affichait en liste de lignes de texte. Une source
 * d'inspiration a tranché le niveau attendu : une grille de cartes, chacune avec
 * un exemple visuel, un nom, une description. On ne peut pas embarquer d'image
 * d'exemple ici (aucun accès réseau, aucune dépense) · alors l'exemple devient un
 * motif dessiné qui INCARNE la force de la famille : un packshot pour la fidélité
 * produit, une typographie nette pour le texte.
 *
 * ── Ce que ce module contient, et ce qu'il ne contient pas ────────────────────
 *
 * Il contient la DONNÉE de la vignette (dégradé, motif, force), pure et testable.
 * Il ne dessine rien · le SVG vit côté web, il ne fait que lire ce descripteur.
 * La famille se déduit de la clé du catalogue · deux variantes d'un même modèle
 * (Nano / Nano Haute) partagent la vignette de leur famille, parce qu'elles
 * partagent la force.
 */

/** La famille d'un moteur · ce qui décide de sa vignette et de sa force. */
export type FamilleMoteur = 'nano' | 'gpt' | 'autre';

export interface VignetteMoteur {
  famille: FamilleMoteur;
  /** Les deux teintes du dégradé de fond de la vignette (haut → bas). */
  degrade: readonly [string, string];
  /**
   * Le motif dessiné dans la vignette · ce que la famille fait de mieux, en image.
   * `produit` = un packshot (fidélité produit) · `texte` = une typographie nette.
   */
  motif: 'produit' | 'texte';
  /** La force mise en avant · deux mots posés sur la vignette, comme un exemple nommé. */
  force: string;
}

/**
 * La famille d'un moteur, déduite de sa clé de catalogue.
 *
 * `nano`, `nano_high` → Nano Banana · `gpt2`, `gpt2_high`, `gpt_image` → GPT Image.
 * Tout le reste tombe sur `autre` · une vignette neutre plutôt qu'une erreur.
 */
export function familleMoteur(key: string): FamilleMoteur {
  if (key.startsWith('nano')) return 'nano';
  if (key.startsWith('gpt')) return 'gpt';
  return 'autre';
}

const VIGNETTES: Record<FamilleMoteur, VignetteMoteur> = {
  // Nano Banana · sa force est la fidélité produit · on la montre en packshot,
  // teintes chaudes (la « banane »).
  nano: { famille: 'nano', degrade: ['#3a2a12', '#c9962e'], motif: 'produit', force: 'Fidélité produit' },
  // GPT Image · sa force est le texte net · on la montre en typographie, teintes
  // froides pour contraster avec Nano d'un coup d'œil.
  gpt: { famille: 'gpt', degrade: ['#0e2a2e', '#1f9e8f'], motif: 'texte', force: 'Texte net' },
  // Repli · une famille inconnue reste présentable sans prétendre à une force.
  autre: { famille: 'autre', degrade: ['#2a2a30', '#6b6b78'], motif: 'produit', force: 'Polyvalent' },
};

/** La vignette d'un moteur · toujours définie, y compris pour une clé inconnue. */
export function vignetteMoteur(key: string): VignetteMoteur {
  return VIGNETTES[familleMoteur(key)];
}
