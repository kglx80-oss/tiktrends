/**
 * Studios · L3 · décisions du worker (plan 06 §4 et §8, cahier 01 §9.2).
 *
 * Pur. Le worker lit l'état durable (job, tentative) et demande ici QUOI faire.
 * La règle centrale :
 *
 *   « Une lease expirée ne suffit jamais à conclure que l'appel distant n'a pas
 *     eu lieu. »
 *
 * D'où la PREUVE de soumission, lue dans la tentative :
 *
 *   aucune   · pas de clé fournisseur posée · l'appel n'a pas pu partir
 *              (la clé est écrite dans la même transaction que `running`,
 *              AVANT l'appel) ;
 *   possible · clé posée, pas d'identifiant de requête · l'appel a pu partir ;
 *   acceptee · identifiant de requête connu.
 *
 * Lease expirée + aucune ⇒ retour `queued` (reprise unique, aucune seconde
 * réserve). Lease expirée + possible ⇒ on CHERCHE la requête par sa clé si le
 * fournisseur le permet, sinon `reconciliation_required`. Jamais de nouvelle
 * soumission payante à l'aveugle.
 */

import type { ActeurJob, EtatJob } from '../machines';

export type PreuveSoumission = 'aucune' | 'possible' | 'acceptee';

export function preuveSoumission(t: { providerIdempotencyKey: string | null; providerRequestId: string | null } | null): PreuveSoumission {
  if (!t) return 'aucune';
  if (t.providerRequestId) return 'acceptee';
  if (t.providerIdempotencyKey) return 'possible';
  return 'aucune';
}

export type ActionBail =
  | 'remettre_en_file'
  | 'reprendre_suivi'
  | 'chercher_par_cle'
  | 'reconciliation'
  | 'reprendre_finalisation'
  | 'reprendre_annulation'
  | 'rien';

export function decisionBailExpire(etat: EtatJob, preuve: PreuveSoumission, o: { rechercheParCle: boolean }): ActionBail {
  switch (etat) {
    case 'claimed':
      // Une clé ne se pose qu'avec `running` : un job `claimed` n'a rien soumis.
      return preuve === 'aucune' ? 'remettre_en_file' : 'reconciliation';
    case 'running':
      if (preuve === 'acceptee') return 'reprendre_suivi';
      if (preuve === 'possible') return o.rechercheParCle ? 'chercher_par_cle' : 'reconciliation';
      return 'reconciliation';
    case 'persisting':
      return 'reprendre_finalisation';
    case 'cancel_requested':
      return 'reprendre_annulation';
    default:
      return 'rien';
  }
}

export type ActionAnnulation =
  /** Rien n'est parti : on arrête, on libère tout. */
  | 'annuler_sans_frais'
  /** Une requête est en cours chez le fournisseur : demander l'annulation, puis lire l'issue. */
  | 'demander_annulation_distante'
  /** L'appel a pu partir sans qu'on connaisse la requête : la chercher, ou réconcilier. */
  | 'chercher_par_cle'
  | 'reconciliation'
  /** Le résultat est déjà là : il se conserve (sans s'appliquer au projet courant). */
  | 'finaliser';

export function decisionAnnulation(preuve: PreuveSoumission, o: { rechercheParCle: boolean; resultatRecu: boolean }): ActionAnnulation {
  if (o.resultatRecu) return 'finaliser';
  if (preuve === 'aucune') return 'annuler_sans_frais';
  if (preuve === 'acceptee') return 'demander_annulation_distante';
  return o.rechercheParCle ? 'chercher_par_cle' : 'reconciliation';
}

/* ───────────────────────── Statut lu chez le fournisseur ─────────────────── */

export type EtatFournisseur = 'en_cours' | 'reussi' | 'echoue' | 'annule' | 'inconnu';

export type ActionStatut = 'attendre' | 'persister' | 'echec' | 'annule' | 'reconciliation';

/**
 * Ce que l'on fait d'un statut fournisseur, quel que soit son canal (sondage,
 * webhook, réconciliation). `inconnu` sur une requête ACCEPTÉE = issue
 * ambiguë ⇒ réconciliation, jamais une resoumission.
 */
export function decisionStatut(statut: EtatFournisseur): ActionStatut {
  switch (statut) {
    case 'en_cours': return 'attendre';
    case 'reussi': return 'persister';
    case 'echoue': return 'echec';
    case 'annule': return 'annule';
    default: return 'reconciliation';
  }
}

