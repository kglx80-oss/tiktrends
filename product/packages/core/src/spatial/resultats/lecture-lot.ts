/**
 * Spatial · Résultats · un lot est lu EN ENTIER, ou il est dit lu en partie.
 * Pur · ni base, ni réseau, ni horloge.
 *
 * Constat (suite de #1116) · la lecture des lots d'une marque était bornée
 * globalement (2 000 variantes, ordre par code de variante, tous lots mêlés).
 * Au-delà, les derniers codes de nombreux lots étaient coupés, et l'état de
 * chacun se calculait sur ce qui restait · un lot dont la variante coupée
 * attendait son arbitrage sortait « Conclu », un lot dont la variante coupée
 * n'avait pas de verdict sortait « À conclure », le compte « à importer »
 * oubliait le lot dont la seule variante sans verdict était coupée, et le
 * formulaire d'arbitrage omettait les variantes coupées.
 *
 * La règle · on ne lit jamais une PARTIE d'un lot · un lot est lu en entier,
 * ou pas du tout. Les lots sont pris du plus récent au plus ancien, chacun
 * avec toutes ses variantes, tant que le budget de la lecture tient
 * (`lotsALire`) · un lot trop grand pour le plafond d'un lot est sauté, la
 * lecture passe au suivant. Un lot que la lecture n'a pas vu en entier
 * (`lotLuEnEntier` · moins de variantes lues que la base n'en compte, sautés
 * ou coupés par une écriture concurrente) n'a pas d'état calculé · il est
 * « Lecture incomplète » (`etatLotSpatial` · `illisible`), compté ni à
 * conclure ni à importer, et la fiche ne propose pas son arbitrage. Un état
 * faux est pire qu'un état « lecture incomplète » · le silence est une
 * conclusion valable.
 */

/** Ce que la lecture des lots d'une marque s'autorise · en variantes. */
export interface BornesLectureLots {
  /** Le total des variantes lues, tous lots confondus. */
  budget: number;
  /** Au-delà, un lot n'est pas lu (jamais une partie de lui) · il ne prend pas le budget des lots plus anciens. */
  plafondParLot: number;
  /**
   * La fiche d'UN lot le lit en entier, hors budget (`lotsALire`, `lotEntier`) · un lot ancien
   * repoussé hors de la liste reste lisible et arbitrable sur sa fiche · au-delà de ce plafond de
   * sécurité, même sa fiche le dit lu en partie (`MESURE_LECTURE_LOT_SEUL`).
   */
  plafondLotSeul: number;
}

/**
 * Le banc de la lecture (pglite, base migrée sur place, 4 cœurs partagés
 * chargés à 28-37, médiane de 9 lectures après 2 à vide, trois passages, toutes
 * les colonnes d'un passage mesurées en alternance · la charge de la machine
 * pèse sur toutes à la fois · banc retiré après mesure). Semis · une GRANDE
 * marque de 4 600 variantes · 400 lots de 8 variantes Meta en diffusion ou
 * analysés, un verdict calculé sur deux, un lot de 1 000 brouillons au milieu
 * (#201), 400 annonces hors lot · une PETITE marque de 270 variantes · 40 lots
 * de 6, 30 hors lot. Colonnes · le budget (`avant` · la borne globale de main,
 * 2 000 variantes par code, tous lots et hors lot mêlés) · les variantes de
 * lots lues · les lots lus en entier · la lecture du rail (`chargerFaitsRail`,
 * les DEUX pastilles, à chaque page de la coquille d'un admin) et la lecture
 * complète (`chargerLots`, les écrans de Résultats) · requêtes d'une lecture ·
 * le rail · lots et comptes (une requête), variantes, réglages · la liste · en
 * plus le protocole et les annonces hors lot, lues à part (bornées à 2 000,
 * aucun état n'est calculé sur elles).
 *
 * Avant, la grande marque · 1 600 variantes de lots lues, 3 ou 4 sur 8 dans
 * CHAQUE lot · aucun lot lu en entier, tous avaient un état calculé quand même.
 *
 * Lecture · à 2 000, le rail coûte ce qu'il coûtait (médianes 47 à 63 ms contre
 * 49 à 74, puis 49 à 54 contre 49 à 59 au second banc) · la petite marque,
 * 8,5 à 11,9 ms contre 8,6 à 9,8 (le compte précède la lecture, une requête
 * de plus en série) · la liste 10 à 25 % au-dessus (les 400 annonces hors lot
 * ne prennent plus le budget des lots, elles s'ajoutent). À 3 000, le rail
 * monte de 30 à 50 % et la liste de 50 à 100 % · à 1 000, la moitié des lots
 * de la grande marque ne seraient plus lus. Retenu · 2 000, le coût d'avant
 * pour le rail, au pied de la marche · le plafond d'un lot ne change pas le
 * coût (le budget le borne) · il empêche seulement qu'un lot énorme et récent
 * prive tous les plus anciens · au quart du budget, un lot au plafond laisse
 * les trois quarts aux autres (le lot de 1 000 brouillons est sauté, les 250
 * lots les plus récents sont lus en entier).
 */
