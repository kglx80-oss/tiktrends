/**
 * Studios · L3 · ce que l'écran dit d'un job (lecture pure, cahier 01 §9.1, §9.2).
 *
 * Pur. Projection d'un job et de son registre en un état lisible. Règles :
 *
 *  · un remboursement n'est ANNONCÉ que s'il est écrit au registre (ligne
 *    `release`) · jamais promis pendant une annulation ou une réconciliation ;
 *  · une annulation demandée après l'envoi dit que le fournisseur peut
 *    facturer ;
 *  · `completed` dit « fichier enregistré », pas « validé » : la qualité est
 *    affichée à part ;
 *  · fermer le navigateur n'annule rien : le même job se retrouve par son id
 *    ou par la clé du clic.
 */

import type { EtatJob, StatutQualite } from '../machines';
import { jobTerminal } from '../machines';
import type { BilanRegistre } from './registre';
import type { PreuveSoumission } from './deroulement';

export interface VueJob {
  etat: EtatJob;
  qualite: StatutQualite;
  terminal: boolean;
  annulable: boolean;
  progression: number | null;
  creditsReserves: number;
  creditsRegles: number | null;
  creditsRendus: number | null;
  message: string;
}

const N = (n: number) => `${n} crédit${n > 1 ? 's' : ''}`;

export function vueJob(j: {
  etat: EtatJob;
  qualite: StatutQualite;
  progression?: number | null;
  preuve: PreuveSoumission;
  bilan: BilanRegistre;
}): VueJob {
  const b = j.bilan;
  const rendu = b.release.credits;
  const regle = b.regle ? b.settle.credits : null;
  let message: string;
  switch (j.etat) {
    case 'queued': message = 'En file · rien n’est encore envoyé au fournisseur.'; break;
    case 'claimed': message = 'Pris en charge · préparation de l’envoi.'; break;
    case 'running': message = 'En cours chez le fournisseur · tu peux fermer cette page, le travail continue.'; break;
    case 'persisting': message = 'Résultat reçu · enregistrement du fichier en cours.'; break;
    case 'completed':
      message = j.qualite === 'requires_review' ? 'Terminé · fichier enregistré, à relire avant usage.'
        : j.qualite === 'passed' ? 'Terminé · fichier enregistré et accepté.'
        : j.qualite === 'rejected' ? 'Terminé · fichier enregistré, écarté à la relecture.'
        : 'Terminé · fichier enregistré.';
      break;
    case 'failed':
      message = b.release.credits > 0 ? `Échec · ${N(rendu)} rendu${rendu > 1 ? 's' : ''}.` : 'Échec · aucun crédit consommé en plus de ce qui est indiqué.';
      break;
    case 'cancel_requested':
      message = j.preuve === 'aucune'
        ? 'Annulation demandée · rien n’était parti, l’arrêt est en cours.'
        : 'Annulation demandée · l’envoi était parti, le fournisseur peut encore facturer. Le coût réel sera réconcilié.';
      break;
    case 'cancelled':
      message = b.release.credits > 0 ? `Annulé · ${N(rendu)} rendu${rendu > 1 ? 's' : ''}.` : 'Annulé.';
      break;
    case 'reconciliation_required':
      message = 'Vérification en cours chez le fournisseur · rien n’est relancé, le coût sera réconcilié.';
      break;
  }
  return {
    etat: j.etat,
    qualite: j.qualite,
    terminal: jobTerminal(j.etat),
    annulable: j.etat === 'queued' || j.etat === 'claimed' || j.etat === 'running' || j.etat === 'persisting',
    progression: typeof j.progression === 'number' ? j.progression : null,
    creditsReserves: b.reserve.credits,
    creditsRegles: regle,
    creditsRendus: b.release.credits > 0 || b.regle ? rendu : null,
    message,
  };
}
