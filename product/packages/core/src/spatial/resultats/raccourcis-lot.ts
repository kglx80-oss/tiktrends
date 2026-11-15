import { ANCRE_CONCLURE_LOT, RAISON_GESTE_RIEN_A_CONCLURE, RAISON_GESTE_SANS_GAGNANTE_LOT, gagnanteArbitree } from '../jarvis/gestes';
import { lienIterationVariable } from '../studios/iterer-variable';
import { lotConcluable, type EtatLotSpatial, type FaitsAdSpatial } from './lots';
import type { GesteGagnante } from '../../studios/activite/iterer-gagnante';

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
 *
 * Lot CONCLU avec une gagnante (#1085 · « Itérer depuis la gagnante » sur la
 * fiche, `gestesGagnantesLot`) · T ouvre LE MÊME geste que le bouton de sa
 * variante · la même adresse (`?lot=<uuid>&gagnante=<uuid>`, celle du geste,
 * jamais recopiée), les mêmes raisons quand il est fermé (rôle, plan) · la
 * variante est celle du verdict du lot d'abord, puis l'ordre du lot, la
 * première OUVERTE (sinon la première, fermée avec sa raison) · le bouton de
 * la touche la nomme (« Itérer depuis V3 ») · le bouton de chaque variante
 * garde « Itérer depuis la gagnante » · deux noms distincts. Sans geste de
 * gagnante (lot pas conclu), T reste celui du lot 13 bis, inchangé.
 */

export const RAISON_ITERER_HORS_PLAN_LOT = 'La gagnante de ce lot n’est pas proposée par le plan d’itération de la marque · Itérer part d’une gagnante que le plan propose.';

/** Le libellé du bouton de la touche T quand il ouvre la gagnante d'un lot conclu · il NOMME la variante (distinct du bouton de la ligne). */
export const libelleToucheIterer = (variante: string) => `Itérer depuis ${variante}`;

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
  /**
   * Les gestes « Itérer depuis la gagnante » de la fiche d'un lot CONCLU, par
   * ad (`gestesGagnantesLot`, déjà calculés par la page) · non vides, T ouvre
   * l'un d'eux · absents ou vides, T reste celui du lot 13 bis.
   */
  depuisGagnante?: Readonly<Record<string, GesteGagnante>> | null;
}

export type GesteClavierIterer = GesteClavierLot & { adId: string | null; libelle?: string };

const verdictDAbord = (ids: readonly string[], gagnante: string | null | undefined) =>
  (gagnante && ids.includes(gagnante) ? [gagnante, ...ids.filter((id) => id !== gagnante)] : [...ids]);

/** T sur un lot CONCLU · le geste d'une de ses gagnantes, tel quel · `null` sans geste (T reste celui du lot 13 bis). */
function itererDepuisGagnante(f: FaitsClavierLot): GesteClavierIterer | null {
  const gestes = f.depuisGagnante;
  if (!gestes) return null;
  const ordre = verdictDAbord(f.ads.map((a) => a.id).filter((id) => !!gestes[id]), f.gagnante);
  const id = ordre.find((x) => !!gestes[x]!.href) ?? ordre[0];
  if (!id) return null;
  const g = gestes[id]!;
  return { href: g.href, adId: id, raison: g.href ? null : g.raison, libelle: libelleToucheIterer(f.ads.find((a) => a.id === id)!.variante) };
}

export function gestesClavierLot(f: FaitsClavierLot): { conclure: GesteClavierLot; iterer: GesteClavierIterer } {
  const concluable = lotConcluable(f.etat, f.ads);
  const gagnantes = f.ads.filter(gagnanteArbitree).map((a) => a.id);
  const ordre = verdictDAbord(gagnantes, f.gagnante);
  const adId = ordre.find((id) => f.planIds.has(id)) ?? null;
  return {
    conclure: concluable ? { href: `#${ANCRE_CONCLURE_LOT}`, raison: null } : { href: null, raison: RAISON_GESTE_RIEN_A_CONCLURE },
    iterer: itererDepuisGagnante(f) ?? (adId
      ? { href: lienIterationVariable({ adId }), adId, raison: null }
      : { href: null, adId: null, raison: gagnantes.length ? RAISON_ITERER_HORS_PLAN_LOT : RAISON_GESTE_SANS_GAGNANTE_LOT }),
  };
}