export const MESURE_LECTURE_LOTS = [
  { marque: 'grande', budget: 'avant', variantesDeLotsLues: 1600, lotsLusEnEntier: '0 sur 401', requetesRail: 3, railMs: [74.1, 53.5, 51.1], requetesListe: 4, listeMs: [97.7, 87.6, 100.8] },
  { marque: 'grande', budget: 1000, variantesDeLotsLues: 1000, lotsLusEnEntier: '125 sur 401', requetesRail: 3, railMs: [39.1, 34.1, 33.6], requetesListe: 5, listeMs: [85.6, 60.5, 71.6] },
  { marque: 'grande', budget: 2000, variantesDeLotsLues: 2000, lotsLusEnEntier: '250 sur 401', requetesRail: 3, railMs: [63.4, 47.3, 50.9], requetesListe: 5, listeMs: [119.0, 96.6, 95.8] },
  { marque: 'grande', budget: 3000, variantesDeLotsLues: 3000, lotsLusEnEntier: '375 sur 401', requetesRail: 3, railMs: [88.1, 67.3, 65.6], requetesListe: 5, listeMs: [199.8, 144.5, 147.6] },
  { marque: 'grande', budget: 4000, variantesDeLotsLues: 3200, lotsLusEnEntier: '400 sur 401', requetesRail: 3, railMs: [88.6, 73.8, 71.8], requetesListe: 5, listeMs: [185.7, 139.0, 154.5] },
  // Second banc, même semis · avant, 2 000, 3 000 et la petite marque dans les mêmes passages.
  { marque: 'grande', budget: 'avant', variantesDeLotsLues: 1600, lotsLusEnEntier: '0 sur 401', requetesRail: 3, railMs: [48.8, 58.7, 50.6], requetesListe: 4, listeMs: [88.5, 101.0, 81.7] },
  { marque: 'grande', budget: 2000, variantesDeLotsLues: 2000, lotsLusEnEntier: '250 sur 401', requetesRail: 3, railMs: [53.5, 53.4, 49.3], requetesListe: 5, listeMs: [121.7, 107.2, 112.8] },
  { marque: 'grande', budget: 3000, variantesDeLotsLues: 3000, lotsLusEnEntier: '375 sur 401', requetesRail: 3, railMs: [75.3, 76.1, 68.4], requetesListe: 5, listeMs: [193.9, 180.5, 121.1] },
  { marque: 'petite', budget: 'avant', variantesDeLotsLues: 240, lotsLusEnEntier: '40 sur 40', requetesRail: 3, railMs: [9.6, 9.8, 8.6], requetesListe: 4, listeMs: [11.8, 18.9, 15.8] },
  { marque: 'petite', budget: 2000, variantesDeLotsLues: 240, lotsLusEnEntier: '40 sur 40', requetesRail: 3, railMs: [11.4, 8.5, 11.9], requetesListe: 5, listeMs: [26.1, 25.6, 21.2] },
] as const;

