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
import { FORFAITS_V2, FORFAITS_V2_ORDRE, RANG_FORFAIT, estForfaitActuel, estForfaitV2, nomForfait, type CleForfait, type CleForfaitActuel, type CleForfaitV2 } from './forfaits';

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

/** Les LIMITES d'un forfait · ce qui est compté et refusé au serveur au-delà (liste « Limites » de la carte). */
export function lignesLimites(d: DroitsForfait): string[] {
  return [
    d.marques === null ? 'Marques sans limite' : pluriel(d.marques, 'marque'),
    d.concurrentsParMarque === null ? 'Concurrents suivis sans limite' : `${pluriel(d.concurrentsParMarque, 'concurrent')} suivi${d.concurrentsParMarque > 1 ? 's' : ''} par marque`,
    `Vidéo jusqu’à ${d.videoMaxSecondes} s`,
  ];
}

/** Les FONCTIONS qu'ouvrent les droits d'un forfait (clone, contrôle visuel, support). */
export function lignesFonctionsDroits(d: DroitsForfait): string[] {
  return [
    d.cloneVideo ? 'Clone de pubs vidéo' : 'Clone de pubs image',
    'Contrôle visuel activable · au coût réel, en crédits',
    LIBELLE_SUPPORT[d.support],
  ];
}

/** Les lignes de droits d'un forfait · limites puis fonctions (préavis de bascule). */
export function lignesDroits(d: DroitsForfait): string[] {
  return [...lignesLimites(d), ...lignesFonctionsDroits(d)];
}

/**
 * Le forfait dont les DROITS s'appliquent à un espace · un forfait V2 ne porte
 * ses limites que sous `TARIFS_V2` ; sans l'interrupteur, il se lit comme le
 * forfait actuel dont il reprend les accès (aucune limite · comportement
 * d'aujourd'hui strictement inchangé). Un forfait inconnu se lit comme Starter.
 */
export function forfaitDesDroits(plan: string | null | undefined, tarifsV2: boolean): CleForfait {
  if (estForfaitV2(plan)) return tarifsV2 ? plan : FORFAITS_V2[plan].accesDe;
  return estForfaitActuel(plan) ? plan : 'starter';
}

/** Le premier forfait V2 au-dessus de `p` dont les droits satisfont `ok` · `null` s'il n'y en a pas. */
export function forfaitQuiDebloque(p: CleForfait, ok: (d: DroitsForfait) => boolean): CleForfaitV2 | null {
  return FORFAITS_V2_ORDRE.find((k) => RANG_FORFAIT[k] > RANG_FORFAIT[p] && ok(DROITS_V2[k])) ?? null;
}

const SANS_SUITE = 'C’est le plus grand forfait · écris-nous depuis Support pour aller au-delà.';
const CHANGER = 'change de forfait depuis Réglages · Forfaits.';

/** Refus de créer une marque de plus · `null` = autorisé. Le refus nomme le forfait qui débloque. */
export function refusNouvelleMarque(p: CleForfait, marquesExistantes: number): string | null {
  const max = droitsDuForfait(p).marques;
  if (max === null || marquesExistantes < max) return null;
  const suite = forfaitQuiDebloque(p, (d) => d.marques === null || d.marques > marquesExistantes);
  return `Ton forfait ${nomForfait(p)} inclut ${pluriel(max, 'marque')}. `
    + (suite ? `Le forfait ${nomForfait(suite)} en ouvre ${DROITS_V2[suite].marques} · ${CHANGER}` : SANS_SUITE);
}

/** Refus de suivre un concurrent de plus sur une marque · `null` = autorisé. */
export function refusNouveauConcurrent(p: CleForfait, concurrentsSuivis: number): string | null {
  const max = droitsDuForfait(p).concurrentsParMarque;
  if (max === null || concurrentsSuivis < max) return null;
  const suite = forfaitQuiDebloque(p, (d) => d.concurrentsParMarque === null || d.concurrentsParMarque > concurrentsSuivis);
  return `Ton forfait ${nomForfait(p)} suit ${pluriel(max, 'concurrent')} par marque. `
    + (suite ? `Le forfait ${nomForfait(suite)} en suit ${DROITS_V2[suite].concurrentsParMarque} · ${CHANGER}` : SANS_SUITE);
}

/** Le message de la limite de concurrents d'un forfait (refus d'une liste trop longue) · `null` sans limite. */
export function messageLimiteConcurrents(p: CleForfait): string | null {
  const max = droitsDuForfait(p).concurrentsParMarque;
  return max === null ? null : refusNouveauConcurrent(p, max);
}

/** Refus d'une vidéo finale trop longue · `null` = autorisé. */
export function refusDureeVideo(p: CleForfait, dureeMs: number): string | null {
  const max = droitsDuForfait(p).videoMaxSecondes;
  if (dureeMs <= max * 1000) return null;
  const duree = Math.ceil(dureeMs / 1000);
  const suite = forfaitQuiDebloque(p, (d) => d.videoMaxSecondes * 1000 >= dureeMs);
  return `Ton forfait ${nomForfait(p)} monte les vidéos jusqu’à ${max} s, celle-ci en dure ${duree}. Raccourcis le montage`
    + (suite ? `, ou passe au forfait ${nomForfait(suite)} (${DROITS_V2[suite].videoMaxSecondes} s) · ${CHANGER}` : '.');
}

/** Refus du clone d'une pub en vidéo · `null` = autorisé. */
export function refusCloneVideo(p: CleForfait): string | null {
  if (droitsDuForfait(p).cloneVideo) return null;
  const suite = forfaitQuiDebloque(p, (d) => d.cloneVideo);
  return `Le clone de pubs en vidéo est inclus dès le forfait ${suite ? nomForfait(suite) : 'Pro'} · ton forfait ${nomForfait(p)} clone en image. Pour la vidéo, ${CHANGER}`;
}

/**
 * Refus d'une liste de concurrents enregistrée d'un bloc (formulaire de la
 * marque) · seulement si elle GRANDIT au-delà de la limite. Une liste déjà plus
 * longue (abonné basculé à l'échéance) n'est jamais tronquée ni refusée tant
 * qu'elle ne s'allonge pas · aucune donnée n'est retirée.
 */
export function refusListeConcurrents(p: CleForfait, avant: number, apres: number): string | null {
  if (apres <= avant) return null;
  return refusNouveauConcurrent(p, apres - 1);
}

/** Une liste proposée par l'IA, plafonnée à la limite du forfait (rien n'est retiré d'une liste existante). */
export function plafonnerConcurrents<T>(p: CleForfait, liste: readonly T[]): T[] {
  const max = droitsDuForfait(p).concurrentsParMarque;
  return max === null ? [...liste] : liste.slice(0, max);
}

/** Rang de traitement d'un ticket selon le support du forfait · dédié 2, prioritaire 1, e-mail 0. */
export function prioriteSupport(p: string | null | undefined): number {
  if (!estForfaitV2(p) && !estForfaitActuel(p)) return 0;
  const n = droitsDuForfait(p).support;
  return n === 'dedie' ? 2 : n === 'prioritaire' ? 1 : 0;
}

/**
 * La file du SAV · les tickets d'un support dédié d'abord, puis prioritaire,
 * puis e-mail · l'ordre d'arrivée est gardé à rang égal (tri stable).
 */
export function fileSupport<T extends { plan?: string | null }>(tickets: readonly T[]): T[] {
  return tickets.map((t, i) => ({ t, i, r: prioriteSupport(t.plan) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.t);
}