/** L'acteur qui porte une transition décidée depuis un état donné (table de `machines.ts`). */
export function acteurDepuis(etat: EtatJob): ActeurJob {
  return etat === 'reconciliation_required' ? 'reconciliateur' : 'worker';
}

/* ───────────────────────────── Webhooks fournisseur ──────────────────────── */

export type TypeEvenement = 'progress' | 'succeeded' | 'failed' | 'cancelled';

export interface EvenementFournisseur {
  id: string;
  type: TypeEvenement;
  requestId: string;
  /** Clé idempotente de la soumission · retrouve un job dont la réponse s'est perdue. */
  cle?: string;
  /** Secondes epoch, signées avec le corps. */
  emisA: number;
  progression?: number;
  coutUsdMicros?: number | null;
}

/** Fenêtre anti-rejeu · un webhook signé mais ancien est refusé. */
export const TOLERANCE_WEBHOOK_S = 300;

export type VerdictFenetre = 'ok' | 'trop_ancien' | 'futur';

export function fenetreWebhook(emisA: number, maintenantS: number, toleranceS: number = TOLERANCE_WEBHOOK_S): VerdictFenetre {
  if (!Number.isFinite(emisA)) return 'trop_ancien';
  if (emisA < maintenantS - toleranceS) return 'trop_ancien';
  if (emisA > maintenantS + toleranceS) return 'futur';
  return 'ok';
}

/** La chaîne signée · horodatage + corps brut, pour qu'on ne puisse rejouer l'un sans l'autre. */
export function chaineSignee(horodatageS: number | string, corpsBrut: string): string {
  return `${horodatageS}.${corpsBrut}`;
}

export function lireEvenement(x: unknown): EvenementFournisseur | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const types: TypeEvenement[] = ['progress', 'succeeded', 'failed', 'cancelled'];
  if (typeof o.id !== 'string' || !o.id || o.id.length > 200) return null;
  if (typeof o.type !== 'string' || !types.includes(o.type as TypeEvenement)) return null;
  if (typeof o.requestId !== 'string' || !o.requestId || o.requestId.length > 200) return null;
  if (typeof o.emisA !== 'number' || !Number.isFinite(o.emisA)) return null;
  const ev: EvenementFournisseur = { id: o.id, type: o.type as TypeEvenement, requestId: o.requestId, emisA: o.emisA };
  if (typeof o.cle === 'string' && o.cle.length > 0 && o.cle.length <= 200) ev.cle = o.cle;
  if (typeof o.progression === 'number' && Number.isFinite(o.progression)) ev.progression = Math.max(0, Math.min(100, Math.round(o.progression)));
  if (typeof o.coutUsdMicros === 'number' && Number.isInteger(o.coutUsdMicros) && o.coutUsdMicros >= 0) ev.coutUsdMicros = o.coutUsdMicros;
  return ev;
}

export type ActionEvenement = 'progression' | 'persister' | 'echec' | 'annule' | 'ignorer';

/**
 * Un événement, reçu dans N'IMPORTE QUEL ordre et autant de fois que le
 * fournisseur le veut, ne fait avancer l'état qu'une fois et jamais en
 * arrière : un succès dupliqué, un « progrès » arrivé après le succès, un échec
 * contradictoire après la persistance sont IGNORÉS. L'état final est stable.
 */
export function decisionEvenement(etat: EtatJob, type: TypeEvenement): { action: ActionEvenement; raison: string } {
  const actif = etat === 'running' || etat === 'cancel_requested' || etat === 'reconciliation_required';
  if (!actif) {
    const raison = etat === 'persisting' || etat === 'completed' ? 'résultat déjà reçu · doublon ou événement en retard'
      : etat === 'failed' || etat === 'cancelled' ? 'job terminé · état final stable'
      : 'aucune requête soumise pour ce job';
    return { action: 'ignorer', raison };
  }
  if (type === 'progress') return etat === 'running' ? { action: 'progression', raison: 'progrès' } : { action: 'ignorer', raison: 'progrès hors exécution' };
  if (type === 'succeeded') return { action: 'persister', raison: 'succès fournisseur' };
  if (type === 'failed') return { action: 'echec', raison: 'échec fournisseur' };
  // La machine ne connaît pas `running → cancelled` : une annulation que nous
  // n'avons pas demandée est, pour nous, un échec (son coût suit le constat).
  if (etat === 'running') return { action: 'echec', raison: 'annulé côté fournisseur sans demande' };
  return { action: 'annule', raison: 'annulation confirmée par le fournisseur' };
}
