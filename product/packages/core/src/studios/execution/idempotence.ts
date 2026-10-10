/**
 * Studios · L3 · idempotence des commandes (cahier 01 §9.2, plan 06 §4).
 *
 * Pur. Une clé d'idempotence est unique PAR ESPACE (contrainte
 * `studio_jobs_idempotence_uq`). Elle porte l'INTENTION d'un clic :
 *
 *  · même clé + mêmes entrées (même devis, même empreinte) ⇒ le MÊME job,
 *    sans seconde réserve (double clic, délai dépassé, reconnexion) ;
 *  · même clé + entrées différentes ⇒ conflit, rien n'est créé ;
 *  · deux variantes volontaires ⇒ deux clés, deux devis, deux jobs.
 */

/** Même alphabet que les identifiants stables, 1 à 160 caractères (CHECK en base). */
export const MOTIF_CLE_IDEMPOTENCE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function cleIdempotenceValide(x: unknown): x is string {
  return typeof x === 'string' && MOTIF_CLE_IDEMPOTENCE.test(x);
}

export interface EmpreinteCommande {
  quoteId: string;
  inputHash: string;
}

export type DecisionIdempotence = 'nouveau' | 'meme_job' | 'conflit';

export function decisionIdempotence(existant: EmpreinteCommande | null, demande: EmpreinteCommande): DecisionIdempotence {
  if (!existant) return 'nouveau';
  return existant.quoteId === demande.quoteId && existant.inputHash === demande.inputHash ? 'meme_job' : 'conflit';
}

/**
 * Clé transmise au fournisseur · UNE par job, posée AVANT toute soumission.
 * Une seconde tentative du même job réutilise la même clé : un fournisseur qui
 * déduplique ne facture pas deux fois, et la clé permet de retrouver une
 * requête dont la réponse s'est perdue.
 */
export function cleFournisseurDuJob(jobId: string): string {
  return `tt-studio-${jobId}`;
}
