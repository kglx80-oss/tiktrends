import { jsonCanonique } from '../version';

/**
 * Relance d'une proposition humaine dont la réponse s'est perdue.
 *
 * « Proposer dans ce calque » ne change pas la version : la vue garde la même
 * base, et une relance après une réponse perdue créait une SECONDE proposition
 * identique. La proposition encore ouverte, saisie par la même personne, sur
 * la même base, la même cible et exactement les mêmes changements, EST la
 * même demande : on la rend, rien n'est stocké une seconde fois.
 *
 * Une proposition décidée (approuvée, rejetée), expirée, d'une autre personne,
 * d'une autre base ou d'une autre cible n'est jamais reprise.
 */
export interface DemandeProposition {
  auteurId: string;
  baseVersionId: string;
  cible: string;
  changes: unknown;
}

export interface PropositionOuverte {
  createdBy: string | null;
  baseVersionId: string;
  target: string;
  changes: unknown;
  state: string;
  origin: string;
  expiresAt: Date | null;
}

export function estRejeuProposition(demande: DemandeProposition, existante: PropositionOuverte, maintenant: Date): boolean {
  return existante.origin === 'human'
    && existante.state === 'proposed'
    && (existante.expiresAt === null || existante.expiresAt.getTime() > maintenant.getTime())
    && existante.createdBy === demande.auteurId
    && existante.baseVersionId === demande.baseVersionId
    && existante.target === demande.cible
    && jsonCanonique(existante.changes) === jsonCanonique(demande.changes);
}
