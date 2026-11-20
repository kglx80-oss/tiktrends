/**
 * Ranger une ad dans un lot, ou l'en retirer · SOURCE UNIQUE de la décision.
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * L'écran de composition ne propose que les ads HORS LOT de la marque active ·
 * l'action serveur, elle, ne vérifiait que l'ESPACE de l'ad. Appelée
 * directement, elle rangeait l'ad d'une marque Y dans le lot d'une marque X du
 * même espace. Une ad n'a pas de colonne marque · elle s'y rattache par son
 * graphe (concept → angle → désir → persona → marque), et toutes les lectures du
 * lot passent par ce graphe · l'ad étrangère n'apparaît sur aucun écran de X,
 * personne ne peut l'arbitrer, mais l'Accueil (lecture par lot) la compte · le
 * lot ne passe jamais pour conclu et reste à vie « fin prévue passée ».
 *
 * Le même appel direct retirait, depuis un lot en préparation, une ad rangée
 * dans un AUTRE lot · y compris un lot déjà lancé, dont les dépenses cessaient
 * alors d'être comparables.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  1. un lot lancé ou analysé est un témoin · on n'y range ni n'en retire rien ;
 *  2. l'ad doit appartenir à la marque du lot (par son graphe, dans le même
 *     espace) · sinon elle est « introuvable », le même mot qu'elle soit d'une
 *     autre marque ou d'un autre espace (on ne révèle pas qu'elle existe) ;
 *  3. ranger · l'ad est hors lot, ou déjà dans CE lot (double clic) ;
 *     retirer · l'ad est dans CE lot, ou déjà hors lot (double clic) ·
 *     jamais on ne la fait sortir d'un autre lot.
 *
 * Pur : ni base, ni horloge, ni modèle. La lecture du graphe reste côté web.
 */

export const RAISON_LOT_DEJA_LANCE = 'Ce lot est déjà lancé · y ajouter une ad maintenant rendrait les dépenses incomparables. Ouvre le lot suivant.';
export const RAISON_AD_HORS_MARQUE_DU_LOT = 'Ad introuvable dans la marque de ce lot · seules ses propres ads peuvent y entrer.';
export const RAISON_AD_DANS_UN_AUTRE_LOT = 'Cette ad est rangée dans un autre lot · retire-la d’abord de ce lot-là.';

export interface EntreeRangementLot {
  /** Le lot visé · déjà lu dans la marque active. */
  lot: { id: string; statut: string };
  /**
   * L'ad telle que lue PAR LE GRAPHE de la marque du lot (même espace) ·
   * `null` quand elle n'y remonte pas (autre marque, autre espace, inconnue).
   */
  ad: { lotId: string | null } | null;
  /** `true` · ranger dans le lot · `false` · l'en retirer. */
  ranger: boolean;
}

export type DecisionRangementLot =
  | { ok: true; /** Le lot que l'ad doit porter après l'écriture. */ lotApres: string | null }
  | { ok: false; raison: string };

const LANCE = new Set(['testing', 'analyzed']);

export function decisionRangementLot(e: EntreeRangementLot): DecisionRangementLot {
  if (LANCE.has(e.lot.statut)) return { ok: false, raison: RAISON_LOT_DEJA_LANCE };
  if (!e.ad) return { ok: false, raison: RAISON_AD_HORS_MARQUE_DU_LOT };
  const ailleurs = e.ad.lotId !== null && e.ad.lotId !== e.lot.id;
  if (ailleurs) return { ok: false, raison: RAISON_AD_DANS_UN_AUTRE_LOT };
  return { ok: true, lotApres: e.ranger ? e.lot.id : null };
}