export const BORNES_LECTURE_LOTS: Readonly<BornesLectureLots> = Object.freeze({ budget: 2000, plafondParLot: 500, plafondLotSeul: 500 });

/**
 * Le banc de la lecture d'UN lot par sa fiche (pglite, base migrée sur place,
 * machine chargée à 2,5-5, médiane de 3 lectures après une à vide · banc
 * retiré après mesure). Semis · une marque de 300 lots de 8 (le budget est pris
 * par les plus récents) et, plus anciens, un lot de 500, 1 000, 2 000, 5 000 et
 * 10 000 variantes calculées gagnantes (la fiche propose de les arbitrer
 * toutes). Colonnes · la lecture (`chargerLots` avec `lotEntier`) · la fiche
 * entière rendue (`/adsmap/lots/[id]` · lecture, personas, offres, vue, balisage)
 * · le poids du HTML · 11 requêtes pour la fiche, à toute taille. Témoins · la
 * liste seule 55 à 93 ms · la fiche d'un lot de 8, 125 à 149 ms.
 *
 * Lecture · lire le lot coûte peu (500 · +5 à +30 ms · 5 000 · +220 ms) · c'est
 * la FICHE qui ne tient pas · 1,2 à 1,6 s à 500 (dix fois une fiche ordinaire),
 * 3,9 s à 1 000, 16,6 s à 2 000, 108 s et 13 Mo de HTML à 5 000, 508 s à 10 000.
 * Un lot de 5 000 variantes ne doit pas se lire sur sa fiche. Retenu · 500, le
 * plafond d'un lot de la liste · au-delà, la fiche le dit lu en partie et
 * renvoie à la fiche de test d'une variante, qui l'arbitre seule.
 */
export const MESURE_LECTURE_LOT_SEUL = [
  { variantes: 500, lectureMs: [110, 88, 82, 73], ficheMs: [1596, 1216, 1227, 1288], htmlMo: 1.31 },
  { variantes: 1000, lectureMs: [119, 108, 119], ficheMs: [3900, 3897, 3903], htmlMo: 2.61 },
  { variantes: 2000, lectureMs: [185], ficheMs: [16578], htmlMo: 5.21 },
  { variantes: 5000, lectureMs: [310], ficheMs: [108360], htmlMo: 13.01 },
  { variantes: 10000, lectureMs: [501], ficheMs: [507651], htmlMo: 26.02 },
] as const;

/** Un lot, vu par le choix des lots à lire · son identité et le nombre de ses variantes en base (même portée que la lecture). */
export interface LotACompter {
  id: string;
  variantesEnBase: number;
}

/**
 * Les lots à lire, EN ENTIER · dans l'ordre reçu (le plus récent d'abord) ·
 * un lot est retenu s'il a au plus `plafondParLot` variantes ET qu'elles
 * tiennent dans ce qui reste du budget · sinon il n'est pas lu du tout, et la
 * lecture passe au suivant (un lot plus ancien et plus petit peut encore
 * tenir). Un lot vide est toujours retenu (il ne coûte rien, et il est lu en
 * entier). Le total retenu ne dépasse jamais le budget.
 *
 * `lotEntier` · le lot d'une fiche · les autres lots sont choisis EXACTEMENT
 * comme dans la liste (le budget est calculé sans lui, il n'en libère ni n'en
 * prend), puis il est ajouté s'il a au plus `plafondLotSeul` variantes.
 */
