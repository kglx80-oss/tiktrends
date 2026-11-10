import { ANCRE_CONCLURE_LOT, RAISON_GESTE_RIEN_A_CONCLURE, RAISON_GESTE_SANS_GAGNANTE_LOT, gagnanteArbitree } from '../jarvis/gestes';
import { lienIterationVariable } from '../studios/iterer-variable';
import { attendArbitrage, lotArbitrable, type EtatLotSpatial, type FaitsAdSpatial } from './lots';

/**
 * Spatial · Résultats · lot 13 bis · ce que les raccourcis de la fiche d'un
 * lot (C, T · portée « fiche-lot » de la table `RACCOURCIS`) ont le droit
 * d'ouvrir. Pur · ni base, ni réseau, ni horloge.
 *
 * Deux NAVIGATIONS, et rien d'autre · aucune écriture, aucun clic simulé sur
 * une action serveur ·
 *  · C · l'ancre « Conclure le lot » (`#conclure`) · ouverte quand le geste
 *    l'est · même règle que « Conclure le lot » sous une réponse de Jarvis
 *    (lot arbitrable ET un verdict du moteur qui attend d'être arbitré) ;
 *  · T · l'écran Itérer EXISTANT, la gagnante présélectionnée
 *    (`lienIterationVariable`) · même règle que les gestes « Itérer sur ce
 *    persona / cette offre » (`gestesLectureGroupe`) · une gagnante ARBITRÉE
 *    du lot QUI EST dans le plan d'itération de la marque (`planIds`, les
 *    pubs sélectionnables de `choixIterationSpatial`) · celle du verdict du lot
 *    d'abord, puis l'ordre du lot.
 * Fermé, le geste dit pourquoi · la vue l'écrit dans le toast.
 */

export const RAISON_ITERER_HORS_PLAN_LOT = 'La gagnante de ce lot n’est pas proposée par le plan d’itération de la marque · Itérer part d’une gagnante que le plan propose.';

export interface GesteClavierLot {
  /** L'adresse ouverte · `null` · geste fermé. */
  href: string | null;
  /** Pourquoi le geste est fermé · `null` ouvert. */
  raison: string | null;
}

export interface FaitsClavierLot {
  etat: EtatLotSpatial;
  ads: readonly FaitsAdSpatial[];
  /** La gagnante du verdict du lot (`syntheseLot`) · essayée la première. */
  gagnante?: string | null;
  /** Les pubs que le plan d'itération propose (sélectionnables). */
  planIds: ReadonlySet<string>;
}

export function gestesClavierLot(f: FaitsClavierLot): { conclure: GesteClavierLot; iterer: GesteClavierLot & { adId: string | null } } {
  const concluable = lotArbitrable(f.etat) && f.ads.some(attendArbitrage);
  const gagnantes = f.ads.filter(gagnanteArbitree).map((a) => a.id);
  const ordre = f.gagnante && gagnantes.includes(f.gagnante) ? [f.gagnante, ...gagnantes.filter((id) => id !== f.gagnante)] : gagnantes;
  const adId = ordre.find((id) => f.planIds.has(id)) ?? null;
  return {
    conclure: concluable ? { href: `#${ANCRE_CONCLURE_LOT}`, raison: null } : { href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE },
    iterer: adId
      ? { href: lienIterationVariable({ adId }), adId, raison: null }
      : { href: null, adId: null, raison: gagnantes.length ? RAISON_ITERER_HORS_PLAN_LOT : RAISON_GESTE_SANS_GAGNANTE_LOT },
  };
}
