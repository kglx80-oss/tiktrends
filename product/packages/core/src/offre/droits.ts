/**
 * L'offre · les droits par forfait, et les refus qui les appliquent. Pur.
 *
 * Les droits V2 (décision du 29/10, point 6) · marques 1 · 3 · 20 ;
 * concurrents suivis par marque 1 · 5 · 20 ; vidéo finale 15 · 30 · 60 s ;
 * clone de pubs vidéo dès Pro ; support e-mail · prioritaire · dédié ; contrôle
 * visuel activable.
 *
 * Les forfaits ACTUELS gardent leurs droits effectifs d'aujourd'hui jusqu'à
 * l'échéance (point 5) · aucune limite de marques ni de concurrents n'est
 * appliquée par le code aujourd'hui (audit du 29/10, 1.1), la vidéo finale
 * monte à `DUREE_RENDU_MAX_MS` (90 s), le clone vidéo est ouvert. Ces valeurs
 * sont écrites ici pour être COMPARÉES (garde `offre-droits.test.ts`), pas pour
 * retirer quoi que ce soit.
 */
import { DUREE_RENDU_MAX_MS } from '../studios/video/rendu-final';
import { estForfaitV2, type CleForfait, type CleForfaitActuel, type CleForfaitV2 } from './forfaits';

export type NiveauSupport = 'email' | 'prioritaire' | 'dedie';

export interface DroitsForfait {
  /** Marques de l'espace · `null` = sans limite. */
  marques: number | null;
  /** Concurrents suivis par marque · `null` = sans limite. */
  concurrentsParMarque: number | null;
  /** Durée maximale de la vidéo finale, en secondes. */
  videoMaxSecondes: number;
  /** Cloner une pub en VIDÉO depuis la veille (Jarvis · Cloner). */
  cloneVideo: boolean;
  support: NiveauSupport;
  /** Le contrôle visuel d'une image livrée peut être coché au devis. */
  controleVisuelActivable: boolean;
}

export const DROITS_V2: Readonly<Record<CleForfaitV2, DroitsForfait>> = {
  essentiel: { marques: 1, concurrentsParMarque: 1, videoMaxSecondes: 15, cloneVideo: false, support: 'email', controleVisuelActivable: true },
  pro: { marques: 3, concurrentsParMarque: 5, videoMaxSecondes: 30, cloneVideo: true, support: 'prioritaire', controleVisuelActivable: true },
  agence: { marques: 20, concurrentsParMarque: 20, videoMaxSecondes: 60, cloneVideo: true, support: 'dedie', controleVisuelActivable: true },
};

const DROITS_INCHANGES: DroitsForfait = {
  marques: null, concurrentsParMarque: null, videoMaxSecondes: DUREE_RENDU_MAX_MS / 1000, cloneVideo: true, support: 'email', controleVisuelActivable: true,
};

/** Les droits effectifs d'aujourd'hui · inchangés jusqu'à l'échéance. */
export const DROITS_ACTUELS: Readonly<Record<CleForfaitActuel, DroitsForfait>> = {
  starter: DROITS_INCHANGES,
  core: DROITS_INCHANGES,
  plus: DROITS_INCHANGES,
  business: DROITS_INCHANGES,
};

export function droitsDuForfait(p: CleForfait): DroitsForfait {
  return estForfaitV2(p) ? DROITS_V2[p] : DROITS_ACTUELS[p];
}

export const LIBELLE_SUPPORT: Readonly<Record<NiveauSupport, string>> = {
  email: 'Support par e-mail',
  prioritaire: 'Support prioritaire',
  dedie: 'Accompagnement dédié',
};

const pluriel = (n: number, mot: string) => `${n.toLocaleString('fr-FR')} ${mot}${n > 1 ? 's' : ''}`;

/** Les lignes de droits d'une carte de forfait · ce que la page Forfaits affiche. */
export function lignesDroits(d: DroitsForfait): string[] {
  return [
    d.marques === null ? 'Marques sans limite' : pluriel(d.marques, 'marque'),
    d.concurrentsParMarque === null ? 'Concurrents suivis sans limite' : `${pluriel(d.concurrentsParMarque, 'concurrent')} suivi${d.concurrentsParMarque > 1 ? 's' : ''} par marque`,
    `Vidéo jusqu’à ${d.videoMaxSecondes} s`,
    d.cloneVideo ? 'Clone de pubs vidéo' : 'Clone de pubs image',
    'Contrôle visuel activable',
    LIBELLE_SUPPORT[d.support],
  ];
}

/** Refus de créer une marque de plus · `null` = autorisé. */
export function refusNouvelleMarque(p: CleForfait, marquesExistantes: number): string | null {
  const max = droitsDuForfait(p).marques;
  if (max === null || marquesExistantes < max) return null;
  return `Votre forfait inclut ${pluriel(max, 'marque')}. Passez au forfait supérieur pour en ajouter.`;
}

/** Refus de suivre un concurrent de plus sur une marque · `null` = autorisé. */
export function refusNouveauConcurrent(p: CleForfait, concurrentsSuivis: number): string | null {
  const max = droitsDuForfait(p).concurrentsParMarque;
  if (max === null || concurrentsSuivis < max) return null;
  return `Votre forfait suit ${pluriel(max, 'concurrent')} par marque. Passez au forfait supérieur pour en suivre davantage.`;
}

/** Refus d'une vidéo finale trop longue · `null` = autorisé. */
export function refusDureeVideo(p: CleForfait, dureeMs: number): string | null {
  const max = droitsDuForfait(p).videoMaxSecondes;
  if (dureeMs <= max * 1000) return null;
  return `Votre forfait monte les vidéos jusqu’à ${max} s. Raccourcissez le montage ou passez au forfait supérieur.`;
}

/** Refus du clone d'une pub en vidéo · `null` = autorisé. */
export function refusCloneVideo(p: CleForfait): string | null {
  return droitsDuForfait(p).cloneVideo ? null : 'Le clone de pubs vidéo est inclus dès le forfait Pro. Le clone en image reste disponible.';
}
