/**
 * La NATURE d'un lot · suivi dans l'outil, ou importé (historique) · SOURCE UNIQUE.
 *
 * ── Le problème (CDC v8 · R04 · lot 29) ──────────────────────────────────────
 *
 * Un lot importé s'affiche « Analysé » alors qu'il contient des ads « Brouillon »
 * incomplètes. Lu avec la grille opérationnelle, c'est une contradiction · un lot
 * analysé dont les ads ne sont même pas prêtes. La lecture juste est autre · ce
 * lot n'a pas été analysé PAR l'outil, il a été REPRIS d'un outil tiers, déjà
 * analysé là-bas, et ses ads sont des enregistrements historiques, parfois
 * partiels. Le statut « Analysé » y désigne un verdict importé, pas une étape de
 * notre parcours.
 *
 * ── La règle, tirée des FAITS (jamais réécrite) ──────────────────────────────
 *
 * Le parcours opérationnel ne pose « analysé » qu'APRÈS un lancement · lancer un
 * lot écrit `launchedAt` et passe en « testing » avant tout verdict. Un lot
 * « analysé » SANS `launchedAt` ne peut donc pas venir de ce parcours · c'est un
 * import. On ne convertit rien, on ne touche à aucun statut · on LIT la nature
 * dans les faits déjà présents (statut + date de lancement).
 *
 * Trois dimensions restent distinctes, et cette carte n'en tient qu'une :
 *   1. la NATURE du lot (ici · suivi vs importé) ;
 *   2. le STATUT opérationnel (`batch.status`, où il en est dans le parcours) ;
 *   3. la COMPLÉTUDE de chaque ad (son propre statut · brouillon, prête…).
 * Un lot importé peut être « Analysé » (statut) ET contenir des ads « Brouillon »
 * (complétude) sans contradiction · c'est justement ce que la nature explique.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

export type NatureLot = 'suivi' | 'importe';

export interface FaitsLot {
  /** Statut opérationnel du lot (`adsmap_batch_status`). */
  status: string;
  /** Date de lancement dans l'outil · `null` si jamais lancé ici. */
  launchedAt: Date | string | null | undefined;
}

/**
 * La nature du lot, lue dans ses faits. « Importé » = analysé sans avoir été
 * lancé ici · le parcours opérationnel ne produit jamais cette combinaison.
 */
export function natureLot(f: FaitsLot): NatureLot {
  const analyse = f.status === 'analyzed';
  const jamaisLance = f.launchedAt == null;
  return analyse && jamaisLance ? 'importe' : 'suivi';
}

/** Vrai si le lot est un historique importé (raccourci lisible). */
export function estLotImporte(f: FaitsLot): boolean {
  return natureLot(f) === 'importe';
}

export interface LibelleNatureLot {
  /** Badge court. `null` pour le cas suivi · rien à signaler, pas de badge. */
  court: string | null;
  /** Phrase de contexte, dite en clair quand la nature mérite une explication. */
  phrase: string | null;
}

/** Le libellé de chaque nature · une seule carte, tous écrans. */
export const LIBELLE_NATURE_LOT: Record<NatureLot, LibelleNatureLot> = {
  suivi: { court: null, phrase: null },
  importe: {
    court: 'Importé · historique',
    phrase:
      'Lot repris d’un outil tiers, déjà analysé là-bas · son statut « Analysé » ' +
      'reflète ce verdict importé, pas une analyse de l’outil. Les ads qu’il ' +
      'contient sont des enregistrements historiques, parfois incomplets ' +
      '(« Brouillon ») · elles ne repassent pas par le protocole et leurs ' +
      'verdicts ne sont pas comparables aux tests suivis ici.',
  },
};

/**
 * Ce qu'on a le droit de faire sur un lot, selon sa nature. Un historique importé
 * est en lecture seule · le relancer ou y ranger des ads n'a pas de sens (il a
 * déjà « eu lieu » ailleurs) et fausserait la comparabilité. Le parcours suivi
 * garde ses actions · ce gate ne les élargit pas, il nomme seulement le cas
 * importé pour que l'écran l'explique au lieu de désactiver en silence.
 */
export function lotEnLectureSeule(f: FaitsLot): boolean {
  return estLotImporte(f);
}
