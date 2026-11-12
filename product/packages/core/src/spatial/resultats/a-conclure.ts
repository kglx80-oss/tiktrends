import { CHEMIN_LOTS } from '../../parcours-boucle';
import type { EntreeRail } from '../rail';
import { FILTRES_LOTS, etatLotSpatial, lienLotSpatial, lotConcluable, type ContexteLots, type FaitsEtatLot, type FiltreLots, type PresentationLot } from './lots';

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
export function selectionAConclure<L extends FaitsEtatLot>(lots: readonly L[], c: ContexteLots): L[] {
  return lots.filter((l) => lotConcluable(etatLotSpatial(l, c), l.ads));
}

/* ───────────── UN compte « à conclure » partout · rail, Accueil, liste ───────────── */

/**
 * Le compte « à conclure » · le nombre de lignes de la liste « À conclure »
 * (`/adsmap/lots`, membre ou filtre de l'admin), par la MÊME sélection
 * (`selectionAConclure`, règle `lotConcluable`) · la pastille de Résultats dans
 * le rail et l'Accueil (« À traiter », « À faire maintenant ») le lisent ici,
 * jamais ailleurs. Un membre et un admin de la même marque voient le même
 * nombre · leurs listes rendent les mêmes lots.
 *
 * Ce que l'Accueil comptait avant (constat #1075) · les lots « en diffusion
 * dont la fin prévue est passée », sans regarder les verdicts · la pastille,
 * les seuls lots d'état `a_conclure` (un lot « non concluant » dont des
 * verdicts attendent en sortait). Trois nombres pour une même liste.
 */
export interface CompteAConclure {
  n: number;
  /** Les lots comptés, dans l'ordre de la liste (le plus récent d'abord). */
  lots: ReadonlyArray<{ id: string; numero: number }>;
}

export function compteAConclure(lots: ReadonlyArray<FaitsEtatLot & { id: string; numero: number }>, c: ContexteLots): CompteAConclure {
  const s = selectionAConclure(lots, c);
  return { n: s.length, lots: s.map((l) => ({ id: l.id, numero: l.numero })) };
}

/** Le paramètre d'adresse qui ouvre « Lots de test » sur un filtre (`?filtre=conclure`). */
export const PARAM_FILTRE_LOTS = 'filtre';

/** La liste « À conclure » · là où mènent la tuile « À traiter » et « À faire maintenant » de l’Accueil (le rail garde son entrée, Résultats). */
export const LIEN_A_CONCLURE = `${CHEMIN_LOTS}?${PARAM_FILTRE_LOTS}=conclure`;

/**
 * Le filtre posé à l'ouverture de la liste · celui de l'adresse s'il fait
 * partie des filtres MONTRÉS à cette portée, sinon celui de la portée (un
 * membre n'a que « À conclure », l'admin part de « Tous »).
 */
export function filtreInitialLots(g: Pick<GestesListeLots, 'filtres' | 'filtreInitial'>, demande: unknown): FiltreLots {
  const v = Array.isArray(demande) ? demande[0] : demande;
  return g.filtres.find((f) => f.cle === v)?.cle ?? g.filtreInitial;
}

/**
 * La pastille de Résultats dans le rail (`badge` de la maquette) · posée s'il
 * existe AU MOINS un lot à conclure (le compte de la liste), absente sinon ·
 * le nombre est dit dans son libellé (la maquette dessine un point).
 */
export function pastilleAConclure(c: CompteAConclure): NonNullable<EntreeRail['pastille']> | null {
  if (c.n <= 0) return null;
  return { classe: 'badge', valeur: '', libelle: c.n === 1 ? 'Un lot à conclure' : `${c.n} lots à conclure` };
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