export function lotsALire(lots: ReadonlyArray<LotACompter>, bornes: BornesLectureLots = BORNES_LECTURE_LOTS, lotEntier?: string): Set<string> {
  const out = new Set<string>();
  let reste = bornes.budget;
  for (const l of lots) {
    const n = Math.max(0, l.variantesEnBase);
    if (n > bornes.plafondParLot || n > reste) continue;
    out.add(l.id);
    reste -= n;
  }
  const fiche = lotEntier === undefined ? undefined : lots.find((l) => l.id === lotEntier);
  if (fiche && Math.max(0, fiche.variantesEnBase) <= bornes.plafondLotSeul) out.add(fiche.id);
  return out;
}

/* ───────────── le TYPE d'un lot lu · ses variantes, toutes, ou aucune ───────────── */

/** Un lot que la lecture n'a pas vu en entier · combien la base en compte, combien ont été lues (aucune n'est exposée). */
export interface LecturePartielle {
  variantesEnBase: number;
  variantesLues: number;
}

/**
 * Les variantes d'un lot telles que la lecture les rend · TOUTES (`ads`), ou
 * AUCUNE (`partielle`) · un lot lu en partie n'expose pas de liste qu'on
 * parcourrait comme si elle était complète · `l.ads` vaut `undefined`, chaque
 * dérivé (état, présentation, synthèse, contrôles, conseil, Jarvis, gestes)
 * doit traiter ce cas, sinon le code ne compile pas. Un lot construit à la main
 * avec ses `ads` est lu en entier.
 */
export type VariantesDuLot<A> =
  | { ads: A; partielle?: undefined }
  | { ads?: undefined; partielle: LecturePartielle };

/** Le lot tel que la lecture le rend · `ads` lues ET compte en base égaux · entier · sinon partiel, sans variante. */
export function lectureDuLot<A extends ReadonlyArray<unknown>>(ads: A, variantesEnBase: number): VariantesDuLot<A> {
  return ads.length === variantesEnBase ? { ads } : { partielle: { variantesEnBase, variantesLues: ads.length } };
}

/**
 * Les variantes des lots LUS EN ENTIER, dans l'ordre des lots · les lectures
 * qui portent sur toute la marque (bilans, lectures par persona ou par offre,
 * hypothèses, index par ad) · un lot lu en partie n'en apporte aucune (on ne
 * sait pas lesquelles ont été coupées), et ce choix est écrit ici, une fois.
 */
export function variantesDesLotsLus<L extends VariantesDuLot<ReadonlyArray<unknown>>>(lots: readonly L[]): Array<NonNullable<L['ads']>[number]> {
  return lots.flatMap((l) => (l.partielle ? [] : [...l.ads])) as Array<NonNullable<L['ads']>[number]>;
}

/** Garde de type · le lot est lu en entier, ses `ads` sont là (pour filtrer une liste de lots avant de parcourir leurs variantes). */
export function estLuEnEntier<L extends VariantesDuLot<ReadonlyArray<unknown>>>(l: L): l is Extract<L, { partielle?: undefined }> {
  return !l.partielle;
}

/**
 * Les seules variantes d'un lot, telles que la lecture les rend · TOUTES ou
 * AUCUNE (`partielle`) · ce qu'une règle qui décrit UN lot reçoit (gestes de
 * la fiche, gestes de Jarvis) · jamais un `[]` à la place d'un lot partiel.
 */
export function variantesDe<L extends VariantesDuLot<ReadonlyArray<unknown>>>(l: L): VariantesDuLot<NonNullable<L['ads']>> {
  return l.partielle ? { partielle: l.partielle } : { ads: l.ads as NonNullable<L['ads']> };
}

/** La raison d'un geste fermé sur un lot lu en partie · vraie (rien n'est calculé), avec le recours. */
export const RAISON_GESTE_LECTURE_INCOMPLETE = 'Non calculé · lecture incomplète · arbitre depuis la fiche de test d’une variante.';

