/**
 * V5 · Résultats · l'aperçu « Lots de test » de la vue d'ensemble.
 *
 * Pur · ni base, ni horloge, ni modèle. Il transforme les lots RÉELS de la
 * marque active (ceux que `listBatchesAction` remonte) en un petit modèle de
 * cartes, pour la bande « Lots de test » de la maquette V5.
 *
 * ── La vignette, et ce qu'il NE fait pas (et pourquoi) ───────────────────────
 *
 * La maquette montre, par carte, une vignette (média des variantes) et une barre
 * de progression « X / 14 jours ». La vignette est RÉELLE quand elle existe · on
 * prend le média d'une ad du lot (sa créa persistée, ou son asset) tel qu'il est
 * dans la donnée · jamais une image fabriquée. Un lot sans aucun média rend
 * `thumbUrl: null` et l'écran pose une vignette vide honnête (pas de faux visuel).
 *
 * La progression « X / 14 jours » NE sort pas de cette liste · elle demande la
 * durée du protocole et une horloge · l'inventer serait une donnée fabriquée. Les
 * actions contextuelles par statut (Analyser avec Jarvis, Préparer, Importer)
 * restent à raccorder · elles ne sont pas simulées ici · chaque carte mène au lot
 * réel, où l'action vit.
 *
 * La carte N'AFFICHE AUCUNE PERFORMANCE · un aperçu de lot n'est pas une mesure.
 */

import { estLotImporte } from './lot-nature';

/** Les faits d'un lot, tels que la liste des lots les porte. */
export interface FaitsLotApercu {
  id: string;
  number: number;
  status: string;
  goal: string | null;
  launchedAt: string | null;
  ads: number;
  /**
   * Le média d'une variante du lot, pour la vignette · tel qu'il est dans la
   * donnée (créa persistée ou asset), ou `null` si le lot n'en porte aucun. Jamais
   * une image fabriquée · null se traduit par une vignette vide honnête à l'écran.
   */
  thumbUrl?: string | null;
}

/**
 * La famille du statut · porte la pastille de la carte (maquette V5). La pastille
 * ne fait que RENFORCER le libellé en clair, jamais le remplacer · le sens reste
 * porté par le texte du statut, à côté. L'écran mappe chaque ton à un rôle de
 * couleur sémantique (jamais un littéral).
 */
export type TonStatutLot = 'diffusion' | 'termine' | 'attente' | 'importe';

/** Une carte de l'aperçu · présentation seule, tirée des faits. */
export interface CarteLotApercu {
  id: string;
  /** « Lot #3 ». */
  titre: string;
  /** Le but du lot, ou `null` · jamais un texte substitué. */
  but: string | null;
  /** Le statut opérationnel, en clair. */
  statut: string;
  /** La famille du statut · teinte la pastille (renfort, pas sens unique). */
  ton: TonStatutLot;
  /** Vrai si c'est un historique importé (badge « Importé »). */
  importe: boolean;
  /** Le nombre de variantes (ads rangées dans le lot). */
  variantes: number;
  /** Le média réel d'une variante pour la vignette, ou `null` (vignette vide). */
  thumbUrl: string | null;
  /** Où mène la carte · le lot réel, dans l'onglet Lots de test. */
  href: string;
}

/**
 * Le statut opérationnel d'un lot, dans les mots de la maquette V5 Résultats
 * (« Prêt à lancer », « En diffusion »…) · distinct du libellé plus court de la
 * fiche (`LIBELLE_STATUT_LOT`, studios/variantes/vue), qui ne couvre que cinq
 * statuts. Une clé inconnue retombe sur elle-même plutôt que sur un libellé
 * inventé.
 */
export const STATUT_LOT_RESULTATS: Record<string, string> = {
  planned: 'En composition',
  in_production: 'En production',
  ready: 'Prêt à lancer',
  testing: 'En diffusion',
  analyzed: 'Analysé',
  draft: 'Brouillon',
  proposed: 'Proposé',
  live: 'En diffusion',
  paused: 'En pause',
  done: 'Terminé',
};

/**
 * La famille de couleur d'un statut · un historique importé passe toujours au ton
 * « importe » (c'est ce que la maquette signale en premier), sinon la diffusion
 * porte l'accent, un lot terminé le vert, et tout le reste est en attente.
 * Une clé inconnue retombe en « attente » · jamais une couleur inventée pour un
 * statut qu'on ne connaît pas.
 */
export function tonStatutLot(status: string, importe: boolean): TonStatutLot {
  if (importe) return 'importe';
  if (status === 'testing' || status === 'live') return 'diffusion';
  if (status === 'done' || status === 'analyzed') return 'termine';
  return 'attente';
}

/** Le lien vers un lot réel, dans l'onglet « Lots de test ». */
export function lienLotApercu(id: string): string {
  return `/adsmap/lots?lot=${encodeURIComponent(id)}`;
}

/**
 * L'aperçu « Lots de test » · au plus `max` cartes (4 dans la maquette), les
 * plus récents d'abord (la liste arrive déjà triée du plus récent au plus
 * ancien). Aucune carte n'est fabriquée · une marque sans lot rend un tableau
 * vide, que l'écran traduit en état vide honnête.
 */
export function apercuLotsResultats(lots: readonly FaitsLotApercu[], max = 4): CarteLotApercu[] {
  return lots.slice(0, max).map((l) => {
    const importe = estLotImporte(l);
    return {
      id: l.id,
      titre: `Lot #${l.number}`,
      but: l.goal && l.goal.trim() ? l.goal.trim() : null,
      statut: STATUT_LOT_RESULTATS[l.status] ?? l.status,
      ton: tonStatutLot(l.status, importe),
      importe,
      variantes: l.ads,
      thumbUrl: l.thumbUrl && l.thumbUrl.trim() ? l.thumbUrl.trim() : null,
      href: lienLotApercu(l.id),
    };
  });
}
