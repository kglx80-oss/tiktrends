import type {
  ChangementLisible, ChampEditable, DisponibiliteJarvis, EtatProposition, ErreurStudio, MotifIndisponibilite, NatureNoeud,
} from '@tiktrends/core';

/**
 * Formes rendues par les commandes « propositions » · données seulement
 * (sérialisables), lues par l'écran. Aucun import serveur ici : le panneau
 * (composant client) importe ces TYPES, jamais le dépôt.
 */

export type OrigineProposition = 'jarvis' | 'agent' | 'human';

export interface NoeudPresente { id: string; libelle: string; nature: NatureNoeud }

export interface ImpactPresente {
  planId: string;
  planHash: string;
  aRefaire: NoeudPresente[];
  reutilisees: NoeudPresente[];
  obsoletes: NoeudPresente[];
  /** Sorties dont l'empreinte change avec la proposition. */
  touchees: NoeudPresente[];
  creditsIndicatifs: number;
  nonTarifees: string[];
}

export interface PropositionPresentee {
  id: string;
  projectId: string;
  origine: OrigineProposition;
  libelleOrigine: string;
  etat: EtatProposition;
  libelleEtat: string;
  cible: string;
  libelleCible: string;
  baseVersion: { id: string; n: number };
  /** « Plan 2 · version 7 ». */
  libelleCibleVersion: string;
  /** Ouverte, mais la base n'est plus la version courante · l'application rendra 409. */
  perimee: boolean;
  changements: ChangementLisible[];
  explication: string;
  sources: string[];
  impact: ImpactPresente | null;
  creeLe: string;
  expireLe: string | null;
  decideLe: string | null;
  versionAppliquee: { id: string; n: number } | null;
}

export interface CiblePresentee { cible: string; libelle: string; champs: ChampEditable[] }

export interface ListePropositions {
  projectId: string;
  versionCourante: { id: string; n: number };
  propositions: PropositionPresentee[];
  jarvis: DisponibiliteJarvis;
  peutProposer: boolean;
  cibles: CiblePresentee[];
}

/** Erreur commune, avec le motif précis d'une indisponibilité (release absente…). */
export type ErreurProposition = ErreurStudio & { motif?: MotifIndisponibilite | 'QUESTIONS' };

export type ReponseProposition<T> = ({ ok: true } & T) | ErreurProposition;

export type ResultatProposer =
  | { statut: 'proposee'; projectId: string; proposition: PropositionPresentee; runId: string | null }
  | { statut: 'questions'; projectId: string; questions: string[]; avertissements: string[]; runId: string | null };

export interface ResultatApplication {
  projectId: string;
  proposition: PropositionPresentee;
  version: { id: string; n: number };
  /** Vrai si la proposition était déjà appliquée (double clic, second onglet) · rien de réécrit. */
  deja: boolean;
}
