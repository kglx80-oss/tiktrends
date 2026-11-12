import { FILTRES_LOTS, etatLotSpatial, lienLotSpatial, lotConcluable, type ContexteLots, type FaitsLotSpatial, type FiltreLots, type PresentationLot } from './lots';

/**
 * Spatial · Résultats · « À conclure » ouvert à qui peut ARBITRER.
 * Pur · ni base, ni réseau, ni horloge (l'instant arrive par `ContexteLots`).
 *
 * Constat (lot 13 ter) · la liste « Lots de test » (`/adsmap/lots`) était
 * réservée aux admins (fonction `lots` de la matrice), alors que conclure un
 * lot est ouvert aux membres (`validateVerdictAction`, garde G-adsmap) · un
 * membre qui devait conclure n'avait aucune liste pour trouver ses lots.
 *
 * La liste vit à la MÊME adresse, et sa PORTÉE suit le rôle ·
 *  · `complete` · la fonction `lots` est ouverte (admin) · tous les lots, les
 *    cinq filtres, « Nouveau lot », la barre « Itérer » · inchangé ;
 *  · `a-conclure` · seule la garde de l'arbitrage passe (membre) · les lots de
 *    la marque active qu'on peut conclure (`lotConcluable`, la règle de
 *    « Conclure le lot »), en LECTURE · chaque ligne mène à la fiche du lot, où
 *    l'arbitrage existe déjà. Composer, préparer, lancer, dupliquer ·
 *    n'apparaissent pas, la raison est écrite une fois à côté du filtre.
 *  · ni l'un ni l'autre · refus (la page le dit, rien n'est lu).
 * Aucune permission nouvelle · la lecture s'appuie sur la garde qui autorise
 * déjà l'arbitrage ; les écritures gardent leurs gardes (admin), inchangées.
 */

export type PorteeListeLots = 'complete' | 'a-conclure';

/** Quelle liste voit-on · `null` · aucune (refus). */
export function porteeListeLots(o: { lotsOuverts: boolean; arbitrageOuvert: boolean }): PorteeListeLots | null {
  if (!o.arbitrageOuvert) return null;
  return o.lotsOuverts ? 'complete' : 'a-conclure';
}

/** Les lots qu'on peut conclure, dans l'ordre reçu (celui de la liste · le plus récent d'abord). */
export function selectionAConclure<L extends FaitsLotSpatial>(lots: readonly L[], c: ContexteLots): L[] {
  return lots.filter((l) => lotConcluable(etatLotSpatial(l, c), l.ads));
}

/** Pourquoi la liste d'un membre ne compose rien · écrite à côté du filtre, là où l'admin a « Nouveau lot ». */
export const RAISON_LISTE_A_CONCLURE = 'Composer, préparer, lancer ou dupliquer un lot est réservé aux admins de l’espace · ici, les lots qui attendent ton arbitrage.';

/** La liste d'un membre, vide · ce qui y fera arriver un lot. */
export const VIDE_LISTE_A_CONCLURE = 'Aucun lot n’attend d’arbitrage pour cette marque · un lot arrive ici quand sa fenêtre est écoulée et que le moteur a rendu ses verdicts.';

export interface GestesListeLots {
  /** « Nouveau lot » (`createBatchAction`, admin). */
  creer: boolean;
  /** Les filtres montrés, ordre de la maquette. */
  filtres: ReadonlyArray<{ cle: FiltreLots; libelle: string }>;
  filtreInitial: FiltreLots;
  /** Écrite à côté du filtre quand des gestes de la liste complète sont absents · `null` sinon. */
  raison: string | null;
  /** La barre « Itérer · N itérations conseillées » (le plan d'itération est lu pour elle). */
  boucle: boolean;
}

/** Ce que la liste montre, par portée · l'admin garde tout, le membre ne voit que « À conclure ». */
export function gestesListeLots(portee: PorteeListeLots, o: { admin: boolean }): GestesListeLots {
  if (portee === 'complete') return { creer: o.admin, filtres: FILTRES_LOTS, filtreInitial: 'tous', raison: null, boucle: true };
  return { creer: false, filtres: FILTRES_LOTS.filter((f) => f.cle === 'conclure'), filtreInitial: 'conclure', raison: RAISON_LISTE_A_CONCLURE, boucle: false };
}

/** Le sous-titre de la liste d'un membre · le compte, la marque. */
export function sousListeAConclure(n: number, marque: string): string {
  if (n <= 0) return `Aucun lot à conclure · ${marque}`;
  return `${n} lot${n > 1 ? 's' : ''} à conclure · ${marque}`;
}

/** L'action d'une ligne de la liste « À conclure » · TOUJOURS la fiche du lot (l'arbitrage y vit), jamais l'import. */
export function actionAConclure(p: Pick<PresentationLot, 'id' | 'action'>): PresentationLot['action'] {
  return { libelle: p.action.libelle, href: lienLotSpatial(p.id), primaire: p.action.primaire };
}
