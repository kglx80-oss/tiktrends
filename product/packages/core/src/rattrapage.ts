/**
 * Rattraper une pub entière que la relecture vient de juger cassée.
 *
 * ── Ce qui manquait ──────────────────────────────────────────────────────────
 *
 * Chaque pub entière est relue à la génération · on sait, tout de suite, si
 * l'accroche est restée la nôtre et si le packaging est resté le bon. Mais rien
 * n'AGISSAIT dessus : une pub à l'accroche réécrite ou au produit inventé était
 * livrée telle quelle, et c'était à l'œil de la repérer et de relancer. Un mode
 * qui rend du connu-cassé n'est pas viable.
 *
 * ── Ce que ce fichier décide, et ce qu'il ne fait pas ────────────────────────
 *
 * Il dit QUI reprendre, dans quel ORDRE, s'il faut GARDER la reprise, et COMBIEN
 * en réserver d'avance. Il ne génère rien, ne relit rien, ne dépense rien · tout
 * ça vit dans le serveur, qui appelle ces règles. Ici, c'est pur, donc testable.
 *
 * ── Trois écarts éliminatoires, et un seul est le pire ───────────────────────
 *
 * L'accroche réécrite ou absente change ce que la pub DIT · c'est le plus grave.
 * Le produit modifié la rend suspecte, un texte illisible la rend inutilisable
 * sans la trahir · les deux pèsent pareil, sous l'accroche. Quand le budget de
 * reprise est court, on reprend les plus atteintes d'abord.
 *
 * ── Pourquoi la moitié, et pas tout ──────────────────────────────────────────
 *
 * On borne les reprises à la moitié du lot. Deux raisons. La dépense d'abord :
 * réserver le double d'un lot pour un cas rare serait annoncer un prix qui fait
 * peur pour rien. Le signal ensuite : si plus de la moitié d'un lot est cassée,
 * ce n'est pas un incident à rattraper en douce, c'est la preuve que le mode
 * n'est pas au point · et le débrief qui l'affiche est plus utile qu'une reprise
 * silencieuse qui masquerait le taux.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/** Un constat de relecture, réduit à ce qui décide s'il faut rattraper. */
export interface ConstatRelecture {
  /** L'accroche a été réécrite ou est absente · l'écart le plus grave. */
  accrocheReecrite: boolean;
  /** Le packaging correspond à la référence · `null` quand il n'y en avait pas. */
  produitFidele: boolean | null;
  /** La typographie publicitaire est lisible · `null` quand il n'y a pas de texte. */
  texteLisible?: boolean | null;
}

/**
 * La pub est-elle cassée · accroche réécrite, produit modifié, ou texte illisible.
 *
 * `null` (pas de référence produit, ou pas de texte à juger) n'est pas « cassé » ·
 * c'est « pas regardé », et on ne reprend pas une pub sur un défaut qu'on n'a
 * pas constaté.
 */
export function estCassee(c: ConstatRelecture | null | undefined): boolean {
  if (!c) return false;
  return c.accrocheReecrite || c.produitFidele === false || c.texteLisible === false;
}

/**
 * Combien une pub est cassée · sert à garder la meilleure des deux versions et
 * à traiter les plus atteintes d'abord. L'accroche pèse plus que le reste ·
 * elle change ce que la pub dit, là où un produit modifié ou un texte illisible
 * la rendent inutilisable sans la trahir.
 */
export function graviteControle(c: ConstatRelecture | null | undefined): number {
  if (!c) return 0;
  return (c.accrocheReecrite ? 2 : 0)
    + (c.produitFidele === false ? 1 : 0)
    + (c.texteLisible === false ? 1 : 0);
}

/**
 * La reprise remplace-t-elle l'original ?
 *
 * Seulement si elle est STRICTEMENT meilleure. À gravité égale on garde
 * l'original · la reprise est déjà payée, mais un échange latéral n'achète rien,
 * et rejouer une image un peu moins bonne serait un recul déguisé en correction.
 */
export function reprisePreferable(
  original: ConstatRelecture | null,
  reprise: ConstatRelecture | null,
): boolean {
  return graviteControle(reprise) < graviteControle(original);
}

/**
 * Part du lot qu'on s'autorise à reprendre · voir l'en-tête pour le pourquoi.
 */
export const TAUX_REPRISE = 0.5;

/** Combien d'images de reprise au plus, pour un lot de `count`. */
export function budgetReprises(count: number): number {
  return Math.ceil(Math.max(0, count) * TAUX_REPRISE);
}

/**
 * Combien d'images réserver d'avance pour un lot · base, plus la marge de
 * reprise quand elle s'applique. C'est ce nombre qu'on ANNONCE avant le clic ·
 * le non-utilisé est remboursé, mais le plafond est dit.
 */
export function imagesAReserver(count: number, avecReprise: boolean): number {
  return Math.max(0, count) + (avecReprise ? budgetReprises(count) : 0);
}

/**
 * Quelles pubs reprendre, dans quel ordre · les plus cassées d'abord, bornées
 * au budget. Rend les index dans l'ordre de priorité.
 */
export function indicesARattraper(
  constats: readonly (ConstatRelecture | null)[],
  budget: number,
): number[] {
  return constats
    .map((c, i) => ({ i, g: graviteControle(c) }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, Math.max(0, budget))
    .map((x) => x.i);
}
