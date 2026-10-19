/**
 * Studios · L3 · reprise et interruption d'une tâche, vues de l'écran (lecture
 * pure, cahier 01 §9.1, matrice V5 Étape 6).
 *
 * Pur. Projette l'état réel d'un job (`EtatJob`) en ce que l'écran doit dire,
 * SANS promesse. La règle load-bearing : quand un job est en
 * `reconciliation_required` (coût incertain chez le fournisseur), la RELANCE
 * est BLOQUÉE tant que le rapprochement n'a pas eu lieu, et on ne promet jamais
 * « aucun débit » · le coût réel sera rapproché et peut avoir été facturé.
 *
 *  · un état actif (file, pris, en cours, enregistrement) n'est pas interrompu,
 *    la relance n'a pas lieu d'être (le travail avance) ;
 *  · `reconciliation_required` est le SEUL état qui bloque une relance : on
 *    attend le rapprochement, jamais un nouvel essai aveugle ;
 *  · un état terminal `failed` / `cancelled` ne bloque PAS : un nouvel essai
 *    volontaire est un NOUVEAU job (cf. `machines.ts`), permis ;
 *  · un pourcentage n'est affiché que s'il est RÉEL (fraction mesurée) · jamais
 *    de pourcentage fabriqué (matrice 6.1 : « pas de pourcentage réel »).
 */

import type { EtatJob } from '../machines';
import { jobTerminal } from '../machines';

export type TonReprise = 'attente' | 'interrompu' | 'termine' | 'echec';

export interface EtatReprise {
  etat: EtatJob;
  /** Tâche interrompue dont le coût est incertain · écran d'interruption dédié. */
  interrompu: boolean;
  /** Le coût réel n'est pas encore connu · il sera rapproché. */
  coutIncertain: boolean;
  /** Aucune relance possible tant que le rapprochement n'a pas eu lieu. */
  relanceBloquee: boolean;
  ton: TonReprise;
  titre: string;
  /** Honnête · ne promet jamais « aucun débit ». */
  explication: string;
}

export const LIBELLES_ETAT_JOB: Readonly<Record<EtatJob, string>> = {
  queued: 'En file',
  claimed: 'Pris en charge',
  running: 'En cours',
  persisting: 'Enregistrement',
  completed: 'Terminé',
  failed: 'Échec',
  cancel_requested: 'Annulation demandée',
  cancelled: 'Annulé',
  reconciliation_required: 'Interrompue · coût incertain',
};

/**
 * L'état d'un job tel que l'écran de reprise le dit. La relance n'est bloquée
 * que par `reconciliation_required` · partout ailleurs elle n'est pas en jeu
 * (états actifs) ou un nouvel essai est un nouveau job (états terminaux).
 */
export function etatReprise(etat: EtatJob): EtatReprise {
  const titre = LIBELLES_ETAT_JOB[etat];
  switch (etat) {
    case 'reconciliation_required':
      return {
        etat, interrompu: true, coutIncertain: true, relanceBloquee: true, ton: 'interrompu', titre,
        explication: 'Le fournisseur a peut-être reçu la demande · le coût réel est en cours de rapprochement et peut avoir été facturé. Aucune relance n’est possible tant que le rapprochement n’a pas eu lieu.',
      };
    case 'cancel_requested':
      return {
        etat, interrompu: false, coutIncertain: true, relanceBloquee: false, ton: 'attente', titre,
        explication: 'Annulation demandée · si l’envoi était déjà parti, le fournisseur peut facturer et le coût sera rapproché.',
      };
    case 'queued':
    case 'claimed':
    case 'running':
    case 'persisting':
      return {
        etat, interrompu: false, coutIncertain: false, relanceBloquee: false, ton: 'attente', titre,
        explication: 'La tâche avance · tu peux fermer cette page, le travail continue.',
      };
    case 'completed':
      return {
        etat, interrompu: false, coutIncertain: false, relanceBloquee: false, ton: 'termine', titre,
        explication: 'Fichier enregistré · ouvre les créations du projet.',
      };
    case 'failed':
      return {
        etat, interrompu: false, coutIncertain: false, relanceBloquee: false, ton: 'echec', titre,
        explication: 'Rien n’a été livré · un nouvel essai est une nouvelle tâche, à lancer depuis l’atelier.',
      };
    case 'cancelled':
      return {
        etat, interrompu: false, coutIncertain: false, relanceBloquee: false, ton: 'echec', titre,
        explication: 'Tâche annulée · un nouvel essai est une nouvelle tâche, à lancer depuis l’atelier.',
      };
  }
}

/**
 * Un pourcentage de progression N'EST affiché QUE s'il est réel : une fraction
 * mesurée dans [0, 1], convertie en entier 0..100. Toute autre valeur (absente,
 * hors borne, non finie) rend `null` · l'écran montre alors l'ÉTAT, jamais un
 * pourcentage fabriqué.
 */
export function progressionLisible(progression: number | null | undefined): number | null {
  if (typeof progression !== 'number' || !Number.isFinite(progression)) return null;
  if (progression < 0 || progression > 1) return null;
  return Math.round(progression * 100);
}

/**
 * Le libellé humain d'une opération de job · fallback honnête sur l'identifiant
 * brut quand l'opération n'est pas connue (jamais une invention).
 */
export function libelleOperationJob(operation: string): string {
  if (operation.startsWith('keyframe:')) return 'Image';
  if (operation === 'controle:vision') return 'Contrôle visuel';
  if (operation === 'detourage') return 'Détourage';
  if (operation === 'extension_decor') return 'Extension de décor';
  if (/video|clip|storyboard|assembl/i.test(operation)) return 'Vidéo';
  if (/speech|voix|voice|parole/i.test(operation)) return 'Voix';
  return operation;
}

/** Vrai si au moins une tâche de la liste est interrompue (bandeau d'alerte). */
export function uneTacheInterrompue(etats: readonly EtatJob[]): boolean {
  return etats.some((e) => etatReprise(e).interrompu);
}

/** Les états actifs regroupés en tête de liste · le travail en cours d'abord. */
export function tacheActive(etat: EtatJob): boolean {
  return !jobTerminal(etat) && etat !== 'reconciliation_required' && etat !== 'cancel_requested';
}
