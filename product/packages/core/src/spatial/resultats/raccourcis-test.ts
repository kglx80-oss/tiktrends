import { lienIterationVariable } from '../studios/iterer-variable';
import { lienLotSpatial } from './lots';
import type { GesteClavierLot } from './raccourcis-lot';

/**
 * Spatial · Résultats · lot 13 ter · ce que les raccourcis de la fiche d'un
 * TEST (T, L · portée « fiche-test » de la table `RACCOURCIS`) ont le droit
 * d'ouvrir. Pur · ni base, ni réseau, ni horloge.
 *
 * Deux NAVIGATIONS, et rien d'autre · aucune écriture, aucun clic simulé ·
 *  · T · l'écran Itérer EXISTANT, CE test présélectionné
 *    (`lienIterationVariable`) · la même règle que T sur la fiche d'un lot
 *    (`gestesClavierLot`) · une gagnante ARBITRÉE que le plan d'itération de
 *    la marque propose (`planIds`, les pubs sélectionnables de
 *    `choixIterationSpatial`) ;
 *  · L · la fiche du lot qui range ce test (`lienLotSpatial`).
 * Fermé, le geste dit pourquoi · la vue l'écrit dans le toast et sous le bouton.
 */

export const RAISON_ITERER_TEST_SANS_GAGNANTE = 'Ce test n’est pas une gagnante arbitrée · une itération part d’une gagnante.';
export const RAISON_ITERER_TEST_HORS_PLAN = 'Ce test n’est pas proposé par le plan d’itération de la marque · Itérer part d’une gagnante que le plan propose.';
export const RAISON_TEST_HORS_LOT = 'Ce test n’est rangé dans aucun lot · il n’y a pas de lot à ouvrir.';

export interface FaitsClavierTest {
  adId: string;
  /** Gagnante au verdict ARBITRÉ (validé, comparable) · la page le lit sur le verdict du test. */
  gagnanteArbitree: boolean;
  /** Les pubs que le plan d'itération propose (sélectionnables). */
  planIds: ReadonlySet<string>;
  /** Le lot qui range le test · `null` hors lot. */
  lot: { id: string; numero: number } | null;
}

export function gestesClavierTest(f: FaitsClavierTest): { iterer: GesteClavierLot; lot: GesteClavierLot & { numero: number | null } } {
  const iterable = f.gagnanteArbitree && f.planIds.has(f.adId);
  return {
    iterer: iterable
      ? { href: lienIterationVariable({ adId: f.adId }), raison: null }
      : { href: null, raison: f.gagnanteArbitree ? RAISON_ITERER_TEST_HORS_PLAN : RAISON_ITERER_TEST_SANS_GAGNANTE },
    lot: f.lot ? { href: lienLotSpatial(f.lot.id), numero: f.lot.numero, raison: null } : { href: null, numero: null, raison: RAISON_TEST_HORS_LOT },
  };
}
