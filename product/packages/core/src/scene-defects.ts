/**
 * Les ratés de fabrication d'une scène.
 *
 * ── Ce qu'on ne voyait pas ───────────────────────────────────────────────────
 *
 * On demande au modèle d'image « absolutely NO text » à chaque génération. Il
 * obéit souvent, pas toujours. Quand il désobéit, l'image sort avec une
 * pseudo-accroche en caractères inventés, notre vraie accroche se pose par
 * dessus, et la publicité est perdue. Elle est facturée quand même, affichée
 * dans la grille, et c'est l'humain qui fait le tri à l'œil.
 *
 * Même chose pour un flacon tordu, une main à six doigts, un logo inventé.
 *
 * ── Pourquoi ce n'est PAS un détecteur automatique ───────────────────────────
 *
 * On aurait pu chercher le texte au pixel. Un produit porte légitimement du
 * texte · une étiquette, une contenance, une marque. Un détecteur de pixels ne
 * distingue pas l'étiquette du sous-titre inventé, et un détecteur qui se
 * trompe déclencherait des regénérations, c'est-à-dire des images payées pour
 * corriger des images qui allaient bien.
 *
 * Le constat vient donc du seul endroit qui regarde vraiment l'image et que
 * l'utilisateur a déclenché lui-même · la note. Rien n'est dépensé sans un
 * clic.
 *
 * ── Ce que le vocabulaire fermé apporte ──────────────────────────────────────
 *
 * Un modèle à qui on demande « décris les problèmes » rend une phrase, jamais
 * la même. On ne peut ni compter, ni comparer deux mois, ni décider qu'un
 * moteur d'images en produit plus qu'un autre. Une liste fermée se compte.
 *
 * Pur : ni image, ni réseau, ni modèle.
 */

/** Ce qu'on sait nommer · une liste fermée se compte, une phrase libre non. */
export const SCENE_DEFECTS = [
  'texte_incruste',
  'produit_deforme',
  'anatomie',
  'logo_invente',
  'illisible',
] as const;
export type SceneDefect = typeof SCENE_DEFECTS[number];

export const DEFECT_LABEL: Record<SceneDefect, string> = {
  texte_incruste: 'Du texte est cuit dans l’image',
  produit_deforme: 'Le produit est déformé',
  anatomie: 'Une main ou un visage est anormal',
  logo_invente: 'Un logo inventé apparaît',
  illisible: 'Le sujet est illisible ou absent',
};

/** Ce qu'il faut faire, pas seulement ce qui ne va pas. */
export const DEFECT_FIX: Record<SceneDefect, string> = {
  texte_incruste: 'Régénère la scène · le modèle a ajouté du texte malgré la consigne, ça arrive et ça ne se répare pas au montage.',
  produit_deforme: 'Ajoute une photo produit dans la fiche · le modèle invente les proportions quand il n’en a pas.',
  anatomie: 'Régénère la scène, ou choisis un univers sans personnage.',
  logo_invente: 'Régénère la scène · un logo inventé sur une pub de marque est un risque, pas un détail.',
  illisible: 'Régénère avec un brief plus concret, ou une photo produit en référence.',
};

/**
 * Ceux qui condamnent la publicité, par opposition à ceux qui la desservent.
 *
 * Un produit un peu déformé se discute · une accroche inventée en travers de
 * l'image, non. La distinction sert à ne pas crier au loup : si tout est
 * « grave », plus rien ne l'est et l'écran redevient décoratif.
 */
const REDHIBITOIRES = new Set<SceneDefect>(['texte_incruste', 'logo_invente', 'illisible']);

export function estRedhibitoire(d: SceneDefect): boolean {
  return REDHIBITOIRES.has(d);
}

/** Ne garde que ce qu'on sait nommer · un modèle rend parfois autre chose. */
export function defautsConnus(bruts: readonly unknown[] | null | undefined): SceneDefect[] {
  if (!Array.isArray(bruts)) return [];
  const vus = new Set<SceneDefect>();
  for (const b of bruts) {
    if (typeof b === 'string' && (SCENE_DEFECTS as readonly string[]).includes(b)) vus.add(b as SceneDefect);
  }
  return SCENE_DEFECTS.filter((d) => vus.has(d));
}

export interface VerdictDefauts {
  defauts: SceneDefect[];
  /** Au moins un raté condamne la publicité. */
  grave: boolean;
  /** Ce qu'on dit, en une phrase · vide quand il n'y a rien à dire. */
  resume: string;
}

/**
 * Ce qu'on affiche à partir d'une liste de ratés.
 *
 * Le silence est une réponse valable · une publicité sans raté n'a pas besoin
 * d'un encadré vert pour le dire, elle a besoin qu'on la laisse tranquille.
 */
export function verdictDefauts(bruts: readonly unknown[] | null | undefined): VerdictDefauts {
  const defauts = defautsConnus(bruts);
  if (!defauts.length) return { defauts, grave: false, resume: '' };
  const grave = defauts.some(estRedhibitoire);
  const resume = grave
    ? 'Cette scène est à refaire · ce que le modèle a ajouté ne se corrige pas au montage.'
    : 'Cette scène est utilisable, mais elle a un défaut de fabrication visible.';
  return { defauts, grave, resume };
}

/**
 * La note ne peut pas ignorer ce que l'œil voit.
 *
 * Une publicité avec une fausse accroche cuite dans l'image ne « manque pas un
 * peu de clarté » · elle est inutilisable. Laisser le modèle rendre 68 sur 100
 * avec un raté rédhibitoire en dessous, c'est publier la note et enterrer le
 * constat, ce qui est exactement l'inverse du service rendu.
 *
 * Le plafond n'invente pas une note, il refuse d'en laisser passer une qui
 * contredit ce qui est écrit juste en dessous.
 */
export const PLAFOND_SI_GRAVE = 35;

export function plafonner(score: number, grave: boolean): number {
  const n = Math.max(0, Math.min(100, Math.round(score || 0)));
  return grave ? Math.min(n, PLAFOND_SI_GRAVE) : n;
}
