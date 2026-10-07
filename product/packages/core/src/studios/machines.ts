/**
 * Studios · machines d'états uniques (cahier 01 §9.1, plan 06 §4 et §8).
 *
 * Pur. Une transition est autorisée si elle figure dans la table ET si l'acteur
 * qui la demande est celui que la table désigne. Tout le reste est refusé.
 *
 * ── Ce que la table encode ───────────────────────────────────────────────────
 *
 *  · `claimed` = prise en charge par un worker, jamais une seconde réserve.
 *  · `claimed → queued` : bail expiré AVANT soumission prouvée (§8) ; après une
 *    soumission possible, on passe par `reconciliation_required`, jamais par un
 *    nouvel essai aveugle.
 *  · `cancel_requested → persisting` : l'annulation arrive après le succès du
 *    fournisseur · le résultat se conserve (sans s'appliquer au projet courant).
 *  · `completed` dit « fichier stocké, décodable, relié » ; la QUALITÉ est une
 *    machine SÉPARÉE, qui ne bouge que sur un job `completed`.
 *  · Un nouvel essai volontaire est un NOUVEAU job (`parentJobId`), jamais une
 *    transition depuis `failed` ou `cancelled` : les états terminaux sont finaux.
 */

export type EtatProposition = 'draft' | 'proposed' | 'approved' | 'rejected' | 'expired';
export type EtatJob = 'queued' | 'claimed' | 'running' | 'persisting' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled' | 'reconciliation_required';
export type StatutQualite = 'pending' | 'passed' | 'requires_review' | 'rejected';

export type ActeurProposition = 'auteur' | 'utilisateur' | 'systeme';
export type ActeurJob = 'service' | 'worker' | 'finaliseur' | 'utilisateur' | 'reconciliateur';
export type ActeurQualite = 'controle' | 'relecteur';

export const ETATS_PROPOSITION: readonly EtatProposition[] = ['draft', 'proposed', 'approved', 'rejected', 'expired'];
export const ETATS_JOB: readonly EtatJob[] = ['queued', 'claimed', 'running', 'persisting', 'completed', 'failed', 'cancel_requested', 'cancelled', 'reconciliation_required'];
export const STATUTS_QUALITE: readonly StatutQualite[] = ['pending', 'passed', 'requires_review', 'rejected'];

type Table<E extends string, A extends string> = Readonly<Record<E, Readonly<Partial<Record<E, readonly A[]>>>>>;

export const TRANSITIONS_PROPOSITION: Table<EtatProposition, ActeurProposition> = {
  draft: { proposed: ['auteur'], expired: ['systeme'] },
  proposed: { approved: ['utilisateur'], rejected: ['utilisateur'], expired: ['systeme'] },
  approved: {},
  rejected: {},
  expired: {},
};

export const TRANSITIONS_JOB: Table<EtatJob, ActeurJob> = {
  queued: { claimed: ['worker'], cancel_requested: ['utilisateur'], failed: ['worker'] },
  claimed: { running: ['worker'], queued: ['worker'], cancel_requested: ['utilisateur'], failed: ['worker'], reconciliation_required: ['worker'] },
  running: { persisting: ['worker'], cancel_requested: ['utilisateur'], failed: ['worker'], reconciliation_required: ['worker'] },
  persisting: { completed: ['finaliseur'], cancel_requested: ['utilisateur'], failed: ['finaliseur'], reconciliation_required: ['finaliseur'] },
  cancel_requested: { cancelled: ['worker'], persisting: ['worker'], failed: ['worker'], reconciliation_required: ['worker'] },
  reconciliation_required: { persisting: ['reconciliateur'], failed: ['reconciliateur'], cancelled: ['reconciliateur'] },
  completed: {},
  failed: {},
  cancelled: {},
};

export const TRANSITIONS_QUALITE: Table<StatutQualite, ActeurQualite> = {
  pending: { passed: ['controle', 'relecteur'], requires_review: ['controle'], rejected: ['controle', 'relecteur'] },
  requires_review: { passed: ['relecteur'], rejected: ['relecteur'] },
  passed: {},
  rejected: {},
};

export type VerdictTransition = { ok: true } | { ok: false; raison: string };

function decider<E extends string, A extends string>(t: Table<E, A>, nom: string, de: E, vers: E, acteur: A): VerdictTransition {
  const depuis = t[de];
  if (!depuis) return { ok: false, raison: `${nom} · état de départ inconnu « ${de} »` };
  const acteurs = depuis[vers];
  if (!acteurs) return { ok: false, raison: `${nom} · transition ${de} → ${vers} interdite` };
  if (!acteurs.includes(acteur)) return { ok: false, raison: `${nom} · ${de} → ${vers} réservée à ${acteurs.join(' ou ')}` };
  return { ok: true };
}

export function transitionProposition(de: EtatProposition, vers: EtatProposition, acteur: ActeurProposition): VerdictTransition {
  return decider(TRANSITIONS_PROPOSITION, 'proposition', de, vers, acteur);
}

export function transitionJob(de: EtatJob, vers: EtatJob, acteur: ActeurJob): VerdictTransition {
  return decider(TRANSITIONS_JOB, 'job', de, vers, acteur);
}

/** La qualité ne change que sur un job `completed` (fichier stocké et relié). */
export function transitionQualite(etatJob: EtatJob, de: StatutQualite, vers: StatutQualite, acteur: ActeurQualite): VerdictTransition {
  if (etatJob !== 'completed') return { ok: false, raison: `qualité · le job doit être completed, il est ${etatJob}` };
  return decider(TRANSITIONS_QUALITE, 'qualité', de, vers, acteur);
}

export const ETATS_JOB_TERMINAUX: readonly EtatJob[] = ['completed', 'failed', 'cancelled'];
export const ETATS_JOB_ACTIFS: readonly EtatJob[] = ['queued', 'claimed', 'running', 'persisting'];

export function jobTerminal(e: EtatJob): boolean {
  return ETATS_JOB_TERMINAUX.includes(e);
}