/** Le lot est-il lu en entier · ses variantes sont exposées. */
export function lotLuEnEntier(l: VariantesDuLot<ReadonlyArray<unknown>>): boolean {
  return !l.partielle;
}

/** Combien de variantes le lot compte · lu en entier, celles lues · en partie, celles de la base. */
export function nombreVariantes(l: VariantesDuLot<ReadonlyArray<unknown>>): number {
  return l.partielle ? l.partielle.variantesEnBase : l.ads.length;
}

export const TITRE_LECTURE_INCOMPLETE = 'Lecture incomplète';
/** Ce que la fiche dit à la place d'une synthèse, d'un contrôle ou d'un conseil · rien n'est tiré d'une partie du lot. */
export const NON_CALCULE_LECTURE = 'Non calculé · lecture incomplète';

const pl = (k: number, un: string, plusieurs: string) => `${k.toLocaleString('fr-FR')} ${k > 1 ? plusieurs : un}`;
const regle = (b: BornesLectureLots) =>
  `La lecture garde les lots les plus récents, chacun avec toutes ses variantes, jusqu’à ${b.budget.toLocaleString('fr-FR')} variantes en tout et ${b.plafondParLot.toLocaleString('fr-FR')} par lot.`;

/** « 3 variantes lues sur 600 » · « 0 variante lue sur 600 » · `null` lu en entier. */
export function compteLecture(l: VariantesDuLot<ReadonlyArray<unknown>>): string | null {
  if (!l.partielle) return null;
  return `${pl(l.partielle.variantesLues, 'variante lue', 'variantes lues')} sur ${l.partielle.variantesEnBase.toLocaleString('fr-FR')}`;
}

/**
 * Ce que la fiche d'un lot lu en partie dit · `null` lu en entier. `etatCalcule`
 * · faux quand l'état dépendait des variantes (un lot lancé · `illisible`) ·
 * vrai quand le statut seul le donne (en préparation, prêt, historique) · la
 * liste de variantes affichée reste alors une partie du lot.
 */
export function phraseLotLuEnPartie(l: VariantesDuLot<ReadonlyArray<unknown>>, o: { etatCalcule: boolean; fiche?: boolean }, b: BornesLectureLots = BORNES_LECTURE_LOTS): string | null {
  const lu = compteLecture(l);
  if (!lu) return null;
  const suite = o.etatCalcule
    ? 'ses variantes ne sont pas affichées, aucune n’est tirée d’une partie du lot.'
    : 'son état n’est pas calculé sur une partie de ses variantes · il n’est compté ni à conclure ni à importer, et son arbitrage n’est pas proposé ici.';
  // Sur SA fiche, le lot est lu hors budget · lu en partie, il passe le plafond d'un lot seul · le recours est la fiche d'une variante.
  const pourquoi = o.fiche
    ? `Une fiche lit son lot en entier jusqu’à ${b.plafondLotSeul.toLocaleString('fr-FR')} variantes · au-delà, ouvre la fiche de test d’une variante (Résultats · Tests) pour l’arbitrer seule.`
    : regle(b);
  return `${lu} · ${suite} ${pourquoi}`;
}

/** La note de « Lots de test » · combien de lots sont lus en partie · `null` quand tous le sont en entier. */
export function noteLectureLots(lots: ReadonlyArray<VariantesDuLot<ReadonlyArray<unknown>>>, b: BornesLectureLots = BORNES_LECTURE_LOTS): string | null {
  const n = lots.filter((l) => !lotLuEnEntier(l)).length;
  if (n === 0) return null;
  return `${pl(n, 'lot lu', 'lots lus')} en partie · aucun état n’est calculé sur une partie de ${n > 1 ? 'leurs' : 'ses'} variantes · un lot lancé dit « ${TITRE_LECTURE_INCOMPLETE} ». ${regle(b)} Sa fiche le lit en entier jusqu’à ${b.plafondLotSeul.toLocaleString('fr-FR')} variantes.`;
}
